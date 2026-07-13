#!/usr/bin/env node
// tools/render_sfx.mjs — sound.js の tone()/noise() と FX 定義を Web Audio なしの
// 純計算でオフライン合成し、22050Hz mono 16bit WAV を out/res/sfx/ に生成する。
//
// 再現している Web Audio 挙動:
//   - tone: gain 0 →(linearRamp 15ms)→ gain →(exponentialRamp)→ 0.0001 @ dur
//           glide は frequency.exponentialRampToValueAtTime(dur かけて)
//           vibrato は 6Hz LFO を frequency に加算
//   - noise: 白色雑音 → biquad bandpass(Audio EQ Cookbook, 0dB peak 版) →
//            gain →(exponentialRamp)→ 0.0001 @ dur
//   - tension / tensionBig はライザー部(when<3)とヒット部(when≈3.26, 先頭詰め)を分割出力
'use strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'out', 'res', 'sfx');
mkdirSync(outDir, { recursive: true });

// ---- 波形（Web Audio の OscillatorNode 相当。ナイーブ波形で十分な周波数帯） ----
const WAVE = {
  sine: ph => Math.sin(ph),
  square: ph => (Math.sin(ph) >= 0 ? 1 : -1),
  sawtooth: ph => 2 * ((ph / (2 * Math.PI)) % 1) - 1,
  triangle: ph => (2 / Math.PI) * Math.asin(Math.sin(ph)),
};

// ---- ミキサー: 各音源が Float64Array に加算していく ----
function makeMix(totalDur) {
  return new Float64Array(Math.ceil(totalDur * SR) + 1);
}

// sound.js の tone() 相当
function tone(mix, freq, dur, { type = 'sine', gain = 0.12, when = 0, glide = null, vibrato = 0 } = {}) {
  const start = Math.floor(when * SR);
  const len = Math.ceil((dur + 0.05) * SR); // osc.stop(t0 + dur + 0.05)
  const attack = 0.015;
  const ratio = glide ? glide / freq : 1;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    // 周波数: exponentialRamp（dur 到達後は glide 値で保持）
    let f = glide
      ? freq * Math.pow(ratio, Math.min(t, dur) / dur)
      : freq;
    // ビブラート: 6Hz LFO（t0〜t0+dur の間だけ動作）
    if (vibrato > 0 && t < dur) f += vibrato * Math.sin(2 * Math.PI * 6 * t);
    phase += (2 * Math.PI * f) / SR;
    // エンベロープ
    let env;
    if (t < attack) env = gain * (t / attack); // linearRamp
    else if (t <= dur) env = gain * Math.pow(0.0001 / gain, (t - attack) / (dur - attack)); // exponentialRamp
    else env = 0.0001; // ランプ終了後は最終値で保持（〜stop まで）
    const idx = start + i;
    if (idx < mix.length) mix[idx] += WAVE[type](phase) * env;
  }
}

// Audio EQ Cookbook の bandpass（constant 0 dB peak gain 版 = Web Audio 仕様）
function bandpass(samples, freq, Q) {
  const w0 = (2 * Math.PI * freq) / SR;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const out = new Float64Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

// sound.js の noise() 相当
function noise(mix, dur, { gain = 0.1, when = 0, freq = 1200, q = 1 } = {}) {
  const start = Math.floor(when * SR);
  const len = Math.max(1, Math.floor(SR * dur));
  const white = new Float64Array(len);
  for (let i = 0; i < len; i++) white[i] = Math.random() * 2 - 1;
  const filtered = bandpass(white, freq, q);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = gain * Math.pow(0.0001 / gain, t / dur); // setValueAtTime → exponentialRamp
    const idx = start + i;
    if (idx < mix.length) mix[idx] += filtered[i] * env;
  }
}

