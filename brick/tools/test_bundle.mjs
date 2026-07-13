#!/usr/bin/env node
// tools/test_bundle.mjs — out/res/game.js を Node の vm で評価し、
// test/engine.test.js と同等の検証をバンドル内 ENGINE/AI に対して実行 +
// BRIDGE 経由で1試合（ランダム手 vs aiPick）を完走できることを確認する。
'use strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const brick = resolve(here, '..');
const bundlePath = join(brick, 'out', 'res', 'game.js');

// --- バンドルを素の global で評価（Node のグローバルは注入しない） ---
// console/localStorage/structuredClone はバンドル内 prelude.js のシムが賄うこと自体も検証対象。
const ctx = vm.createContext(Object.create(null));
vm.runInContext(readFileSync(bundlePath, 'utf8'), ctx, { filename: 'game.js' });
// トップレベル const/let はグローバル lexical 束縛なので、同一コンテキストの式で取り出す
const { ENGINE, AI, BRIDGE, CARDS, MOONS, STORY } = vm.runInContext(
  '({ ENGINE, AI, BRIDGE, CARDS, MOONS, STORY })', ctx);

let pass = 0, fail = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// 月齢を固定してテスト用状態を作る（test/engine.test.js と同じヘルパ）
function game(moon = 'crescent', value = 1) {
  const phases = Array(12).fill(null).map(() => ({ moon: 'crescent', value: 1 }));
  phases[0] = { moon, value };
  return ENGINE.newGame(phases);
}

// ===== test/engine.test.js と同等の検証 =====

