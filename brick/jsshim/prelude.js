// jsshim/prelude.js — QuickJS 環境シム（バンドル先頭に配置）
// 元の ../js/*.js を1バイトも変更せずに動かすための環境差吸収レイヤ。
(function (g) {
  'use strict';

  // structuredClone: engine の状態はプレーン JSON なので JSON 往復で等価
  if (typeof g.structuredClone !== 'function') {
    g.structuredClone = function (x) { return JSON.parse(JSON.stringify(x)); };
  }

  // localStorage: メモリ上ダミー（進行の永続化は C 側 save.c が担当）
  if (typeof g.localStorage === 'undefined') {
    var store = Object.create(null);
    g.localStorage = {
      getItem: function (k) { return (k in store) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    };
  }

  // console: QuickJS(-ng) に console が無い場合は print で代替
  if (typeof g.console === 'undefined' || typeof g.console.log !== 'function') {
    var out = (typeof print === 'function') ? print : function () {};
    g.console = { log: out, info: out, warn: out, error: out };
  }
})(globalThis);
