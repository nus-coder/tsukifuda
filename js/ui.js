// ui.js — DOM描画。ゲーム進行は main.js が握り、UI は描画と入力通知のみ。
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);

  // ---------- 画面遷移 ----------
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(`screen-${name}`).classList.add('active');
    document.body.dataset.screen = name; // ☰ボタンの表示制御などに使う
    FX.setAmbient(name === 'title'); // タイトルでは蛍を飛ばす
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
      <div class="text">${c.short}</div>`;
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
    $('card-tooltip').classList.add('hidden'); // 再描画でホバー元が消えると残留するため
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
      const alertEl = $('phase-alert');
      alertEl.className = 'phase-alert hidden';
      if (ph.moon === 'new') {
        alertEl.textContent = '🌑 新月：パワーの低い方が勝つ！';
        alertEl.className = 'phase-alert alert-new';
      } else if (ph.moon === 'eclipse') {
        alertEl.textContent = '🌘 月蝕：全カードの能力無効！';
        alertEl.className = 'phase-alert alert-eclipse';
      } else if (ph.moon === 'full') {
        alertEl.textContent = '🌕 満月：人狼はパワー+5';
        alertEl.className = 'phase-alert alert-full';
      }
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
    document.body.appendChild(el);
    // 画面上端付近のアンカーは下方向に流す（音量ボタンのトースト等）
    const down = r.top < 80;
    if (down) el.classList.add('down');
    el.style.left = Math.min(r.left + r.width / 2 - 20, window.innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = (down ? r.bottom + 6 : r.top - 8) + 'px';
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

  // 大勝負カットイン（賭点5点以上、公開直前のタメ演出）
  function showCutIn(stake, done) {
    const el = $('cutin');
    const escalate = stake >= 8;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('cutin-phrase').textContent = escalate ? '逢魔ヶ刻' : '月下大勝負';
    $('cutin-stake').textContent = `${stake}点`;
    el.classList.remove('hidden', 'play', 'escalate');
    void el.offsetWidth;
    el.classList.toggle('escalate', escalate);
    el.classList.add('play');
    SOUND.play(escalate ? 'tensionBig' : 'tension');
    setTimeout(() => {
      el.classList.remove('play', 'escalate');
      el.classList.add('hidden');
      done();
    }, reduced ? 300 : 840);
  }

  // ---------- ラウンド公開演出 ----------
  // result: ENGINE.resolveRound の result。myIndex 視点で表示。
  function revealRound(result, myIndex, done) {
    if (result.stake >= 5) { showCutIn(result.stake, () => doReveal(result, myIndex, done)); return; }
    doReveal(result, myIndex, done);
  }

  function doReveal(result, myIndex, done) {
    const myPick = result.picks[myIndex];
    const oppPick = result.picks[1 - myIndex];

    const mySlot = $('slot-me'), oppSlot = $('slot-opp');
    mySlot.innerHTML = ''; oppSlot.innerHTML = '';
    const myCard = makeCardEl(myPick);
    const oppCard = makeCardEl(oppPick);
    mySlot.appendChild(myCard); oppSlot.appendChild(oppCard);
    SOUND.play('flip');

    setTimeout(() => {
      // ---- カード固有演出 ----
      const bz = document.querySelector('.battle-zone');
      const cardEl = i => (i === myIndex ? myCard : oppCard);
      // 妖狐の霧
      if (result.events.includes('fox_draw')) {
        const m = document.createElement('div');
        m.className = 'mist';
        bz.appendChild(m);
        setTimeout(() => m.remove(), 2300);
        FX.mist(bz.getBoundingClientRect());
      }
      // 人狼の変身（満月）
      [0, 1].forEach(i => {
        if (result.picks[i] === 8 && result.phase.moon === 'full' && !result.canceled[i]) {
          cardEl(i).classList.add('wolf-transform');
          floatText(cardEl(i), '+5', 'big');
          FX.ring(cardEl(i).getBoundingClientRect());
        }
      });
      // ねずみ小僧の下剋上
      if (result.winner !== -1 && result.picks[result.winner] === 0 && result.power[1 - result.winner] >= 10) {
        cardEl(result.winner).classList.add('gekokujo');
        floatText(cardEl(result.winner), '下剋上！', 'big');
      }
      // 猫又の「封」スタンプ（能力持ちが無効化されたときだけ）
      [0, 1].forEach(i => {
        if (!result.eclipse && result.canceled[i] && result.picks[1 - i] === 2 &&
            result.picks[i] !== 2 && ![10, 11].includes(result.picks[i])) {
          const s = document.createElement('div');
          s.className = 'seal-stamp';
          s.textContent = '封';
          cardEl(i).appendChild(s);
        }
      });

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
          FX.burst((iWon ? myCard : oppCard).getBoundingClientRect());
          if (result.stake >= 5) { flashFx('bigwin'); shake(); SOUND.play('pot'); FX.shower(); }
        }
        if (result.events.includes('tengu') || result.events.includes('kappa')) setTimeout(() => SOUND.play('coin'), 350);
        if (result.events.includes('orochi')) {
          setTimeout(() => {
            SOUND.play('steal');
            floatText(iWon ? $('opp-score') : $('my-score'), '-1', 'bad');
            const from = (iWon ? $('opp-score') : $('my-score')).getBoundingClientRect();
            const to = (iWon ? $('my-score') : $('opp-score')).getBoundingClientRect();
            FX.steal(from, to);
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
  // カード説明は固定位置に表示する（マウス追従だとカードや出し場に被って見づらいため）。
  // 自分のカード → 手札のすぐ上 / 相手のカード → 相手手札のすぐ下、いずれも中央寄せ。
  function attachTooltip(el, cardId) {
    const tip = $('card-tooltip');
    el.addEventListener('mouseenter', () => {
      const c = CARDS[cardId];
      tip.innerHTML = `<div class="t-name">${c.id}　${c.name}（${c.kana}）</div><div>${c.text}</div><div class="t-flavor">${c.flavor}</div>`;
      tip.classList.remove('hidden');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px';
      if (el.closest('.opp-hand')) {
        const hand = $('opp-hand').getBoundingClientRect();
        tip.style.top = Math.min(hand.bottom + 8, window.innerHeight - h - 8) + 'px';
      } else {
        const hand = $('my-hand').getBoundingClientRect();
        tip.style.top = Math.max(8, hand.top - h - 22) + 'px';
      }
    });
    el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  }

  // ---------- 絵文字リアクション ----------
  const EMOTES = ['😼', '🔥', '😱', '🙏', '😆', '🌕'];

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

  // スタンプは画面中央にフロート表示（相手=上寄り / 自分=下寄り）
  function showEmote(side, index) {
    if (!(index >= 0 && index < EMOTES.length)) return;
    const el = document.createElement('div');
    el.className = `emote-float ${side === 'me' ? 'me' : 'opp'}`;
    el.textContent = EMOTES[index];
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
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
    // ストーリー用装飾をリセット（必要なら decorateStoryResult で付け直す）
    $('result-story-msg').classList.add('hidden');
    $('btn-story-back').classList.add('hidden');
    $('btn-rematch').textContent = 'もう一回';
    $('result-overlay').classList.remove('hidden');
  }
  function hideResult() { $('result-overlay').classList.add('hidden'); }

  // ---------- 遊び方（ページ式チュートリアル） ----------
  let rulesPage = 0;

  function rulesPages() {
    const miniCard = id => `<div class="tut-card"><div class="card">${cardHTML(id)}</div></div>`;
    const moonItem = (m, v) =>
      `<div class="tut-moon">${moonIconSVG(m)}<b>${MOONS[m].name}（${v}点）</b>${MOONS[m].desc}</div>`;
    const cardRows = CARDS.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.text}</td></tr>`).join('');
    return [
      `<h3>1. 同じ手札で、同時に出す</h3>
       <p>あなたと相手は<strong>まったく同じ12枚の妖怪カード</strong>（パワー0〜11）を持って、12ラウンド戦います。
       毎ラウンド<strong>同時に1枚</strong>出して、基本は<strong>パワーの高い方が勝ち</strong>。
       勝った方がそのラウンドの<strong>月光点</strong>をもらい、合計点で勝敗が決まります。</p>
       <div class="tut-visual">${miniCard(4)}<span class="vs">VS</span>${miniCard(9)}</div>
       <p>使ったカードは戻りません。お互い同じデッキだから、<strong>相手の残り手札は常に丸見え</strong>。
       「相手にはまだ月読(11)が残ってる…どこで切ってくる？」——この読み合いがすべてです。</p>`,
      `<h3>2. 月齢カード＝そのラウンドの点数</h3>
       <p>12ラウンド分の月齢は<strong>最初から全部公開</strong>されています。
       高得点のラウンドがいつ来るかわかるので、強いカードの温存と投入が戦略になります。</p>
       <div class="tut-visual">
         ${moonItem('crescent', 1)}${moonItem('half', 2)}${moonItem('full', 3)}${moonItem('new', 3)}${moonItem('eclipse', 4)}
       </div>
       <p><strong>新月はパワーの低い方が勝ち</strong>、<strong>月蝕は能力がすべて無効</strong>。
       強いカードほど危ないラウンドがある——ここで形勢がひっくり返ります。</p>`,
      `<h3>3. 引き分けは「持ち越し」で膨らむ</h3>
       <p>引き分けたラウンドの月光点は<strong>ポットに持ち越され</strong>、次のラウンドの賭け金に上乗せされます。
       妖狐（強制引き分け）や同カード対決（ミラー）が続くと、1ラウンドに8点以上かかる大勝負に！</p>
       <div class="tut-visual">${miniCard(5)}<span class="vs">＝</span>${miniCard(7)}</div>
       <h3>能力の処理順（細かいルール）</h3>
       <ul>
         <li>月蝕 → 猫又 → パワー修正（人狼・侍の霊）→ 妖狐の強制引き分け → 勝敗判定 の順。</li>
         <li>ねずみ小僧は「修正後」パワー10以上の相手に勝つ（満月の人狼13にも勝てる）。</li>
         <li>妖狐の引き分けは巫女でも覆せない。同カード対決は必ず引き分け。</li>
         <li>最終ラウンドの持ち越しは消滅する。</li>
       </ul>`,
      `<h3>4. カード一覧</h3>
       <table><tr><th>パワー</th><th>名前</th><th>能力</th></tr>${cardRows}</table>`,
    ];
  }

  function renderRules(page = 0) {
    const pages = rulesPages();
    rulesPage = Math.min(Math.max(page, 0), pages.length - 1);
    $('rules-body').innerHTML = pages[rulesPage];
    $('rules-prev').disabled = rulesPage === 0;
    $('rules-next').disabled = rulesPage === pages.length - 1;
    $('rules-dots').innerHTML = pages.map((_, i) => `<span class="${i === rulesPage ? 'on' : ''}">●</span>`).join('');
  }
  $('rules-prev').addEventListener('click', () => { renderRules(rulesPage - 1); SOUND.play('click'); });
  $('rules-next').addEventListener('click', () => { renderRules(rulesPage + 1); SOUND.play('click'); });

  function setRulesBackLabel(text) { $('rules-back').textContent = text; }

  // ---------- ストーリー ----------
  function renderStory(onSelect) {
    const prog = STORY.progress();
    const list = $('boss-list');
    list.innerHTML = '';
    if (prog >= STORY.BOSSES.length) {
      const banner = document.createElement('div');
      banner.className = 'story-clear-banner';
      banner.textContent = '🌕 全妖怪制覇！今宵より月夜はあなたのもの 🌕';
      list.appendChild(banner);
    }
    STORY.BOSSES.forEach((b, i) => {
      const locked = i > prog;
      const el = document.createElement('button');
      el.className = 'boss-card' + (locked ? ' locked' : '') + (i < prog ? ' cleared' : '');
      el.innerHTML = `
        <div class="boss-portrait">${CARD_ART[b.art]}</div>
        <div class="boss-info">
          <div class="b-title">${b.title}</div>
          <div class="b-name">${locked ? '？？？' : b.name}</div>
          <div class="b-gimmick">${locked ? '前の相手を倒すと挑める。' : b.gimmick}</div>
        </div>
        <div class="boss-mark">${i < prog ? '✅' : (locked ? '🔒' : '⚔️')}</div>`;
      if (!locked) el.addEventListener('click', () => onSelect(i));
      list.appendChild(el);
    });
  }

  // 会話再生。クリックで進み、全行読み終えたら onDone
  let dialogueState = null;
  function showDialogue(boss, lines, onDone) {
    dialogueState = { lines, index: 0, onDone };
    $('dialogue-portrait').innerHTML = CARD_ART[boss.art];
    $('dialogue-name').textContent = boss.name;
    $('dialogue-text').textContent = lines[0];
    $('dialogue-overlay').classList.remove('hidden');
  }
  $('dialogue-overlay').addEventListener('click', () => {
    if (!dialogueState) return;
    SOUND.play('click');
    dialogueState.index += 1;
    if (dialogueState.index < dialogueState.lines.length) {
      $('dialogue-text').textContent = dialogueState.lines[dialogueState.index];
    } else {
      $('dialogue-overlay').classList.add('hidden');
      const done = dialogueState.onDone;
      dialogueState = null;
      done?.();
    }
  });

  // ストーリー用の結果画面装飾（showResult の後に呼ぶ）
  function decorateStoryResult(message, rematchLabel) {
    const msgEl = $('result-story-msg');
    msgEl.textContent = message;
    msgEl.classList.remove('hidden');
    $('btn-story-back').classList.remove('hidden');
    $('btn-rematch').textContent = rematchLabel;
  }

  return {
    showScreen, renderGame, markSelected, setHint, setConfirmVisible,
    revealRound, log, clearLog, showResult, hideResult, renderRules, $,
    phaseAmbience, renderEmoteBar, setEmoteBarVisible, showEmote, renderTitleStats,
    setRulesBackLabel, renderStory, showDialogue, decorateStoryResult, floatText,
  };
})();