// 基本: 高い方が勝ち、月光点獲得
{
  const { state, result } = ENGINE.resolveRound(game('half', 2), [10, 3]);
  eq('高パワー勝利', result.winner, 0);
  eq('得点', state.players[0].score, 2);
  eq('河童の負け+1', state.players[1].score, 1);
  eq('手札から消える', state.players[0].hand.includes(10), false);
}
// 新月: 低い方が勝つ
{
  const { result } = ENGINE.resolveRound(game('new', 3), [11, 4]);
  eq('新月は低い方', result.winner, 1);
}
// ねずみ小僧: 10以上に勝つ / 9には負ける
{
  eq('ねずみvs月読', ENGINE.resolveRound(game(), [0, 11]).result.winner, 0);
  eq('ねずみvs大蛇', ENGINE.resolveRound(game(), [0, 9]).result.winner, 1);
}
// 満月の人狼: 8+5=13 → 11に勝つ / ねずみには負ける
{
  eq('満月人狼vs月読', ENGINE.resolveRound(game('full', 3), [8, 11]).result.winner, 0);
  eq('満月人狼vsねずみ', ENGINE.resolveRound(game('full', 3), [8, 0]).result.winner, 1);
  eq('平時人狼vs大蛇', ENGINE.resolveRound(game(), [8, 9]).result.winner, 1);
}
// 月蝕: 能力無効（ねずみは負け、河童ボーナスなし）
{
  const { state, result } = ENGINE.resolveRound(game('eclipse', 4), [0, 11]);
  eq('月蝕でねずみ無力', result.winner, 1);
  eq('月蝕で河童系も無効', state.players[0].score, 0);
}
// 猫又: 相手能力無効（vs妖狐 → 強制引き分けが消え、5>2で狐側勝ち）
{
  const { result } = ENGINE.resolveRound(game(), [2, 5]);
  eq('猫又が妖狐を無効化', result.winner, 1);
}
// 妖狐: 強制引き分け＆ポット持ち越し
{
  const { state, result } = ENGINE.resolveRound(game('half', 2), [5, 11]);
  eq('妖狐引き分け', result.winner, -1);
  eq('ポット持ち越し', state.pot, 2);
}
// ポットの獲得
{
  let s = game('half', 2);
  s.pot = 5;
  const { state } = ENGINE.resolveRound(s, [10, 3]);
  eq('ポット込み獲得', state.players[0].score, 7);
  eq('ポットリセット', state.pot, 0);
}
// 巫女: 同点勝ち（バフ済み巫女7+2=9 vs 大蛇9）
{
  let s = game();
  s.players[0].buff = 2;
  const { result } = ENGINE.resolveRound(s, [7, 9]);
  eq('巫女の同点勝ち', result.winner, 0);
}
// ミラー対決は引き分け
{
  const { result } = ENGINE.resolveRound(game(), [7, 7]);
  eq('ミラー巫女は引き分け', result.winner, -1);
  eq('ミラー妖狐は引き分け', ENGINE.resolveRound(game(), [5, 5]).result.winner, -1);
}
// 提灯おばけ: 負けても点を渡さない
{
  const { state, result } = ENGINE.resolveRound(game('half', 2), [1, 10]);
  eq('提灯: 勝者の得点0', state.players[1].score, 0);
  eq('提灯: ポットへ', state.pot, 2);
  eq('提灯: 勝敗自体は相手', result.winner, 1);
}
// 天狗・大蛇・侍
{
  const { state } = ENGINE.resolveRound(game(), [4, 3]);
  eq('天狗+1', state.players[0].score, 2);
  let s2 = game();
  s2.players[1].score = 3;
  const r2 = ENGINE.resolveRound(s2, [9, 3]);
  eq('大蛇の強奪', [r2.state.players[0].score, r2.state.players[1].score], [2, 3]);
  const r3 = ENGINE.resolveRound(game(), [6, 3]);
  eq('侍バフ予約', r3.state.players[0].buff, 2);
  const r4 = ENGINE.resolveRound(r3.state, [5, 8]);
  eq('妖狐は常時発動', r4.result.winner, -1);
  const r5 = ENGINE.resolveRound(r3.state, [7, 8]);
  eq('バフ込みパワー', r5.result.power[0], 9);
}
// 12ラウンド完走 & 合計チェック
{
  let s = ENGINE.newGame(ENGINE.shufflePhases());
  const total = s.phases.reduce((a, p) => a + p.value, 0);
  eq('月光点合計25', total, 25);
  while (!s.finished) {
    const p0 = s.players[0].hand[Math.floor(Math.random() * s.players[0].hand.length)];
    const p1 = s.players[1].hand[Math.floor(Math.random() * s.players[1].hand.length)];
    s = ENGINE.resolveRound(s, [p0, p1]).state;
  }
  eq('12R後に終了', s.finished, true);
  eq('手札空', [s.players[0].hand.length, s.players[1].hand.length], [0, 0]);
  eq('勝者判定が返る', [-1, 0, 1].includes(ENGINE.gameWinner(s)), true);
}
// ストーリーモード用: 初期ポットとカスタム月齢プール
{
  const s = ENGINE.newGame(Array(12).fill(null).map(() => ({ moon: 'half', value: 2 })), 3);
  eq('初期ポット', s.pot, 3);
  const { state } = ENGINE.resolveRound(s, [10, 3]);
  eq('初期ポット込み獲得', state.players[0].score, 5);
  const pool = [
    ...Array(4).fill({ moon: 'crescent', value: 1 }),
    ...Array(2).fill({ moon: 'half', value: 2 }),
    ...Array(4).fill({ moon: 'full', value: 3 }),
    { moon: 'new', value: 3 },
    { moon: 'eclipse', value: 4 },
  ];
  const s2 = ENGINE.newGame(ENGINE.shufflePhases(pool));
  eq('カスタムプール枚数', s2.phases.length, 12);
  eq('カスタムプール満月4枚', s2.phases.filter(p => p.moon === 'full').length, 4);
  eq('カスタムプール合計', s2.phases.reduce((a, p) => a + p.value, 0), 27);
}
// AIスモークテスト（バンドル内 AI はバンドル内 ENGINE を直接参照している）
{
  let s = ENGINE.newGame(ENGINE.shufflePhases());
  for (const level of ['novice', 'hard']) {
    const c = AI.pick(s, level);
    eq(`AI(${level})が手札から選ぶ`, s.players[1].hand.includes(c), true);
  }
  let hardWins = 0;
  const games = 30;
  for (let g = 0; g < games; g++) {
    let st = ENGINE.newGame(ENGINE.shufflePhases());
    while (!st.finished) {
      const flip = { ...st, players: [st.players[1], st.players[0]] };
      const p0 = AI.pick(flip, 'novice');
      const p1 = AI.pick(st, 'hard');
      st = ENGINE.resolveRound(st, [p0, p1]).state;
    }
    if (ENGINE.gameWinner(st) === 1) hardWins++;
  }
  console.log(`  (参考) ハードAI vs 初心者AI: ${hardWins}/${games} 勝`);
  eq('ハードAIが勝ち越す', hardWins >= 18, true);
}

