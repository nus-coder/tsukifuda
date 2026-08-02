// online.js — PeerJS による P2P 対戦。
// プロトコル:
//   host→guest: {t:'setup', phases}            月齢デッキ共有（guestは player1）
//   両方向:      {t:'commit', round, hash}      選択のSHA-256コミット
//   両方向:      {t:'reveal', round, card, nonce} 平文公開（コミット検証つき）
//   両方向:      {t:'rematch'} / {t:'bye'}
// 両クライアントは決定論的な ENGINE.resolveRound で同一進行する。
'use strict';

const ONLINE = (() => {
  const PREFIX = 'tsukifuda-v1-';
  // NAT越え用のICEサーバー。STUNで直結を試み、失敗したらTURN(metered.ca無料枠)で中継する。
  // TURNの認証情報はクライアントに配布する前提の値（公開ページのJSに埋め込む形が正）。
  //
  // ★TURNが繋がらない（"相手は見つかるが接続不可" / connect-timeout が多発する）場合、
  //   metered.ca 無料枠の期限切れ・転送量クォータ超過を疑うこと。
  //   https://dashboard.metered.ca で新しい username/credential を発行して下記を差し替えるか、
  //   自前の coturn を立てて TURN_SERVERS に追加する。無料枠は突然停止しうる前提で運用する。
  const TURN_SERVERS = [
    { urls: 'turn:global.relay.metered.ca:80', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
    { urls: 'turn:global.relay.metered.ca:443', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
  ];
  // STUNは複数系統を並べ、1系統が不調でも直結判定が止まらないようにする。
  const ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    ...TURN_SERVERS,
  ];
  const PEER_OPTS = { config: { iceServers: ICE_SERVERS } };
  const CONNECT_TIMEOUT = 15000;     // データチャネル確立の待ち時間
  const MAX_BROKER_ATTEMPTS = 3;     // ブローカー登録/接続の作り直し再試行回数
  // 公開ブローカー(0.peerjs.com)の一時的な不調で作り直して良いエラー種別。
  // 'peer-unavailable'（部屋が存在しない＝合言葉違い）は含めない＝そのまま利用者に通知する。
  const RETRYABLE = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id']);

  let peer = null, conn = null;
  let handlers = {};
  let intentionalClose = false;      // close() による意図的な切断か（自動再接続を抑止するため）

  // ブローカーとの接続が切れても部屋/接続を維持する（無料公開ブローカーは瞬断が多い）。
  function autoReconnect() {
    if (intentionalClose || !peer || peer.destroyed) return;
    try { peer.reconnect(); } catch (_) {}
  }

  function randomCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 紛らわしい文字は除外
    let s = '';
    const buf = new Uint32Array(5);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 5; i++) s += chars[buf[i] % chars.length];
    return s;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function nonceHex() {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function wireConn(c) {
    conn = c;
    conn.on('data', msg => {
      if (typeof msg !== 'object' || msg === null) return;
      handlers.onMessage?.(msg);
    });
    conn.on('close', () => handlers.onDisconnect?.());
    conn.on('error', () => handlers.onDisconnect?.());
    // 診断ログ: 接続不可(connect-timeout)が broker と ICE(TURN) のどちらで
    // 止まっているかを切り分けるため、ICEの状態遷移をコンソールに出す。
    //   'checking' で止まる → NAT越え/TURN側の問題（TURN認証やポート閉塞を疑う）
    //   'checking' に到達しない → signaling/broker 側の問題
    // 選択された候補が relay なら TURN 中継が効いている証拠。
    conn.on('iceStateChanged', state => {
      console.info('[tsukifuda/online] ICE state:', state);
      if (state === 'connected' || state === 'completed') {
        try {
          conn.peerConnection?.getStats().then(stats => {
            stats.forEach(r => {
              if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
                const local = stats.get(r.localCandidateId);
                console.info('[tsukifuda/online] selected candidate type:', local?.candidateType);
              }
            });
          });
        } catch (_) {}
      }
    });
  }

  // 部屋を作る（ホスト = player0）。合言葉は onReady で通知する。
  function host(h) {
    handlers = h;
    intentionalClose = false;
    let attempts = 0;

    (function attempt() {
      const code = randomCode();
      peer = new Peer(PREFIX + code, PEER_OPTS);
      peer.on('open', () => h.onReady?.(code));
      peer.on('connection', c => {
        if (conn) { c.close(); return; } // 3人目は拒否
        wireConn(c);
        // 相手は来たがP2Pが確立しない（NAT越え失敗）ケースを検出
        const t = setTimeout(() => {
          if (!c.open) {
            try { c.close(); } catch (_) {}
            conn = null;
            h.onError?.({ type: 'connect-timeout' });
          }
        }, CONNECT_TIMEOUT);
        c.on('open', () => { clearTimeout(t); h.onConnected?.(); });
      });
      peer.on('disconnected', autoReconnect);
      peer.on('error', e => {
        // 相手がまだ来ておらず、部屋登録がブローカー不調/ID衝突で失敗したときは
        // 合言葉を作り直して再挑戦する（公開ブローカーの瞬断対策）。
        if (!conn && RETRYABLE.has(e?.type) && attempts < MAX_BROKER_ATTEMPTS) {
          attempts++;
          try { peer.destroy(); } catch (_) {}
          setTimeout(attempt, 600 * attempts);
          return;
        }
        h.onError?.(e);
      });
    })();
  }

  // 部屋に入る（ゲスト = player1）
  function join(code, h) {
    handlers = h;
    intentionalClose = false;
    const targetId = PREFIX + code.toUpperCase();
    let attempts = 0;

    (function attempt() {
      peer = new Peer(PEER_OPTS);
      peer.on('open', () => {
        const c = peer.connect(targetId, { reliable: true });
        wireConn(c);
        const t = setTimeout(() => {
          if (!c.open) h.onError?.({ type: 'connect-timeout' });
        }, CONNECT_TIMEOUT);
        c.on('open', () => { clearTimeout(t); h.onConnected?.(); });
      });
      peer.on('disconnected', autoReconnect);
      peer.on('error', e => {
        // ブローカーに繋がらない類のエラーは作り直して数回まで再試行する。
        // 'peer-unavailable'（＝部屋が無い/合言葉違い）は再試行せずそのまま通知。
        if (!conn && RETRYABLE.has(e?.type) && attempts < MAX_BROKER_ATTEMPTS) {
          attempts++;
          try { peer.destroy(); } catch (_) {}
          setTimeout(attempt, 600 * attempts);
          return;
        }
        h.onError?.(e);
      });
    })();
  }

  function send(msg) { if (conn?.open) conn.send(msg); }

  // 自分の選択をコミット→（相手のコミット受信後に main.js が呼ぶ）リビール
  async function makeCommit(round, card) {
    const nonce = nonceHex();
    const hash = await sha256Hex(`${round}:${card}:${nonce}`);
    send({ t: 'commit', round, hash });
    return { card, nonce, hash };
  }
  function sendReveal(round, pending) {
    send({ t: 'reveal', round, card: pending.card, nonce: pending.nonce });
  }
  async function verifyReveal(msg, theirCommitHash) {
    if (!Number.isInteger(msg.card) || msg.card < 0 || msg.card > 11) return false;
    const h = await sha256Hex(`${msg.round}:${msg.card}:${msg.nonce}`);
    return h === theirCommitHash;
  }

  function close() {
    intentionalClose = true; // 以降の 'disconnected' で自動再接続しない
    try { send({ t: 'bye' }); } catch (_) {}
    try { conn?.close(); } catch (_) {}
    try { peer?.destroy(); } catch (_) {}
    peer = null; conn = null; handlers = {};
  }

  return { host, join, send, makeCommit, sendReveal, verifyReveal, close };
})();
