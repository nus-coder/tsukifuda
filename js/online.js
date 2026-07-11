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
  const ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
    { urls: 'turn:global.relay.metered.ca:443', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '62b73ed39560e8136bee9e8c', credential: 'pfEIEXLeecVkYoQd' },
  ];
  const PEER_OPTS = { config: { iceServers: ICE_SERVERS } };
  const CONNECT_TIMEOUT = 15000; // データチャネル確立の待ち時間

  let peer = null, conn = null;
  let handlers = {};

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
  }

  // 部屋を作る（ホスト = player0）。code を返す。
  function host(h) {
    handlers = h;
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
    peer.on('error', e => h.onError?.(e));
    return code;
  }

  // 部屋に入る（ゲスト = player1）
  function join(code, h) {
    handlers = h;
    peer = new Peer(PEER_OPTS);
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
      wireConn(c);
      const t = setTimeout(() => {
        if (!c.open) h.onError?.({ type: 'connect-timeout' });
      }, CONNECT_TIMEOUT);
      c.on('open', () => { clearTimeout(t); h.onConnected?.(); });
    });
    peer.on('error', e => h.onError?.(e));
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
    try { send({ t: 'bye' }); } catch (_) {}
    try { conn?.close(); } catch (_) {}
    try { peer?.destroy(); } catch (_) {}
    peer = null; conn = null; handlers = {};
  }

  return { host, join, send, makeCommit, sendReveal, verifyReveal, close };
})();
