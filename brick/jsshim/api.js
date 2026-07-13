// jsshim/api.js — C 側から呼ぶ BRIDGE グローバル（バンドル末尾に配置）
// 状態は JS 側グローバルに保持し、C は BRIDGE の返り値を読むだけ。
// globalThis に直接ぶら下げることで JS_GetPropertyStr(globalObject, "BRIDGE") から見える。
(function (g) {
  'use strict';

  var current = null; // ENGINE の state オブジェクト

  // CARDS から表示に不要なイラスト系プロパティを除いたコピーを返す。
  // （CARD_ART は別定数なので現状 CARDS に絵は含まれないが、防御的に除外する）
  function displayCards() {
    return CARDS.map(function (c) {
      var o = {};
      for (var k in c) {
        if (k === 'art' || k === 'svg') continue;
        o[k] = c[k];
      }
      return o;
    });
  }

  g.BRIDGE = {
    // bossIndex >= 0: STORY.BOSSES[bossIndex] の pool / pot を使って開始
    // bossIndex === -1: 標準構成。startPot / poolJson(JSON文字列) で個別指定も可
    newGame: function (bossIndex, startPot, poolJson) {
      var pool, pot;
      if (typeof bossIndex === 'number' && bossIndex >= 0) {
        var boss = STORY.BOSSES[bossIndex];
        pool = boss.pool || undefined; // null なら標準 PHASE_POOL
        pot = boss.pot || 0;
      } else {
        pool = poolJson ? JSON.parse(poolJson) : undefined;
        pot = startPot || 0;
      }
      current = ENGINE.newGame(ENGINE.shufflePhases(pool), pot);
      return current;
    },

    // AI は常に player 1。level: 'novice' | 'mid' | 'hard'
    aiPick: function (level) { return AI.pick(current, level); },

    // 1ラウンド解決して内部 state を更新し、演出用 result を返す
    resolve: function (p0, p1) {
      var r = ENGINE.resolveRound(current, [p0, p1]);
      current = r.state;
      return r.result;
    },

    state: function () { return current; },
    cards: displayCards,
    moons: function () { return MOONS; },
    bosses: function () { return STORY.BOSSES; }, // 会話・pool 含む全定義
    gameWinner: function () { return current ? ENGINE.gameWinner(current) : null; },
  };
})(globalThis);
