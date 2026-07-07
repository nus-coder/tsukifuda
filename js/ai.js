// ai.js — CPUプレイヤー。ENGINE の resolveRound をシミュレータとして使う。
// AI は常に player 1 とする（UI側の都合）。
'use strict';

const AI = (() => {

  // 残りラウンドで手札の「格」がどれだけ価値を持つかの簡易評価。
  // 高パワー・能力持ちほど temporal value が高い。残り賭け金でスケール。
  const BASE_VALUE = {
    0: 2.2, 1: 1.2, 2: 2.0, 3: 1.0, 4: 1.6, 5: 2.4,
    6: 1.8, 7: 2.6, 8: 2.8, 9: 3.4, 10: 3.8, 11: 4.4,
  };

  // 1手のペイオフ: (AIの得点増 - 相手の得点増) + k ×(相手が失った将来価値 - AIが失った将来価値)
  // 将来価値の重みは残りラウンドが多いほど大きく、終盤は目先の点がすべて。
  function payoff(state, myCard, oppCard) {
    const { state: next } = ENGINE.resolveRound(state, [oppCard, myCard]);
    const dMe  = next.players[1].score - state.players[1].score;
    const dOpp = next.players[0].score - state.players[0].score;
    const roundsLeft = 12 - state.round;
    const k = 0.6 * (roundsLeft - 1) / 11;
    const future = k * (BASE_VALUE[oppCard] - BASE_VALUE[myCard]);
    // 引き分けでポットが膨らむ分は、リードしている側に不利（分散が増える）として微調整
    const lead = state.players[1].score - state.players[0].score;
    const potPenalty = (next.pot - state.pot) * (lead > 0 ? -0.06 : 0.06);
    return (dMe - dOpp) + future + potPenalty;
  }

  // ===== 初心者 =====
  // 月光点に比例したパワーのカードを出そうとする（±大きなノイズ）。能力はほぼ無視。
  function pickNovice(state) {
    const hand = state.players[1].hand;
    const stake = state.phases[state.round].value + state.pot;
    const target = 2 + stake * 2.2 + (Math.random() * 6 - 3);
    let best = hand[0];
    let bestDiff = Infinity;
    for (const c of hand) {
      const diff = Math.abs(c - target);
      if (diff < bestDiff) { bestDiff = diff; best = c; }
    }
    // 25%で完全ランダム（初心者らしい迷い手）
    if (Math.random() < 0.25) return hand[Math.floor(Math.random() * hand.length)];
    return best;
  }

  // ===== ハード =====
  // 利得行列 → regret matching で混合戦略（均衡近似）→ サンプリング。
  function pickHard(state) {
    const myHand = state.players[1].hand;
    const oppHand = state.players[0].hand;
    const n = myHand.length, m = oppHand.length;
    if (n === 1) return myHand[0];

    // 行列: M[i][j] = AIが myHand[i]、相手が oppHand[j] を出したときのAIペイオフ
    const M = myHand.map(mc => oppHand.map(oc => payoff(state, mc, oc)));

    // ゼロサム近似で両者の regret matching を回す
    const regretA = new Array(n).fill(0); // AI
    const regretB = new Array(m).fill(0); // 相手
    const sumA = new Array(n).fill(0);
    const strat = arr => {
      const pos = arr.map(v => Math.max(v, 0));
      const s = pos.reduce((a, b) => a + b, 0);
      return s > 0 ? pos.map(v => v / s) : arr.map(() => 1 / arr.length);
    };
    const ITER = 400;
    for (let t = 0; t < ITER; t++) {
      const pA = strat(regretA), pB = strat(regretB);
      // 期待ペイオフ
      const uA = M.map(row => row.reduce((a, v, j) => a + v * pB[j], 0));
      const uB = oppHand.map((_, j) => myHand.reduce((a, _2, i) => a - M[i][j] * pA[i], 0));
      const evA = uA.reduce((a, v, i) => a + v * pA[i], 0);
      const evB = uB.reduce((a, v, j) => a + v * pB[j], 0);
      for (let i = 0; i < n; i++) regretA[i] += uA[i] - evA;
      for (let j = 0; j < m; j++) regretB[j] += uB[j] - evB;
      for (let i = 0; i < n; i++) sumA[i] += pA[i];
    }
    const avg = sumA.map(v => v / ITER);
    // 平均戦略からサンプリング（微小確率は切り捨てて事故を防ぐ）
    const cleaned = avg.map(p => (p < 0.04 ? 0 : p));
    const z = cleaned.reduce((a, b) => a + b, 0);
    let r = Math.random() * z;
    for (let i = 0; i < n; i++) {
      r -= cleaned[i];
      if (r <= 0) return myHand[i];
    }
    return myHand[avg.indexOf(Math.max(...avg))];
  }

  function pick(state, level) {
    return level === 'hard' ? pickHard(state) : pickNovice(state);
  }

  return { pick };
})();

if (typeof module !== 'undefined') module.exports = AI;
