// engine.js — ツキフダのゲームロジック（純粋関数のみ。DOM/AI/通信に依存しない）
// 状態は plain object。resolveRound は新しい状態を返し、引数を破壊しない。

'use strict';

const ENGINE = (() => {

  // 月齢デッキの構成: [種別, 月光点]
  // moon: 'crescent'(三日月) 'half'(半月) 'full'(満月) 'new'(新月) 'eclipse'(月蝕)
  const PHASE_POOL = [
    ...Array(4).fill({ moon: 'crescent', value: 1 }),
    ...Array(4).fill({ moon: 'half', value: 2 }),
    ...Array(2).fill({ moon: 'full', value: 3 }),
    { moon: 'new', value: 3 },
    { moon: 'eclipse', value: 4 },
  ];

  // 月齢デッキをシャッフル。pool を渡すとカスタム構成（ストーリーモードのボス用）
  function shufflePhases(pool = PHASE_POOL) {
    const deck = pool.map(p => ({ ...p }));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // 初期状態。players[0]/players[1] は対称。startPot はストーリーモードのギミック用
  function newGame(phases, startPot = 0) {
    return {
      phases,                       // 12枚の月齢カード（全公開）
      round: 0,                     // 0-indexed。12で終了
      pot: startPot,                // 持ち越し月光点
      players: [
        { hand: [...Array(12).keys()], score: 0, buff: 0 }, // hand はカードid(=パワー)の配列
        { hand: [...Array(12).keys()], score: 0, buff: 0 }, // buff: 侍の霊による次ラウンド+2
      ],
      finished: false,
    };
  }

  // 1ラウンド解決。picks = [player0のカードid, player1のカードid]
  // 返り値: { state: 次状態, result: 演出・ログ用の詳細 }
  function resolveRound(state, picks) {
    const s = structuredClone(state);
    const phase = s.phases[s.round];
    const eclipse = phase.moon === 'eclipse';

    // 能力の生死。ミラー対決でも対称に処理すれば自然に引き分けになる
    const alive = [!eclipse, !eclipse];
    // 猫又(2): 相手能力を無効化。両者猫又は同カードなのでミラー（互いに無効化）
    if (alive[0] && picks[0] === 2) alive[1] = false;
    if (alive[1] && picks[1] === 2) alive[0] = false;

    // パワー修正: 人狼(8)は満月で+5、侍バフ
    const power = [0, 1].map(i => {
      let p = picks[i];
      if (alive[i] && picks[i] === 8 && phase.moon === 'full') p += 5;
      p += s.players[i].buff;
      return p;
    });
    s.players[0].buff = 0;
    s.players[1].buff = 0;

    // 勝敗判定: winner = 0 | 1 | -1(引き分け)
    let winner = -1;
    let forcedDraw = false;
    if ((alive[0] && picks[0] === 5) || (alive[1] && picks[1] === 5)) {
      forcedDraw = true; // 妖狐: 強制引き分け（巫女でも覆らない）
    } else {
      // ねずみ小僧(0): 相手の修正後パワーが10以上なら勝つ
      const rat0 = alive[0] && picks[0] === 0 && power[1] >= 10;
      const rat1 = alive[1] && picks[1] === 0 && power[0] >= 10;
      if (rat0) winner = 0;
      else if (rat1) winner = 1;
      else if (power[0] !== power[1]) {
        const higher = power[0] > power[1] ? 0 : 1;
        winner = phase.moon === 'new' ? 1 - higher : higher;
      } else {
        // 同点: 片方だけ巫女(7)なら巫女の勝ち（ミラー巫女はあり得るが同カード=両方7で対称→引き分け）
        const miko0 = alive[0] && picks[0] === 7;
        const miko1 = alive[1] && picks[1] === 7;
        if (miko0 !== miko1) winner = miko0 ? 0 : 1;
      }
    }

    // 得点
    const stake = phase.value + s.pot; // このラウンドの賭け金
    const events = [];
    let potGain = 0;
    if (winner === -1) {
      potGain = stake;
      events.push(forcedDraw ? 'fox_draw' : 'draw');
    } else {
      const loser = 1 - winner;
      // 提灯おばけ(1): 負けたら月光点をポットへ戻す
      if (alive[loser] && picks[loser] === 1) {
        potGain = stake;
        events.push('lantern');
      } else {
        s.players[winner].score += stake;
      }
      // 天狗(4): 勝ったら+1
      if (alive[winner] && picks[winner] === 4) {
        s.players[winner].score += 1;
        events.push('tengu');
      }
      // 河童(3): 負けても+1
      if (alive[loser] && picks[loser] === 3) {
        s.players[loser].score += 1;
        events.push('kappa');
      }
      // 大蛇(9): 勝ったら相手から1点奪う
      if (alive[winner] && picks[winner] === 9 && s.players[loser].score > 0) {
        s.players[loser].score -= 1;
        s.players[winner].score += 1;
        events.push('orochi');
      }
      // 侍の霊(6): 勝ったら次ラウンド+2
      if (alive[winner] && picks[winner] === 6) {
        s.players[winner].buff = 2;
        events.push('samurai');
      }
    }

    // 手札から除去
    for (const i of [0, 1]) {
      s.players[i].hand = s.players[i].hand.filter(c => c !== picks[i]);
    }
    s.pot = potGain;
    s.round += 1;
    if (s.round >= 12) {
      s.finished = true;
      s.pot = 0; // 最終ラウンドの持ち越しは消滅
    }

    return {
      state: s,
      result: {
        picks, power, winner, stake, events, eclipse,
        phase, canceled: [!alive[0], !alive[1]],
        scores: [s.players[0].score, s.players[1].score],
        pot: s.pot,
      },
    };
  }

  // 最終勝者: 0 | 1 | -1(引き分け)
  function gameWinner(state) {
    if (!state.finished) return null;
    const [a, b] = [state.players[0].score, state.players[1].score];
    return a === b ? -1 : (a > b ? 0 : 1);
  }

  return { PHASE_POOL, shufflePhases, newGame, resolveRound, gameWinner };
})();

if (typeof module !== 'undefined') module.exports = ENGINE; // Nodeテスト用
