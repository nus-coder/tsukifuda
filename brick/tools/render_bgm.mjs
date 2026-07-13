#!/usr/bin/env node
// tools/render_bgm.mjs — sound.js の BGM(生成オーケストラ風) をオフライン合成し、
// 1ループ分(8小節)のシームレスループWAV (22050Hz mono 16bit) を out/res/bgm/loop.wav に生成。
//
// sound.js からの読み取り仕様:
//   - テンポ96 BPM・4拍子: BEAT=0.625s, STEP=BEAT/2, BAR=2.5s → 8小節 = 20.0s
//   - PROG: Am / F / C / G / Am / C / D(ドリア) / E(ハーモニックマイナー)
//   - 弦(vString): 鋸波3本 detune ±7cent+乱数±1cent、LPF 950Hz Q0.4、
//                  アタック0.45s・小節末0.35sリリースで小節全長を鳴らす。和音 gain .026 / チェロ(bass) .03
//   - ピチカート(vPizz): 三角波、LPF 4f→1.2f を 0.16s で指数スイープ、attack 8ms decay 0.22s。
//                  8分音符シーケンス [bass+12, n1, n0+12, n1, bass+12, nLast, n0+12, n1]、
//                  裏拍 +STEP*0.1 スウィング、拍頭(0,4) gain .095 / 他 .065
//   - チェレスタ(vBell): sine 倍音 [1x, 2.76x .32, 5.4x .1]、attack 6ms decay 1.1s。
//                  裏拍に確率 .28 で和音構成音+24半音(15%で+2)。エコーセンドへ
//   - フルート(vFlute): 三角波 + ビブラート(5.5Hz, ±5Hz)、attack .09 release .12。
//                  奇数小節に確率 .75 で2音 (BEAT*1.5 と BEAT*2.5、2音目は +5 or +2)。エコーセンドへ
//   - ティンパニ(vTimp): sine 82→46Hz(0.25sで指数)、gain .15 から 0.5s 指数減衰。
//                  各小節頭 + 4小節目(bar%4==3)の3拍目におかず gain .1
//   - エコー: delay 0.31s, feedback 0.24, wet 0.5（ベル・フルートのみセンド、dry も master へ）
//   - master gain 0.55（フェードインはループなので省略）
//   - calm ブレイクは bar%16>=12 のため 8小節ループ(bar 0..7)では発生しない → 常時フル編成
//   - DynamicsCompressor は未再現（音量が小さくクリップしないため。妥協点）
//
// シームレスループ: ループ末尾をまたぐ音(ベル減衰・エコー尾など)は折り返して先頭にミックスする。
'use strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const BEAT = 60 / 96, STEP = BEAT / 2, BAR = BEAT * 4;
const BARS = 8;
const LOOP = BAR * BARS;          // 20.0s
const TAIL = 6.0;                 // 折り返し用に余分にレンダリングする尾の長さ
const N = Math.round(LOOP * SR);
const NTOTAL = N + Math.round(TAIL * SR);

const mf = m => 440 * Math.pow(2, (m - 69) / 12);

// 再現性のためのシード付き乱数 (mulberry32)
let seed = 0x7a4bfda; // "ツキフダ"
function rand() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const PROG = [
  { notes: [57, 60, 64], bass: 45 },      // Am
  { notes: [53, 57, 60], bass: 41 },      // F
  { notes: [48, 55, 60, 64], bass: 36 },  // C
  { notes: [55, 59, 62], bass: 43 },      // G
  { notes: [57, 60, 64], bass: 45 },      // Am
  { notes: [60, 64, 67], bass: 48 },      // C
  { notes: [50, 54, 57, 62], bass: 38 },  // D(ドリア)
  { notes: [52, 56, 59], bass: 40 },      // E(ハーモニックマイナー)
];

const master = new Float64Array(NTOTAL);  // dry バス
const echoBus = new Float64Array(NTOTAL); // ベル・フルートのエコーセンド

// ---- biquad ヘルパ（Audio EQ Cookbook LPF） ----
function lpfCoef(freq, Q) {
  const w0 = (2 * Math.PI * Math.min(freq, SR / 2 - 1)) / SR;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cosw) / 2) / a0, b1: (1 - cosw) / a0, b2: ((1 - cosw) / 2) / a0,
    a1: (-2 * cosw) / a0, a2: (1 - alpha) / a0,
  };
}

const tri = ph => (2 / Math.PI) * Math.asin(Math.sin(ph));
const saw = ph => 2 * ((ph / (2 * Math.PI)) % 1) - 1;

