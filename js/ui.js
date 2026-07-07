// ui.js — DOM描画。ゲーム進行は main.js が握り、UI は描画と入力通知のみ。
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);

  // ---------- 画面遷移 ----------
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(`screen-${name}`).classList.add('active');
  }

  // ---------- 月齢アイコン ----------
  function moonIconSVG(moon) {
    const c = {
      crescent: `<path d="M60 16 A44 44 0 1 0 60 104 A34 44 0 1 1 60 16" fill="#f5e6a8"/>`,
      half: `<path d="M60 16 A44 44 0 0 0 60 104 Z" fill="#f5e6a8"/><circle cx="60" cy="60" r="44" fill="none" stroke="#f5e6a8" stroke-width="3" opacity=".4"/>`,
      full: `<circle cx="60" cy="60" r="44" fill="#f5e6a8"/><circle cx="46" cy="48" r="8" fill="#e3d190" opacity=".8"/><circle cx="72" cy="70" r="6" fill="#e3d190" opacity=".8"/>`,
      new: `<circle cx="60" cy="60" r="44" fill="#171433" stroke="#8f86c4" stroke-width="3"/>`,
      eclipse: `<circle cx="60" cy="60" r="44" fill="#f5e6a8"/><circle cx="70" cy="60" r="40" fill="#1a1030"/><circle cx="60" cy="60" r="44" fill="none" stroke="#c94f6a" stroke-width="3"/>`,
    }[moon];
    return `<svg viewBox="0 0 120 120" class="moon-icon" xmlns="http://www.w3.org/2000/svg">${c}</svg>`;
  }

  // ---------- カードDOM ----------
  function cardHTML(id) {
    const c = CARDS[id];
    return `<div class="power">${c.id}</div>
      <div class="art">${CARD_ART[id]}</div>
      <div class="name">${c.name}</div>
      <div class="text">${c.text}</div>`;
  }
  function makeCardEl(id) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.card = id;
    el.innerHTML = cardHTML(id);
    return el;
  }

  // ---------- ゲーム画面描画 ----------
  // view = { state, myIndex, names: [my, opp] }
  function renderGame(view, opts = {}) {
    const { state, myIndex } = view;
    const me = state.players[myIndex];
    const opp = state.players[1 - myIndex];

    $('my-name').textContent = view.names[0];
    $('opp-name').textContent = view.names[1];
    $('my-score').textContent = me.score;
    $('opp-score').textContent = opp.score;
    $('my-buff').classList.toggle('hidden', me.buff === 0);

    // 月齢トラック
    const track = $('phase-track');
    track.innerHTML = '';
    state.phases.forEach((ph, i) => {
      const chip = document.createElement('div');
      chip.className = 'phase-chip';
      if (i < state.round) {
        chip.classList.add('done');
        const t = view.taken?.[i];
        chip.dataset.taken = t === myIndex ? '○' : (t === (1 - myIndex) ? '●' : '−');
      }
      if (i === state.round && !state.finished) chip.classList.add('current');
      if (ph.moon === 'new' || ph.moon === 'eclipse' || ph.moon === 'full') chip.classList.add('special');
      chip.innerHTML = `${moonIconSVG(ph.moon)}<span class="pv">${ph.value}</span>`;
      chip.title = `${MOONS[ph.moon].name}（${ph.value}点）: ${MOONS[ph.moon].desc}`;
      track.appendChild(chip);
    });

    // 中央情報
    if (!state.finished) {
      const ph = state.phases[state.round];
      $('round-label').textContent = `第${state.round + 1}戦 / 12 — ${MOONS[ph.moon].name}`;
      $('stake-label').textContent = `${ph.value + state.pot} 点`;
      const potEl = $('pot-label');
      potEl.textContent = state.pot > 0 ? `持ち越し +${state.pot}` : '';
      if (opts.pulsePot && state.pot > 0) {
        potEl.classList.remove('pulse'); void potEl.offsetWidth; potEl.classList.add('pulse');
      }
      const special = MOONS[ph.moon].desc !== '効果なし' ? `【${MOONS[ph.moon].desc}】` : '';
      if (special) $('round-label').textContent += ` ${special}`;
    }

    // 相手の残り手札（表向き＝公開情報）
    const oh = $('opp-hand');
    oh.innerHTML = '';
    [...opp.hand].sort((a, b) => a - b).forEach(id => {
      const el = document.createElement('div');
      el.className = 'opp-card';
      el.innerHTML = `${CARD_ART[id]}<div class="mini-power">${id} ${CARDS[id].name}</div>`;
      attachTooltip(el, id);
      oh.appendChild(el);
    });

    // 自分の手札
    const mh = $('my-hand');
    mh.innerHTML = '';
    [...me.hand].sort((a, b) => a - b).forEach(id => {
      const el = makeCardEl(id);
      if (opts.locked) el.classList.add('disabled');
      el.addEventListener('click', () => opts.onSelect?.(id, el));
      attachTooltip(el, id);
      mh.appendChild(el);
    });

    if (!opts.keepSlots) {
      $('slot-opp').innerHTML = '';
      $('slot-me').innerHTML = '';
    }
    setHint(opts.hint ?? '');
    $('btn-confirm').classList.toggle('hidden', !opts.confirmVisible);
  }

  function markSelected(el) {
    document.querySelectorAll('.my-hand .card').forEach(c => c.classList.remove('selected'));
    el?.classList.add('selected');
  }

  function setHint(text) { $('turn-hint').textContent = text; }
  function setConfirmVisible(v) { $('btn-confirm').classList.toggle('hidden', !v); }

  // ---------- 演出ヘルパー ----------
  function floatText(anchorEl, text, cls = '') {
    const r = anchorEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = (r.left + r.width / 2 - 20) + 'px';
    el.style.top = (r.top - 8) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function flashFx(kind) {
    const el = $('fx-overlay');
    el.className = 'fx-overlay'; void el.offsetWidth;
    el.classList.add(`fx-${kind}`);
  }

  function shake() {
    const el = document.querySelector('.game-layout');
    el.classList.remove('shake'); void el.offsetWidth;
    el.classList.add('shake');
  }

  // ラウンド開始時の月齢演出
  function phaseAmbience(phase) {
    if (phase.moon === 'eclipse') { flashFx('eclipse'); SOUND.play('eclipse'); }
    else if (phase.moon === 'full') flashFx('full');
    else if (phase.moon === 'new') flashFx('new');
  }

  // ---------- ラウンド公開演出 ----------
  // result: ENGINE.resolveRound の result。myIndex 視点で表示。
  function revealRound(result, myIndex, done) {
    const myPick = result.picks[myIndex];
    const oppPick = result.picks[1 - myIndex];

    const mySlot = $('slot-me'), oppSlot = $('slot-opp');
    mySlot.innerHTML = ''; oppSlot.innerHTML = '';
    const myCard = makeCardEl(myPick);
    const oppCard = makeCardEl(oppPick);
    mySlot.appendChild(myCard); oppSlot.appendChild(oppCard);
    SOUND.play('flip');

    setTimeout(() => {
      // 効果音と演出
      if (result.phase.moon === 'full' && result.picks.includes(8) && !result.eclipse) SOUND.play('howl');
      if (result.winner === -1) {
        SOUND.play(result.events.includes('fox_draw') ? 'fox' : 'draw');
        floatText($('pot-label').textContent ? $('pot-label') : $('stake-label'), `持ち越し +${result.pot}`, 'bad');
      } else {
        const iWon = result.winner === myIndex;
        (iWon ? myCard : oppCard).classList.add('win');
        (iWon ? oppCard : myCard).classList.add('lose');
        SOUND.play(iWon ? 'win' : 'lose');
        if (result.events.includes('lantern')) {
          SOUND.play('lantern');
          floatText(iWon ? $('my-score') : $('opp-score'), '灯が消えた…', 'bad');
        } else {
          floatText(iWon ? $('my-score') : $('opp-score'), `+${result.stake}`, result.stake >= 5 ? 'big' : '');
          if (result.stake >= 5) { flashFx('bigwin'); shake(); SOUND.play('pot'); }
        }
        if (result.events.includes('tengu') || result.events.includes('kappa')) setTimeout(() => SOUND.play('coin'), 350);
        if (result.events.includes('orochi')) {
          setTimeout(() => {
            SOUND.play('steal');
            floatText(iWon ? $('opp-score') : $('my-score'), '-1', 'bad');
          }, 500);
        }
      }
      log(describeRound(result, myIndex));
      setTimeout(done, 1900);
    }, 550);
  }

  // ラウンド結果の日本語ログ
  function describeRound(r, myIndex) {
    const my = CARDS[r.picks[myIndex]], op = CARDS[r.picks[1 - myIndex]];
    let s = `あなた「${my.name}(${r.power[myIndex]})」 vs 相手「${op.name}(${r.power[1 - myIndex]})」 → `;
    if (r.winner === -1) {
      s += r.events.includes('fox_draw') ? `妖狐の妖術で引き分け！ ${r.pot}点持ち越し。` : `引き分け！ ${r.pot}点持ち越し。`;
    } else {
      const winName = r.winner === myIndex ? 'あなた' : '相手';
      if (r.events.includes('lantern')) s += `${winName}の勝ち…だが提灯おばけが灯を消した！ 月光点はポットへ（${r.pot}点）。`;
      else s += `${winName}が ${r.stake}点 を獲得！`;
      if (r.events.includes('tengu')) s += ' 天狗ボーナス+1。';
      if (r.events.includes('kappa')) s += ' 河童が皿の水で+1。';
      if (r.events.includes('orochi')) s += ' 大蛇が1点を呑み込んだ。';
      if (r.events.includes('samurai')) s += ' 侍の霊、次戦+2の構え。';
    }
    if (r.eclipse) s += '（月蝕により能力無効）';
    else if (r.canceled[myIndex] && r.picks[1 - myIndex] === 2) s += '（猫又があなたの能力を無効化）';
    else if (r.canceled[1 - myIndex] && r.picks[myIndex] === 2) s += '（猫又が相手の能力を無効化）';
    return s;
  }

  function log(text) {
    const el = $('log');
    el.querySelectorAll('.latest').forEach(e => e.classList.remove('latest'));
    const line = document.createElement('div');
    line.className = 'latest';
    line.textContent = text;
    el.prepend(line);
  }
  function clearLog() { $('log').innerHTML = ''; }

  // ---------- ツールチップ ----------
  function attachTooltip(el, cardId) {
    const tip = $('card-tooltip');
    el.addEventListener('mouseenter', e => {
      const c = CARDS[cardId];
      tip.innerHTML = `<div class="t-name">${c.id}　${c.name}（${c.kana}）</div><div>${c.text}</div><div class="t-flavor">${c.flavor}</div>`;
      tip.classList.remove('hidden');
    });
    el.addEventListener('mousemove', e => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + 'px';
      tip.style.top = Math.max(e.clientY - h - 12, 6) + 'px';
    });
    el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  }

  // ---------- 絵文字リアクション ----------
  const EMOTES = ['😼', '🔥', '😱', '🙏', '😆', '🌕'];
  let emoteTimers = { me: null, opp: null };

  function renderEmoteBar(onSend) {
    const bar = $('emote-bar');
    bar.innerHTML = '';
    EMOTES.forEach((e, i) => {
      const b = document.createElement('button');
      b.textContent = e;
      b.addEventListener('click', () => onSend(i));
      bar.appendChild(b);
    });
  }
  function setEmoteBarVisible(v) { $('emote-bar').classList.toggle('hidden', !v); }

  function showEmote(side, index) {
    if (!(index >= 0 && index < EMOTES.length)) return;
    const el = $(side === 'me' ? 'emote-me' : 'emote-opp');
    el.textContent = EMOTES[index];
    el.classList.remove('hidden');
    void el.offsetWidth; // アニメ再始動
    clearTimeout(emoteTimers[side]);
    emoteTimers[side] = setTimeout(() => el.classList.add('hidden'), 2200);
    SOUND.play('emote');
  }

  // ---------- タイトル戦績 ----------
  function renderTitleStats(stats) {
    const label = { novice: 'CPU 見習い妖怪', hard: 'CPU 大妖怪', online: 'オンライン' };
    const lines = Object.entries(label)
      .filter(([k]) => stats[k] && (stats[k].w + stats[k].l + stats[k].d) > 0)
      .map(([k, name]) => {
        const s = stats[k];
        return `${name}：<b>${s.w}勝</b> ${s.l}敗${s.d ? ` ${s.d}分` : ''}`;
      });
    $('title-stats').innerHTML = lines.length ? `⚔ これまでの戦績<br>${lines.join('　')}` : '';
  }

  // ---------- 結果 ----------
  function showResult(winner, myIndex, state, names) {
    const t = $('result-title'), d = $('result-detail');
    if (winner === -1) t.textContent = '引き分け';
    else t.textContent = winner === myIndex ? 'あなたの勝ち！' : 'あなたの負け…';
    d.textContent = `${names[0]} ${state.players[myIndex].score}点 — ${names[1]} ${state.players[1 - myIndex].score}点`;
    $('result-overlay').classList.remove('hidden');
  }
  function hideResult() { $('result-overlay').classList.add('hidden'); }

  // ---------- ルール文 ----------
  function renderRules() {
    const cardRows = CARDS.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.text}</td></tr>`).join('');
    $('rules-body').innerHTML = `
      <h3>これはどんなゲーム？</h3>
      <p>あなたと相手は<strong>まったく同じ12枚の妖怪カード</strong>（パワー0〜11）を持って、12ラウンドの勝負をします。
      毎ラウンド同時に1枚出し、勝った方がそのラウンドの<strong>月光点</strong>を獲得。合計点が多い方の勝ちです。
      使ったカードは戻りません。つまり<strong>相手の残り手札は常に丸見え</strong>——読み合いがすべてです。</p>
      <h3>月齢カード</h3>
      <p>12ラウンド分の月齢（＝得点）は最初から全部公開されています。三日月=1点、半月=2点、満月=3点（人狼が強化）、
      <strong>新月=3点（パワーの低い方が勝つ！）</strong>、<strong>月蝕=4点（能力がすべて無効）</strong>。</p>
      <h3>引き分けとポット</h3>
      <p>引き分けたラウンドの月光点は<strong>持ち越し</strong>になり、次のラウンドの賭け金に上乗せされます。
      妖狐や同カード対決（ミラー）で引き分けを重ねると、1ラウンドに大量の点がかかる大勝負が生まれます。</p>
      <h3>カード一覧</h3>
      <table><tr><th>パワー</th><th>名前</th><th>能力</th></tr>${cardRows}</table>
      <h3>細かい処理順</h3>
      <ul>
        <li>月蝕 → 猫又 → パワー修正（人狼・侍の霊）→ 妖狐の強制引き分け → 勝敗判定 の順で解決。</li>
        <li>ねずみ小僧は「修正後」パワー10以上の相手に勝つ（満月の人狼13にも勝てる）。</li>
        <li>妖狐の引き分けは巫女でも覆せない。同カード対決は必ず引き分け。</li>
        <li>最終ラウンドで持ち越しが発生した場合、その点は消滅する。</li>
      </ul>`;
  }

  return {
    showScreen, renderGame, markSelected, setHint, setConfirmVisible,
    revealRound, log, clearLog, showResult, hideResult, renderRules, $,
    phaseAmbience, renderEmoteBar, setEmoteBarVisible, showEmote, renderTitleStats,
  };
})();
