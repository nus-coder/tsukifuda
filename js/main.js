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
    resultRecorded: false, // 結果の二重記録防止
    // 制限時間制
    choiceDeadline: null,  // カード選択の締切(Date.now()基準)
    choicePausedAt: null,  // 中断メニューを開いた時刻
  };

  // ---------- 制限時間制 ----------
  const TIME_LIMIT_KEY = 'tsukifuda-timelimit';
  const TIME_LIMIT_OPTIONS = [10, 20, 40, 0]; // 秒。0=なし
  function loadTimeLimit() {
    const raw = localStorage.getItem(TIME_LIMIT_KEY);
    if (raw == null) return 20;
    const v = Number(raw);
    return TIME_LIMIT_OPTIONS.includes(v) ? v : 20;
  }
  let choiceTimeLimitS = loadTimeLimit();
  let choiceTimerHandle = null;

  function timeLimitLabel() { return choiceTimeLimitS > 0 ? `制限時間：${choiceTimeLimitS}秒` : '制限時間：なし'; }
  function syncTimeLimitBtns() {
    UI.$('btn-pause-timelimit').textContent = timeLimitLabel();
  }
  function cycleTimeLimit() {
    const i = TIME_LIMIT_OPTIONS.indexOf(choiceTimeLimitS);
    choiceTimeLimitS = TIME_LIMIT_OPTIONS[(i + 1) % TIME_LIMIT_OPTIONS.length];
    localStorage.setItem(TIME_LIMIT_KEY, String(choiceTimeLimitS));
    syncTimeLimitBtns();
  }

  // ---------- 制限時間選択画面（対戦形式を決めた直後、ゲーム開始前に表示） ----------
  let pendingTimeLimitCallback = null;
  let pendingTimeLimitCancelScreen = 'title';
  function showTimeLimitPicker(onDone, cancelScreen = 'title') {
    pendingTimeLimitCallback = onDone;
    pendingTimeLimitCancelScreen = cancelScreen;
    document.querySelectorAll('#timelimit-options .btn').forEach(b => {
      b.classList.toggle('selected', Number(b.dataset.tl) === choiceTimeLimitS);
    });
    UI.showScreen('timelimit');
  }
  document.querySelectorAll('#timelimit-options .btn').forEach(b => {
    b.addEventListener('click', () => {
      choiceTimeLimitS = Number(b.dataset.tl);
      localStorage.setItem(TIME_LIMIT_KEY, String(choiceTimeLimitS));
      syncTimeLimitBtns();
      SOUND.play('click');
      const cb = pendingTimeLimitCallback;
      pendingTimeLimitCallback = null;
      if (cb) cb();
    });
  });

  function stopChoiceTimer() {
    if (choiceTimerHandle) { clearInterval(choiceTimerHandle); choiceTimerHandle = null; }
    G.choiceDeadline = null;
    G.choicePausedAt = null;
    UI.setTimerText('');
  }

  function tickChoiceTimer() {
    if (!G.choiceDeadline || G.choicePausedAt) return;
    const remainMs = G.choiceDeadline - Date.now();
    const remainS = Math.max(0, Math.ceil(remainMs / 1000));
    UI.setTimerText(`残り ${remainS}秒`, remainS <= 5);
    if (remainMs <= 0) {
      stopChoiceTimer();
      autoConfirmChoice();
    }
  }

  function startChoiceTimer() {
    stopChoiceTimer();
    if (choiceTimeLimitS <= 0) return; // 制限時間なし
    G.choiceDeadline = Date.now() + choiceTimeLimitS * 1000;
    choiceTimerHandle = setInterval(tickChoiceTimer, 250);
    tickChoiceTimer();
  }

  function pauseChoiceTimer() {
    if (!G.choiceDeadline || G.choicePausedAt) return;
    G.choicePausedAt = Date.now();
  }

  function resumeChoiceTimer() {
    if (!G.choiceDeadline || !G.choicePausedAt) return;
    G.choiceDeadline += Date.now() - G.choicePausedAt;
    G.choicePausedAt = null;
  }

  // 時間切れ：未選択なら手札の先頭を自動選択して決定する
  function autoConfirmChoice() {
    if (G.selected == null) {
      const me = G.state.players[G.myIndex];
      if (!me || me.hand.length === 0) return;
      G.selected = [...me.hand].sort((a, b) => a - b)[0];
    }
    if (G.mode === 'cpu' || G.mode === 'story') confirmCpu();
    else if (G.mode === 'online') confirmOnline().catch(console.error);
  }

  // ---------- 戦績 (localStorage) ----------
  const STATS_KEY = 'tsukifuda-stats';
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (_) { return {}; }
  }
  function recordResult(winner) {
    if (G.resultRecorded) return;
    const mode = G.mode === 'cpu' ? G.level : 'online';
    const stats = loadStats();
    const s = stats[mode] ?? (stats[mode] = { w: 0, l: 0, d: 0 });
    if (winner === -1) s.d++;
    else if (winner === G.myIndex) s.w++;
    else s.l++;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    G.resultRecorded = true;
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
    startChoiceTimer();
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

  // ---------- 計測（GA4） ----------
  // 対戦開始時にモードを送信。GA4管理画面の「レポート → エンゲージメント → イベント」で
  // game_start を選ぶと、game_mode 別の回数（どのモードが多く遊ばれたか）を確認できる。
  function trackGameStart(mode, detail) {
    if (typeof gtag !== 'function') return; // GA未読込・オフライン端末では無視
    gtag('event', 'game_start', {
      game_mode: mode,             // 'cpu' | 'story' | 'online'
      mode_detail: detail || mode  // 例: 'cpu_novice' / 'cpu_hard' / ボス名 / 'online'
    });
  }

  // ---------- CPU戦 ----------
  function startCpuGame(level) {
    G.mode = 'cpu'; G.level = level; G.myIndex = 0;
    trackGameStart('cpu', level === 'hard' ? 'cpu_hard' : 'cpu_novice');
    G.names = ['あなた', level === 'hard' ? 'CPU 大妖怪' : 'CPU 見習い妖怪'];
    G.state = ENGINE.newGame(ENGINE.shufflePhases());
    G.taken = [];
    G.resultRecorded = false;
    UI.$('btn-rematch').disabled = false;
    UI.clearLog();
    UI.hideResult();
    UI.setEmoteBarVisible(false);
    UI.showScreen('game');
    // 試合開始演出（「対戦開始」＋対戦カード）を挟んでから第一ラウンドへ
    UI.showMatchStart(G.names, G.myIndex, () => startRound());
  }

  // ---------- ストーリーモード ----------
  function showStoryScreen() {
    UI.hideResult();
    UI.renderStory(i => {
      SOUND.play('click');
      showTimeLimitPicker(() => {
        UI.showScreen('story');
        UI.showDialogue(STORY.BOSSES[i], STORY.BOSSES[i].intro, () => startStoryGame(i));
      }, 'story');
    });
    UI.showScreen('story');
  }

  function startStoryGame(index) {
    const boss = STORY.BOSSES[index];
    G.mode = 'story'; G.level = boss.ai; G.bossIndex = index; G.myIndex = 0;
    trackGameStart('story', 'story_' + (boss.name || index));
    G.names = ['あなた', boss.name];
    G.state = ENGINE.newGame(ENGINE.shufflePhases(boss.pool || undefined), boss.pot);
    G.taken = [];
    G.resultRecorded = false;
    UI.$('btn-rematch').disabled = false;
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
    stopChoiceTimer();
    const myPick = G.selected;
    UI.setConfirmVisible(false);
    UI.renderGame(view(), { locked: true, hint: '相手が考えています…', keepSlots: true });
    UI.setOppPicked(true); // 相手（CPU）がカードを選択したことを示す
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
    if (!G.roundsStarted) {
      // 対戦成立前（制限時間ポップ表示中など）の切断は勝敗に記録しない
      UI.$('timelimit-pop').classList.add('hidden');
      ONLINE.close();
      G.mode = null;
      alert(message);
      UI.showScreen('title');
      return;
    }
    if (G.state?.finished) {
      // 結果画面は表示済み（または表示中）: 演出・記録はそのまま進行させ、切断だけ処理する
      ONLINE.close();
      const detail = UI.$('result-detail');
      if (detail && !detail.textContent.includes('（相手は退出しました）')) {
        detail.textContent += '（相手は退出しました）';
      }
      UI.$('btn-rematch').disabled = true;
      return;
    }
    // ゲーム進行中の切断は投了とみなす
    stopChoiceTimer();
    recordResult(G.myIndex);
    ONLINE.close();
    G.mode = null;
    alert(message + '（あなたの勝ちとして記録しました）');
    UI.hideResult();
    UI.showScreen('title');
  }

  // 盤面を用意して表示する（まだラウンドは始めない＝プレビュー）。
  // 「対戦成立後に制限時間を選ぶ」ため、開始とプレビューを分離している。
  function prepareOnlineGame(phases, asHost) {
    G.mode = 'online';
    G.roundsStarted = false;
    trackGameStart('online', asHost ? 'online_host' : 'online_guest');
    G.myIndex = asHost ? 0 : 1;
    G.names = ['あなた', '相手'];
    G.state = ENGINE.newGame(phases);
    G.taken = [];
    G.myRematch = false; G.theirRematch = false;
    G.resultRecorded = false;
    UI.$('btn-rematch').disabled = false;
    UI.clearLog();
    UI.hideResult();
    UI.setEmoteBarVisible(true);
    UI.showScreen('game');
    UI.renderGame(view(), { locked: true }); // 盤面プレビュー（操作不可）
  }

  // 対戦開始演出を挟んで第一ラウンドへ。
  function beginOnlineRounds() {
    G.roundsStarted = true;
    UI.showMatchStart(G.names, G.myIndex, () => startRound());
  }

  // ゲスト・再戦は用意→開始を一気に行う。
  function startOnlineGame(phases, asHost) {
    prepareOnlineGame(phases, asHost);
    beginOnlineRounds();
  }

  // 接続確立後、ホストは「対戦成立」した盤面を薄暗く見せた上に制限時間ポップを出し、
  // 決めたら両者へ配って対戦を開始する（繋がるか不明な段階で決めさせない）。
  function beginHostMatch(cancelScreen) {
    const phases = ENGINE.shufflePhases();
    prepareOnlineGame(phases, true); // 盤面プレビューを表示
    showTimeLimitPopup(
      () => { // 決定
        ONLINE.send({ t: 'setup', phases, timeLimit: choiceTimeLimitS });
        beginOnlineRounds();
      },
      () => { // やめる：接続を破棄してロビー/近距離へ戻る
        ONLINE.close();
        G.mode = null;
        if (cancelScreen === 'nearby') setupNearby(); else setupLobby();
        UI.showScreen(cancelScreen);
      },
    );
  }

  // 制限時間ポップ（オンライン専用）。盤面の上に薄暗いオーバーレイで表示する。
  function showTimeLimitPopup(onPick, onCancel) {
    const pop = UI.$('timelimit-pop');
    document.querySelectorAll('#timelimit-pop-options .btn').forEach(b => {
      b.classList.toggle('selected', Number(b.dataset.tl) === choiceTimeLimitS);
      b.onclick = () => {
        choiceTimeLimitS = Number(b.dataset.tl);
        localStorage.setItem(TIME_LIMIT_KEY, String(choiceTimeLimitS));
        syncTimeLimitBtns();
        SOUND.play('click');
        pop.classList.add('hidden');
        onPick();
      };
    });
    UI.$('timelimit-pop-cancel').onclick = () => { pop.classList.add('hidden'); onCancel(); };
    pop.classList.remove('hidden');
  }

  async function confirmOnline() {
    if (G.selected == null || G.pending) return;
    stopChoiceTimer();
    UI.setConfirmVisible(false);
    G.pending = await ONLINE.makeCommit(G.state.round, G.selected);
    UI.renderGame(view(), { locked: true, hint: '相手の決定を待っています…' });
    UI.setOppPicked(!!G.theirCommit); // 相手が先に選択済みなら復元
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
          // ホストが決めた制限時間をこの対戦に反映（ゲスト自身の保存設定は上書きしない）
          if (TIME_LIMIT_OPTIONS.includes(Number(msg.timeLimit))) {
            choiceTimeLimitS = Number(msg.timeLimit);
            syncTimeLimitBtns();
          }
          startOnlineGame(msg.phases, false);
        }
        break;
      case 'commit':
        if (msg.round !== G.state?.round) return;
        G.theirCommit = String(msg.hash);
        UI.setOppPicked(true); // 相手がカードを選択（コミット）したことを示す
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
      ONLINE.send({ t: 'setup', phases, timeLimit: choiceTimeLimitS }); // 制限時間は前試合を引き継ぐ
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
        // 相手が接続したら、制限時間を決めて対戦開始
        onConnected: () => beginHostMatch('lobby'),
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

  // ---------- 近くの人と対戦（サーバーレス手動シグナリング）----------
  function nearbyStatus(text, isError = false) {
    const el = UI.$('nearby-status');
    el.textContent = text;
    el.classList.toggle('error', isError);
  }

  function copyToClipboard(text, btn) {
    if (!text) return;
    const label = btn.textContent;
    navigator.clipboard?.writeText(text).then(() => {
      btn.textContent = 'コピーしました';
      setTimeout(() => { btn.textContent = label; }, 1200);
    }).catch(() => nearbyStatus('コピーできませんでした。長押しで選択してコピーしてください。', true));
  }

  // QRコードをcanvasに描画（ライブラリ未読込やサイズ超過時はフォールバック案内）。
  function renderNearbyQR(canvasId, text) {
    const canvas = UI.$(canvasId);
    if (typeof QRCode === 'undefined' || !QRCode.toCanvas) { canvas.classList.add('hidden'); return; }
    // errorCorrectionLevel:'L' でモジュール数を減らし柄を粗く（読みやすく）、
    // margin:4 で規格どおりの静音域（余白）を確保、width大きめでカメラが拾いやすくする。
    QRCode.toCanvas(canvas, text, { errorCorrectionLevel: 'L', width: 320, margin: 4 }, err => {
      if (err) {
        console.error(err);
        canvas.classList.add('hidden');
        nearbyStatus('QRの生成に失敗しました。下の「コードを渡す」から手動でお渡しください。', true);
      } else {
        canvas.classList.remove('hidden');
      }
    });
  }

  // QRを全画面で大きく描画して相手が読み取りやすくする（画面タップで閉じる）。
  function showBigQR(code) {
    if (!code || typeof QRCode === 'undefined' || !QRCode.toCanvas) return;
    const overlay = UI.$('nearby-qr-overlay');
    const px = Math.max(280, Math.min(window.innerWidth, window.innerHeight) - 40);
    QRCode.toCanvas(UI.$('nearby-qr-big'), code, { errorCorrectionLevel: 'L', width: px, margin: 4 }, err => {
      if (err) { console.error(err); return; }
      overlay.classList.remove('hidden');
    });
  }
  function hideBigQR() { UI.$('nearby-qr-overlay').classList.add('hidden'); }

  // カメラQRスキャナ。実行中の停止関数を保持し、多重起動や離脱時に確実に止める。
  let activeScanStop = null;
  function stopNearbyScanner() {
    if (activeScanStop) { try { activeScanStop(); } catch (_) {} activeScanStop = null; }
    UI.$('nearby-scanner').classList.add('hidden');
  }
  async function startNearbyScanner(onResult) {
    if (typeof jsQR === 'undefined') { nearbyStatus('QR読み取りが使えません。「コードを貼り付け」をご利用ください。', true); return; }
    if (!navigator.mediaDevices?.getUserMedia) { nearbyStatus('この端末ではカメラを使えません。「コードを貼り付け」をご利用ください。', true); return; }
    stopNearbyScanner();
    const video = UI.$('nearby-video');
    UI.$('nearby-scanner').classList.remove('hidden');
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    let stream = null, raf = 0, stopped = false;
    activeScanStop = () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    };
    try {
      // 高解像度＆背面カメラを要求。細かいQRのモジュールを解像できるようにする。
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      console.error(e);
      stopNearbyScanner();
      nearbyStatus('カメラを起動できませんでした。権限を許可するか、「コードを貼り付け」をご利用ください。', true);
      return;
    }
    if (stopped) { stream.getTracks().forEach(t => t.stop()); return; } // 起動待ちの間に中断された
    video.srcObject = stream;
    await video.play().catch(() => {});
    const tick = () => {
      if (stopped) return;
      if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
        cvs.width = video.videoWidth; cvs.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, cvs.width, cvs.height);
        const img = ctx.getImageData(0, 0, cvs.width, cvs.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (found && found.data) { stopNearbyScanner(); onResult(found.data.trim()); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function setupNearby() {
    const $ = UI.$;
    stopNearbyScanner();
    hideBigQR();
    $('nearby-roles').classList.remove('hidden');
    $('nearby-host').classList.add('hidden');
    $('nearby-guest').classList.add('hidden');
    ['nearby-offer', 'nearby-answer-in', 'nearby-offer-in', 'nearby-answer'].forEach(id => { $(id).value = ''; });
    ['nearby-offer-qr', 'nearby-answer-qr'].forEach(id => $(id).classList.add('hidden'));
    nearbyStatus('');

    // 握手中のエラーはロビーではなくこの画面に出す
    const nearbyHandlers = {
      onMessage: netHandlers.onMessage,
      onDisconnect: netHandlers.onDisconnect,
      onError: e => {
        console.error(e);
        nearbyStatus('接続を確立できませんでした。回線の組み合わせによっては繋がらないことがあります（同じWi‑Fiなら高確率で繋がります）。', true);
      },
    };

    // ゲスト: 招待(offer)を取り込み、返信(answer)QR/コードを作る
    function makeAnswer(code) {
      if (!code) { nearbyStatus('招待QRを読み取るか、招待コードを貼り付けてください。', true); return; }
      nearbyStatus('返信コードを作成しています…');
      ONLINE.manualAcceptOffer({
        ...nearbyHandlers,
        onConnected: () => nearbyStatus('接続しました。ホストの準備を待っています…'),
      }, code).then(answer => {
        $('nearby-answer').value = answer;
        renderNearbyQR('nearby-answer-qr', answer);
        nearbyStatus('②の返信QRをホストに見せてください。ホストが読み取ると対戦が始まります。');
      }).catch(err => {
        console.error(err);
        nearbyStatus('招待コードを読み取れませんでした。QR/コードを確認してください。', true);
      });
    }

    // ホスト: 返信(answer)を取り込み接続を確立
    function doConnect(code) {
      if (!code) { nearbyStatus('返信QRを読み取るか、返信コードを貼り付けてください。', true); return; }
      nearbyStatus('接続しています…');
      ONLINE.manualAcceptAnswer(code).catch(err => {
        console.error(err);
        nearbyStatus('返信コードを読み取れませんでした。QR/コードを確認してください。', true);
      });
    }

    $('nearby-be-host').onclick = () => {
      $('nearby-roles').classList.add('hidden');
      $('nearby-guest').classList.add('hidden');
      $('nearby-host').classList.remove('hidden');
      nearbyStatus('招待QRを作成しています…');
      ONLINE.manualCreateOffer({
        ...nearbyHandlers,
        // 接続確立後に制限時間を決めて対戦開始
        onConnected: () => beginHostMatch('nearby'),
      }).then(code => {
        $('nearby-offer').value = code;
        renderNearbyQR('nearby-offer-qr', code);
        nearbyStatus('①の招待QRを相手に見せ、相手の②返信QRを「返信QRをスキャン」で読み取ってください。');
      }).catch(err => {
        console.error(err);
        nearbyStatus('招待コードの作成に失敗しました。もう一度お試しください。', true);
      });
    };

    $('nearby-be-guest').onclick = () => {
      $('nearby-roles').classList.add('hidden');
      $('nearby-host').classList.add('hidden');
      $('nearby-guest').classList.remove('hidden');
      nearbyStatus('「招待QRをスキャン」で相手の招待QRを読み取ってください。');
    };

    $('nearby-scan-offer').onclick = () => startNearbyScanner(code => { $('nearby-offer-in').value = code; makeAnswer(code); });
    $('nearby-scan-answer').onclick = () => startNearbyScanner(code => { $('nearby-answer-in').value = code; doConnect(code); });
    $('nearby-make-answer').onclick = () => makeAnswer($('nearby-offer-in').value.trim());
    $('nearby-connect').onclick = () => doConnect($('nearby-answer-in').value.trim());
    $('nearby-scan-cancel').onclick = () => { stopNearbyScanner(); nearbyStatus('スキャンを中止しました。'); };
    $('nearby-copy-offer').onclick = () => copyToClipboard($('nearby-offer').value, $('nearby-copy-offer'));
    $('nearby-copy-answer').onclick = () => copyToClipboard($('nearby-answer').value, $('nearby-copy-answer'));
    // QRをタップで全画面拡大（相手が読み取りやすいように）
    $('nearby-offer-qr').onclick = () => showBigQR($('nearby-offer').value);
    $('nearby-answer-qr').onclick = () => showBigQR($('nearby-answer').value);
    $('nearby-qr-overlay').onclick = hideBigQR;
  }

  // ---------- イベント配線 ----------
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    switch (action) {
      case 'cpu-novice': showTimeLimitPicker(() => startCpuGame('novice')); break;
      case 'cpu-hard': showTimeLimitPicker(() => startCpuGame('hard')); break;
      case 'story': showStoryScreen(); break;
      case 'online': setupLobby(); UI.showScreen('lobby'); break;
      case 'nearby': setupNearby(); UI.showScreen('nearby'); break;
      case 'nearby-back':
        stopNearbyScanner();
        hideBigQR();
        if (G.mode !== 'online') ONLINE.close(); // 対戦開始前の握手を破棄（開始後はback-titleが処理）
        setupLobby();
        UI.showScreen('lobby');
        break;
      case 'timelimit-back':
        pendingTimeLimitCallback = null;
        UI.showScreen(pendingTimeLimitCancelScreen);
        break;
      case 'rules':
        G.rulesReturn = 'title';
        UI.setRulesBackLabel('タイトルへ戻る');
        UI.renderRules(0);
        UI.showScreen('rules');
        break;
      case 'rules-back':
        if (G.rulesReturn === 'game') { UI.showScreen('game'); resumeChoiceTimer(); }
        else { UI.renderTitleStats(loadStats()); UI.showScreen('title'); }
        break;
      case 'back-title':
        stopChoiceTimer();
        stopNearbyScanner();
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

  // アプリを離れたら音を止める（バックグラウンド再生しない）
  document.addEventListener('visibilitychange', () => SOUND.setBackground(document.hidden));

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
    pauseChoiceTimer();
    SOUND.play('click');
  });
  UI.$('btn-resume').addEventListener('click', () => {
    UI.$('pause-overlay').classList.add('hidden');
    resumeChoiceTimer();
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
  UI.$('btn-pause-timelimit').addEventListener('click', () => {
    cycleTimeLimit();
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
    stopChoiceTimer();
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
  syncTimeLimitBtns();
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