function addTo(buf, start, samples) {
  for (let i = 0; i < samples.length; i++) {
    const idx = start + i;
    if (idx >= 0 && idx < buf.length) buf[idx] += samples[i];
  }
}

// ---- 楽器（sound.js の各 v* を忠実に再現） ----

// 弦: デチューン鋸波3本 + LPF950Hz Q0.4。attack .45 / 小節末 .35 リリース
function vString(out, midi, t, dur, gain = 0.026) {
  const len = Math.ceil((dur + 0.1) * SR);
  const c = lpfCoef(950, 0.4);
  for (const det of [-7, 0, 7]) {
    const cents = det + (rand() * 2 - 1);
    const f = mf(midi) * Math.pow(2, cents / 1200);
    const tmp = new Float64Array(len);
    let ph = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      ph += (2 * Math.PI * f) / SR;
      const x = saw(ph);
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      let env;
      if (tt < 0.45) env = gain * (tt / 0.45);
      else if (tt < dur - 0.35) env = gain;
      else if (tt < dur) env = gain * ((dur - tt) / 0.35);
      else env = 0;
      tmp[i] = y * env;
    }
    addTo(out, Math.round(t * SR), tmp);
  }
}

// ピチカート: 三角波 + LPF 4f→1.2f 指数スイープ(0.16s)。attack 8ms、0.22sで指数減衰
function vPizz(out, midi, t, gain = 0.085) {
  const dur = 0.28;
  const len = Math.ceil(dur * SR);
  const f0 = mf(midi);
  const tmp = new Float64Array(len);
  let ph = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    ph += (2 * Math.PI * f0) / SR;
    const x = tri(ph);
    // フィルタ周波数の指数スイープ（毎サンプル係数更新）
    const fc = f0 * 4 * Math.pow(1.2 / 4, Math.min(tt, 0.16) / 0.16);
    const c = lpfCoef(fc, 1);
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    let env;
    if (tt < 0.008) env = gain * (tt / 0.008);
    else if (tt < 0.22) env = gain * Math.pow(0.0001 / gain, (tt - 0.008) / (0.22 - 0.008));
    else env = 0;
    tmp[i] = y * env;
  }
  addTo(out, Math.round(t * SR), tmp);
}

// チェレスタ: sine 倍音 [1,2.76,5.4]×[1,.32,.1]、attack 6ms、1.1sで指数減衰
function vBell(out, midi, t, gain = 0.06) {
  const dur = 1.2;
  const len = Math.ceil(dur * SR);
  const tmp = new Float64Array(len);
  for (const [ratio, amp] of [[1, 1], [2.76, 0.32], [5.4, 0.1]]) {
    const f = mf(midi) * ratio;
    const g0 = gain * amp;
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      ph += (2 * Math.PI * f) / SR;
      let env;
      if (tt < 0.006) env = g0 * (tt / 0.006);
      else if (tt < 1.1) env = g0 * Math.pow(0.0001 / g0, (tt - 0.006) / (1.1 - 0.006));
      else env = 0;
      tmp[i] += Math.sin(ph) * env;
    }
  }
  addTo(out, Math.round(t * SR), tmp);
}

// フルート: 三角波 + ビブラート(5.5Hz ±5Hz)。attack .09 / release .12
function vFlute(out, midi, t, dur, gain = 0.045) {
  const len = Math.ceil((dur + 0.05) * SR);
  const f0 = mf(midi);
  const tmp = new Float64Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const f = f0 + (tt < dur ? 5 * Math.sin(2 * Math.PI * 5.5 * tt) : 0);
    ph += (2 * Math.PI * f) / SR;
    let env;
    if (tt < 0.09) env = gain * (tt / 0.09);
    else if (tt < dur - 0.12) env = gain;
    else if (tt < dur) env = gain * ((dur - tt) / 0.12);
    else env = 0;
    tmp[i] = tri(ph) * env;
  }
  addTo(out, Math.round(t * SR), tmp);
}

// ティンパニ: sine 82→46Hz(0.25s 指数)。gain .15 から 0.5s で指数減衰
function vTimp(out, t, gain = 0.15) {
  const dur = 0.55;
  const len = Math.ceil(dur * SR);
  const tmp = new Float64Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const f = 82 * Math.pow(46 / 82, Math.min(tt, 0.25) / 0.25);
    ph += (2 * Math.PI * f) / SR;
    let env;
    if (tt < 0.5) env = gain * Math.pow(0.0001 / gain, tt / 0.5);
    else env = 0;
    tmp[i] = Math.sin(ph) * env;
  }
  addTo(out, Math.round(t * SR), tmp);
}

