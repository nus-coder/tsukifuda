// main.js — 画面遷移・ゲーム進行のオーケストレーション
'use strict';

(() => {
  const G = {
    mode: null,        // 'cpu' | 'online' | 'story'
    level: null,       // 'novice' | 'mid' | 'hard'
    bossIndex: 0,      // ストーリーモードの現在ボス
    rulesReturn: 'title', // 遊び方画面から戻る先
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

  // ---------- 戦績 (localStorage) ----------
  const STATS_KEY = 'tsukifuda-stats';
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (_) { return {}; }
  }
  function recordResult(winner) {
    const mode = G.mode === 'cpu' ? G.level : 'online';
    const stats = loadStats();
    const s = stats[mode] ?? (stats[mode] = { w: 0, l: 0, d: 0 });
    if (winner === -1) s.d++;
    else if (winner === G.myIndex) s.w++;
    else s.l++;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

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
        SOUND.play('select');
      },
    });
    UI.phaseAmbience(G.state.phases[G.state.round]);
  }

  function finishRound(result) {
    G.taken[G.state.round - 1] = result.winner; // resolve後 round は+1済み
    UI.revealRound(result, G.myIndex, () => {
      if (G.state.finished) {
        const w = ENGINE.gameWinner(G.state);
        UI.renderGame(view(), { locked: true });
        UI.showResult(w, G.myIndex, G.state, G.names);
        if (G.mode === 'story') {
          const boss = STORY.BOSSES[G.bossIndex];
          const won = w === G.myIndex;
          if (won) STORY.clearBoss(G.bossIndex);
          UI.decorateStoryResult(won ? boss.win : boss.lose, won ? 'もう一度戦う' : '再挑戦する');
        } else {
          recordResult(w);
        }
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
    UI.setEmoteBarVisible(false);
    UI.showScreen('game');
    SOUND.play('start');
    startRound();
  }

  // ---------- ストーリーモード ----------
  function showStoryScreen() {
    UI.hideResult();
    UI.renderStory(i => {
      SOUND.play('click');
      UI.showDialogue(STORY.BOSSES[i], STORY.BOSSES[i].intro, () => startStoryGame(i));
    });
    UI.showScreen('story');
  }

  function startStoryGame(index) {
    const boss = STORY.BOSSES[index];
    G.mode = 'story'; G.level = boss.ai; G.bossIndex = index; G.myIndex = 0;
    G.names = ['あなた', boss.name];
    G.state = ENGINE.newGame(ENGINE.shufflePhases(boss.pool || undefined), boss.pot);
    G.taken = [];
    UI.clearLog();
    UI.hideResult();
    UI.setEmoteBarVisible(false);
    UI.showScreen('game');
    SOUND.play('start');
    if (boss.pot > 0) UI.log(`${boss.name}が場に${boss.pot}点を積んだ！`);
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
      if (e?.type === 'peer-unavailable') lobbyStatus('その合言葉の部屋が見つかりません。コードを確認してください。', true);
      else if (e?.type === 'unavailable-id') lobbyStatus('部屋の作成に失敗しました。もう一度お試しください。', true);
      else if (e?.type === 'connect-timeout') lobbyStatus('相手が見つかりましたが、P2P接続を確立できませんでした。回線の組み合わせによっては繋がらないことがあります（同じWi-Fiなら高確率で繋がります）。', true);
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
    UI.setEmoteBarVisible(true);
    UI.showScreen('game');
    SOUND.play('start');
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
      case 'emote':
        UI.showEmote('opp', Number(msg.e));
        break;
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
      case 'story': showStoryScreen(); break;
      case 'online': setupLobby(); UI.showScreen('lobby'); break;
      case 'rules':
        G.rulesReturn = 'title';
        UI.setRulesBackLabel('タイトルへ戻る');
        UI.renderRules(0);
        UI.showScreen('rules');
        break;
      case 'rules-back':
        if (G.rulesReturn === 'game') UI.showScreen('game');
        else { UI.renderTitleStats(loadStats()); UI.showScreen('title'); }
        break;
      case 'back-title':
        if (G.mode === 'online') { ONLINE.close(); G.mode = null; }
        UI.hideResult();
        UI.$('btn-host').disabled = false;
        UI.renderTitleStats(loadStats());
        UI.showScreen('title');
        break;
    }
  });

  UI.$('btn-confirm').addEventListener('click', () => {
    if (G.mode === 'cpu' || G.mode === 'story') confirmCpu();
    else if (G.mode === 'online') confirmOnline().catch(console.error);
  });

  // 効果音トグル
  const soundBtn = UI.$('btn-sound');
  const syncSoundBtn = () => {
    soundBtn.textContent = SOUND.muted ? '🔇' : '🔊';
    soundBtn.classList.toggle('off', SOUND.muted);
  };
  soundBtn.addEventListener('click', () => {
    SOUND.toggleMute();
    syncSoundBtn();
    UI.floatText(soundBtn, `効果音 ${SOUND.muted ? 'OFF' : 'ON'}`, SOUND.muted ? 'bad' : '');
    SOUND.play('click');
  });
  syncSoundBtn();

  // BGMトグル（ブラウザの自動再生制限があるため、初回クリック後に開始する）
  const musicBtn = UI.$('btn-music');
  const syncMusicBtn = () => musicBtn.classList.toggle('off', !SOUND.bgmOn);
  musicBtn.addEventListener('click', () => {
    SOUND.toggleBgm();
    syncMusicBtn();
    UI.floatText(musicBtn, `BGM ${SOUND.bgmOn ? 'ON' : 'OFF'}`, SOUND.bgmOn ? '' : 'bad');
  });
  syncMusicBtn();
  document.addEventListener('click', () => SOUND.startBgm(), { once: true });

  // 絵文字リアクション（オンライン戦のみ表示、連打は1.5秒に1回まで）
  let lastEmoteAt = 0;
  UI.renderEmoteBar(i => {
    const now = Date.now();
    if (G.mode !== 'online' || now - lastEmoteAt < 1500) return;
    lastEmoteAt = now;
    ONLINE.send({ t: 'emote', e: i });
    UI.showEmote('me', i);
  });

  // ---------- 中断メニュー ----------
  const forfeitBtn = UI.$('btn-forfeit');
  function resetForfeit() {
    forfeitBtn.textContent = '投了する';
    forfeitBtn.classList.remove('confirm');
  }
  function syncPauseSound() {
    UI.$('btn-pause-sound').textContent = `効果音：${SOUND.muted ? 'OFF' : 'ON'}`;
    UI.$('btn-pause-bgm').textContent = `BGM：${SOUND.bgmOn ? 'ON' : 'OFF'}`;
  }
  UI.$('btn-pause').addEventListener('click', () => {
    resetForfeit();
    syncPauseSound();
    UI.$('pause-overlay').classList.remove('hidden');
    SOUND.play('click');
  });
  UI.$('btn-resume').addEventListener('click', () => {
    UI.$('pause-overlay').classList.add('hidden');
    SOUND.play('click');
  });
  UI.$('btn-pause-rules').addEventListener('click', () => {
    UI.$('pause-overlay').classList.add('hidden');
    G.rulesReturn = 'game';
    UI.setRulesBackLabel('対戦に戻る');
    UI.renderRules(0);
    UI.showScreen('rules');
    SOUND.play('click');
  });
  UI.$('btn-pause-sound').addEventListener('click', () => {
    SOUND.toggleMute();
    syncPauseSound();
    syncSoundBtn();
    SOUND.play('click');
  });
  UI.$('btn-pause-bgm').addEventListener('click', () => {
    SOUND.toggleBgm();
    syncPauseSound();
    syncMusicBtn();
    SOUND.play('click');
  });
  forfeitBtn.addEventListener('click', () => {
    if (!forfeitBtn.classList.contains('confirm')) {
      forfeitBtn.textContent = '本当に投了する？';
      forfeitBtn.classList.add('confirm');
      return;
    }
    // 投了確定
    const mode = G.mode;
    UI.$('pause-overlay').classList.add('hidden');
    resetForfeit();
    if (mode === 'online') {
      recordResult(1 - G.myIndex); // 投了は負け扱い
      ONLINE.close();
    } else if (mode === 'cpu') {
      recordResult(1 - G.myIndex);
    }
    G.mode = null;
    if (mode === 'story') showStoryScreen();
    else {
      UI.renderTitleStats(loadStats());
      UI.showScreen('title');
    }
  });

  // 初期表示
  UI.renderTitleStats(loadStats());
  FX.setAmbient(true); // 初期表示はタイトルなので蛍を飛ばす

  UI.$('btn-story-back').addEventListener('click', () => {
    G.mode = null;
    showStoryScreen();
  });

  UI.$('btn-rematch').addEventListener('click', () => {
    if (G.mode === 'cpu') startCpuGame(G.level);
    else if (G.mode === 'story') startStoryGame(G.bossIndex);
    else if (G.mode === 'online') {
      G.myRematch = true;
      ONLINE.send({ t: 'rematch' });
      UI.$('result-detail').textContent = '相手の同意を待っています…';
      tryRematchOnline();
    }
  });
})();