// ===== バンドル固有の検証 =====

// prelude のシムが効いている（localStorage 経由の STORY.progress が例外を出さない）
{
  eq('STORY.progress 初期値', STORY.progress(), 0);
  STORY.clearBoss(0);
  eq('STORY.clearBoss 反映', STORY.progress(), 1);
}
// 定義アクセサ
{
  eq('CARDS 12種', CARDS.length, 12);
  eq('BRIDGE.cards() 12種', BRIDGE.cards().length, 12);
  eq('BRIDGE.cards() に art なし', BRIDGE.cards().every(c => !('art' in c) && !('svg' in c)), true);
  eq('BRIDGE.moons() 5種', Object.keys(BRIDGE.moons()).length, 5);
  eq('BRIDGE.bosses() 5体', BRIDGE.bosses().length, 5);
  eq('BRIDGE.bosses() 会話含む', BRIDGE.bosses().every(b => Array.isArray(b.intro) && b.win && b.lose), true);
  eq('MOONS 参照可能', MOONS.full.name, '満月');
}
// BRIDGE 経由で1試合完走（ランダム手 vs aiPick）— 通常戦
{
  let st = BRIDGE.newGame(-1);
  eq('newGame(-1) 初期ポット0', st.pot, 0);
  eq('newGame(-1) 12ラウンド', st.phases.length, 12);
  let rounds = 0;
  while (!BRIDGE.state().finished) {
    const s = BRIDGE.state();
    const p0 = s.players[0].hand[Math.floor(Math.random() * s.players[0].hand.length)];
    const p1 = BRIDGE.aiPick('hard');
    eq(`R${rounds}: aiPick が手札内`, s.players[1].hand.includes(p1), true);
    const result = BRIDGE.resolve(p0, p1);
    eq(`R${rounds}: result.picks 一致`, result.picks, [p0, p1]);
    rounds++;
    if (rounds > 12) break;
  }
  eq('BRIDGE 1試合完走', rounds, 12);
  eq('BRIDGE.gameWinner が返る', [-1, 0, 1].includes(BRIDGE.gameWinner()), true);
}
// BRIDGE ボス戦（ガタロ: pot=3 / ミケ: 月蝕2回のカスタムプール）
{
  const st = BRIDGE.newGame(1);
  eq('ボス1(ガタロ) 初期ポット3', st.pot, 3);
  const st2 = BRIDGE.newGame(2);
  eq('ボス2(ミケ) 月蝕2枚', st2.phases.filter(p => p.moon === 'eclipse').length, 2);
  let n = 0;
  while (!BRIDGE.state().finished && n < 13) {
    const s = BRIDGE.state();
    const p0 = s.players[0].hand[0];
    BRIDGE.resolve(p0, BRIDGE.aiPick(STORY.BOSSES[2].ai));
    n++;
  }
  eq('ボス戦も完走', BRIDGE.state().finished, true);
}
// poolJson 指定の newGame
{
  const pool = JSON.stringify(Array(12).fill({ moon: 'half', value: 2 }));
  const st = BRIDGE.newGame(-1, 5, pool);
  eq('poolJson 反映', st.phases.every(p => p.moon === 'half'), true);
  eq('startPot 反映', st.pot, 5);
}

console.log(`\ntest_bundle: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
