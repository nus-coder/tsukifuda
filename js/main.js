// main.js — 画面遷移・ゲーム進行のオーケストレーション
'use strict';

(() => {
  const G = {
    mode: null,        // 'cpu' | 'online'
    level: null,       // 'novice' | 'hard'
    myIndex: 0,        // 自分の player index（ホスト/CPU戦=0、ゲスト=1）
    state: null,
    taken: [],         // 各ラウンドの勝者(絶対index / -1)
    selected: null,
    names: ['あなた', '相手'],
    // オンライン用
    pending: null,     // 自分の {card, nonce, hash}
    theirCommit: null,
    theirCard: null,
    revealSent: false,
    myRematch: false,
    theirRematch: false,
  };

  // ---------- 共通ヘルパ ----------
  function view() { return { state: G.state, myIndex: G.myIndex, names: G.names, taken: G.taken }; }

  function startRound(hint) {
    G.selected = null;
    G.pending = null; G.theirCommit = null; G.theirCard = null; G.revealSent = false;
    UI.renderGame(view(), {
      hint: hint ?? 'カードを選んでください',
      pulsePot: true,
      onSelect: (id, el) => {
        G.selected = id;
        UI.markSelected(el);
        UI.setConfirmVisible(true);
      },
    });
  }

  function finishRound(result) {
    G.taken[G.state.round - 1] = result.winner; // resolve後 round は+1済み
    UI.revealRound(result, G.myIndex, () => {
      if (G.state.finished) {
        const w = ENGINE.gameWinner(G.state);
        UI.renderGame(view(), { locked: true });
        UI.showResult(w, G.myIndex, G.state, G.names);
      } else {
        startRound();
      }
    });
  }

  // ---------- CPU戦 ----------
  function startCpuGame(level) {
    G.mode = 'cpu'; G.level = level; G.myIndex = 0;
    G.names = ['あなた', level === 'hard' ? 'CPU 大妖怪' : 'CPU 見習い妖怪'];
    G.state = ENGINE.newGame(ENGINE.shufflePhases());
    G.taken = [];
    UI.clearLog();
    UI.hideResult();
    UI.showScreen('game');
    startRound();
  }

  function confirmCpu() {
    if (G.selected == null) return;
    const myPick = G.selected;
    UI.setConfirmVisible(false);
    UI.renderGame(view(), { locked: true, hint: '相手が考えています…', keepSlots: true });
    setTimeout(() => {
      const aiPick = AI.pick(G.state, G.level);
      const { state, result } = ENGINE.resolveRound(G.state, [myPick, aiPick]);
      G.state = state;
      finishRound(result);
    }, 450 + Math.random() * 650);
  }

  // ---------- オンライン戦 ----------
  function lobbyStatus(text, isError = false) {
    const el = UI.$('lobby-status');
    el.textContent = text;
    el.classList.toggle('error', isError);
  }

  const netHandlers = {
    onMessage: msg => handleNet(msg).catch(err => {
      console.error(err);
      abortOnline('通信エラーが発生しました。');
    }),
    onDisconnect: () => abortOnline('相手との接続が切れました。'),
    onError: e => {
      console.error(e);
      if (e?.type === 'peer-unavailable') lobbyStatus('その合言葉の部屋が見つかりません。', true);
      else if (e?.type === 'unavailable-id') lobbyStatus('部屋の作成に失敗しました。もう一度お試しください。', true);
      else lobbyStatus('接続エラー：ネットワークを確認してください。', true);
    },
  };

  function abortOnline(message) {
    if (G.mode !== 'online') return;
    ONLINE.close();
    G.mode = null;
    alert(message);
    UI.hideResult();
    UI.showScreen('title');
  }

  function startOnlineGame(phases, asHost) {
    G.mode = 'online';
    G.myIndex = asHost ? 0 : 1;
    G.names = ['あなた', '相手'];
    G.state = ENGINE.newGame(phases);
    G.taken = [];
    G.myRematch = false; G.theirRematch = false;
    UI.clearLog();
    UI.hideResult();
    UI.showScreen('game');
    startRound();
  }

  async function confirmOnline() {
    if (G.selected == null || G.pending) return;
    UI.setConfirmVisible(false);
    G.pending = await ONLINE.makeCommit(G.state.round, G.selected);
    UI.renderGame(view(), { locked: true, hint: '相手の決定を待っています…' });
    maybeReveal();
  }

  function maybeReveal() {
    if (G.pending && G.theirCommit && !G.revealSent) {
      G.revealSent = true;
      ONLINE.sendReveal(G.state.round, G.pending);
      maybeResolve();
    }
  }

  function maybeResolve() {
    if (!G.revealSent || G.theirCard == null) return;
    const picks = G.myIndex === 0 ? [G.pending.card, G.theirCard] : [G.theirCard, G.pending.card];
    const { state, result } = ENGINE.resolveRound(G.state, picks);
    G.state = state;
    finishRound(result);
  }

  async function handleNet(msg) {
    switch (msg.t) {
      case 'setup': // ゲストのみ受信
        if (Array.isArray(msg.phases) && msg.phases.length === 12) {
          startOnlineGame(msg.phases, false);
        }
        break;
      case 'commit':
        if (msg.round !== G.state?.round) return;
        G.theirCommit = String(msg.hash);
        maybeReveal();
        break;
      case 'reveal': {
        if (msg.round !== G.state?.round || !G.theirCommit) return;
        const ok = await ONLINE.verifyReveal(msg, G.theirCommit);
        if (!ok || !G.state.players[1 - G.myIndex].hand.includes(msg.card)) {
          abortOnline('不正な手が検出されたため対戦を終了します。');
          return;
        }
        G.theirCard = msg.card;
        maybeResolve();
        break;
      }
      case 'rematch':
        G.theirRematch = true;
        tryRematchOnline();
        break;
      case 'bye':
        abortOnline('相手が退出しました。');
        break;
    }
  }

  function tryRematchOnline() {
    if (!(G.myRematch && G.theirRematch)) return;
    if (G.myIndex === 0) {
      const phases = ENGINE.shufflePhases();
      ONLINE.send({ t: 'setup', phases });
      startOnlineGame(phases, true);
    }
    // ゲストは setup 受信で開始する
  }

  // ---------- ロビー ----------
  function setupLobby() {
    UI.$('host-info').classList.add('hidden');
    lobbyStatus('');
    UI.$('join-code').value = '';

    UI.$('btn-host').onclick = () => {
      UI.$('btn-host').disabled = true;
      lobbyStatus('部屋を準備しています…');
      ONLINE.host({
        ...netHandlers,
        onReady: code => {
          UI.$('room-code').textContent = code;
          UI.$('host-info').classList.remove('hidden');
          lobbyStatus('');
        },
        onConnected: () => {
          const phases = ENGINE.shufflePhases();
          ONLINE.send({ t: 'setup', phases });
          startOnlineGame(phases, true);
        },
      });
    };

    UI.$('btn-join').onclick = () => {
      const code = UI.$('join-code').value.trim().toUpperCase();
      if (code.length !== 5) { lobbyStatus('合言葉は5文字です。', true); return; }
      lobbyStatus('接続しています…');
      ONLINE.join(code, {
        ...netHandlers,
        onConnected: () => lobbyStatus('接続しました。ホストの準備を待っています…'),
      });
    };
  }

  // ---------- イベント配線 ----------
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    switch (action) {
      case 'cpu-novice': startCpuGame('novice'); break;
      case 'cpu-hard': startCpuGame('hard'); break;
      case 'online': setupLobby(); UI.showScreen('lobby'); break;
      case 'rules': UI.renderRules(); UI.showScreen('rules'); break;
      case 'back-title':
        if (G.mode === 'online') { ONLINE.close(); G.mode = null; }
        UI.hideResult();
        UI.$('btn-host').disabled = false;
        UI.showScreen('title');
        break;
    }
  });

  UI.$('btn-confirm').addEventListener('click', () => {
    if (G.mode === 'cpu') confirmCpu();
    else if (G.mode === 'online') confirmOnline().catch(console.error);
  });

  UI.$('btn-rematch').addEventListener('click', () => {
    if (G.mode === 'cpu') startCpuGame(G.level);
    else if (G.mode === 'online') {
      G.myRematch = true;
      ONLINE.send({ t: 'rematch' });
      UI.$('result-detail').textContent = '相手の同意を待っています…';
      tryRematchOnline();
    }
  });
})();