// ---- FX 定義（sound.js の FX と同一パラメータ） ----
// 各エントリは (mix ヘルパ) => void と、必要バッファ長
const FX = {
  click:  { dur: 0.15, render: m => tone(m, 880, 0.06, { type: 'square', gain: 0.05 }) },
  select: { dur: 0.2,  render: m => tone(m, 660, 0.09, { type: 'triangle', gain: 0.08 }) },
  flip:   { dur: 0.25, render: m => { noise(m, 0.12, { freq: 2000, gain: 0.14 }); tone(m, 520, 0.08, { type: 'triangle', when: 0.03, gain: 0.06 }); } },
  win:    { dur: 0.6,  render: m => [523, 659, 784, 1047].forEach((f, i) => tone(m, f, 0.22, { type: 'triangle', when: i * 0.09, gain: 0.11 })) },
  lose:   { dur: 0.7,  render: m => [392, 330, 262].forEach((f, i) => tone(m, f, 0.3, { type: 'sine', when: i * 0.14, gain: 0.1 })) },
  draw:   { dur: 0.35, render: m => { tone(m, 440, 0.2, { type: 'sine' }); tone(m, 445, 0.24, { type: 'sine', when: 0.02, gain: 0.07 }); } },
  pot:    { dur: 0.35, render: m => [1319, 1568, 1319].forEach((f, i) => tone(m, f, 0.09, { type: 'square', when: i * 0.07, gain: 0.05 })) },
  coin:   { dur: 0.35, render: m => { tone(m, 1976, 0.12, { type: 'square', gain: 0.05 }); tone(m, 2637, 0.18, { type: 'square', when: 0.06, gain: 0.05 }); } },
  eclipse:{ dur: 1.5,  render: m => { tone(m, 70, 1.4, { type: 'sawtooth', gain: 0.1, glide: 45 }); tone(m, 140, 1.2, { type: 'sine', gain: 0.06, glide: 90 }); } },
  howl:   { dur: 1.2,  render: m => tone(m, 400, 1.1, { type: 'sine', gain: 0.11, glide: 750, vibrato: 12 }) },
  fox:    { dur: 0.5,  render: m => [880, 1109, 1319, 1109, 880].forEach((f, i) => tone(m, f, 0.12, { type: 'sine', when: i * 0.07, gain: 0.06 })) },
  lantern:{ dur: 0.45, render: m => noise(m, 0.4, { freq: 500, gain: 0.12, q: 0.6 }) },
  steal:  { dur: 0.4,  render: m => { noise(m, 0.3, { freq: 3500, gain: 0.07, q: 2 }); tone(m, 300, 0.3, { type: 'sawtooth', gain: 0.05, glide: 120 }); } },
  emote:  { dur: 0.2,  render: m => tone(m, 988, 0.1, { type: 'triangle', gain: 0.08, glide: 1319 }) },
  start:  { dur: 0.7,  render: m => [392, 523, 659, 784].forEach((f, i) => tone(m, f, 0.25, { type: 'triangle', when: i * 0.11, gain: 0.09 })) },

  // tension / tensionBig: ライザー部(when < 3 の成分)とヒット部(when≈3.26 の成分を 0 秒に詰める)に分割
  tension_riser: { dur: 0.75, render: m => {
    tone(m, 220, 0.66, { type: 'sawtooth', gain: 0.045, glide: 660 });
    tone(m, 55, 0.66, { type: 'sine', gain: 0.09, glide: 82 });
  } },
  tension_hit: { dur: 0.25, render: m => {
    noise(m, 0.12, { freq: 150, gain: 0.15, q: 2, when: 0 });
    tone(m, 85, 0.16, { type: 'sine', gain: 0.12, when: 0 });
  } },
  tensionBig_riser: { dur: 0.75, render: m => {
    tone(m, 220, 0.66, { type: 'sawtooth', gain: 0.045, glide: 660 });
    tone(m, 440, 0.66, { type: 'sawtooth', gain: 0.02, glide: 1320 });
    tone(m, 55, 0.66, { type: 'sine', gain: 0.09, glide: 82 });
  } },
  tensionBig_hit: { dur: 0.25, render: m => {
    noise(m, 0.12, { freq: 150, gain: 0.15, q: 2, when: 0 });
    tone(m, 85, 0.16, { type: 'sine', gain: 0.12, when: 0 });
  } },
};

// ---- WAV 書き出し (22050Hz mono 16bit PCM) ----
function writeWav(path, samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak > 1.0) throw new Error(`${path}: クリッピング (peak=${peak.toFixed(3)})`);
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(SR, 24);           // sample rate
  buf.writeUInt32LE(SR * 2, 28);       // byte rate
  buf.writeUInt16LE(2, 32);            // block align
  buf.writeUInt16LE(16, 34);           // bits
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
  return { bytes: buf.length, seconds: n / SR, peak };
}

for (const [name, fx] of Object.entries(FX)) {
  const mix = makeMix(fx.dur);
  fx.render(mix);
  const path = join(outDir, `${name}.wav`);
  const info = writeWav(path, mix);
  console.log(`render_sfx: ${name}.wav ${info.seconds.toFixed(2)}s peak=${info.peak.toFixed(3)} (${info.bytes} bytes)`);
}
console.log(`render_sfx: ${Object.keys(FX).length} files ok`);