// ---- スケジューラ（sound.js の setInterval ループを 8 小節分だけ展開） ----
for (let bar = 0; bar < BARS; bar++) {
  const chord = PROG[bar % PROG.length];
  const barT = bar * BAR;
  // calm = (bar % 16) >= 12 → 8小節ループ内では常に false

  // 弦の和音 + チェロ
  chord.notes.forEach(n => vString(master, n, barT, BAR, 0.026));
  vString(master, chord.bass, barT, BAR, 0.03);
  // ティンパニ: 小節頭 + 4小節目のおかず
  vTimp(master, barT);
  if ((bar % 4) === 3) vTimp(master, barT + BEAT * 3, 0.1);
  // フルートの対旋律（奇数小節・確率 .75、エコーセンドへ）
  if ((bar % 2) === 1 && rand() < 0.75) {
    const pool = chord.notes;
    const m = pool[1 + Math.floor(rand() * (pool.length - 1))] + 12;
    vFlute(echoBus, m, barT + BEAT * 1.5, BEAT * 0.9);
    vFlute(echoBus, m + (rand() < 0.4 ? 5 : 2), barT + BEAT * 2.5, BEAT * 1.1);
  }

  for (let inBar = 0; inBar < 8; inBar++) {
    const t = barT + inBar * STEP;
    // ピチカート: 跳ねる8分音符
    const seq = [
      chord.bass + 12, chord.notes[1], chord.notes[0] + 12, chord.notes[1],
      chord.bass + 12, chord.notes[chord.notes.length - 1], chord.notes[0] + 12, chord.notes[1],
    ];
    const swing = (inBar % 2) ? STEP * 0.1 : 0;
    const accent = (inBar === 0 || inBar === 4) ? 0.095 : 0.065;
    vPizz(master, seq[inBar], t + swing, accent);
    // チェレスタ: 裏拍にきらめき（エコーセンドへ）
    if ((inBar % 2) === 1 && rand() < 0.28) {
      const pool = chord.notes;
      const m = pool[Math.floor(rand() * pool.length)] + 24 + (rand() < 0.15 ? 2 : 0);
      vBell(echoBus, m, t + STEP * 0.1);
    }
  }
}

// ---- エコー (delay 0.31s, feedback 0.24, wet 0.5): y[i] = x[i-D] + fb*y[i-D] ----
const D = Math.round(0.31 * SR);
const delayLine = new Float64Array(NTOTAL);
for (let i = D; i < NTOTAL; i++) {
  delayLine[i] = echoBus[i - D] + 0.24 * delayLine[i - D];
}
const MASTER_GAIN = 0.55;
const mixed = new Float64Array(NTOTAL);
for (let i = 0; i < NTOTAL; i++) {
  mixed[i] = (master[i] + echoBus[i] /* dry */ + 0.5 * delayLine[i]) * MASTER_GAIN;
}

// ---- 折り返し: ループ長を超えた尾を先頭にミックス（シームレスループ化） ----
const loop = new Float64Array(N);
for (let i = 0; i < NTOTAL; i++) loop[i % N] += (i < N) ? mixed[i] : 0; // まず本体
for (let i = N; i < NTOTAL; i++) loop[i - N] += mixed[i];               // 尾を先頭へ
// ※ 尾は TAIL=6s。エコー(0.31s×fb^k)とベル減衰(1.2s)は 6s で -80dB 以下に減衰する

// ---- クリッピング検証と書き出し ----
let peak = 0;
for (const s of loop) peak = Math.max(peak, Math.abs(s));
console.log(`render_bgm: loop ${LOOP.toFixed(2)}s, peak=${peak.toFixed(3)}`);
if (peak > 1.0) {
  // コンプレッサー未再現の代償としてピークが出た場合のみ正規化（通常は到達しない）
  const k = 0.98 / peak;
  for (let i = 0; i < N; i++) loop[i] *= k;
  console.log(`render_bgm: normalized by ${k.toFixed(3)}`);
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'out', 'res', 'bgm');
mkdirSync(outDir, { recursive: true });
const buf = Buffer.alloc(44 + N * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, loop[i])) * 32767), 44 + i * 2);
}
const path = join(outDir, 'loop.wav');
writeFileSync(path, buf);
console.log(`render_bgm: wrote ${path} (${buf.length} bytes, ${(N / SR).toFixed(2)}s @ ${SR}Hz mono 16bit)`);
