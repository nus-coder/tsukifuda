// sound.js — Web Audio API による効果音合成（音声ファイル不要）
'use strict';

const SOUND = (() => {
  let ctx = null;
  let muted = localStorage.getItem('tsukifuda-muted') === '1';

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 単音。glide指定で周波数スライド
  function tone(freq, dur, { type = 'sine', gain = 0.12, when = 0, glide = null, vibrato = 0 } = {}) {
    const c = ac();
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
    if (vibrato > 0) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 6; lg.gain.value = vibrato;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t0); lfo.stop(t0 + dur);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // ノイズバースト（めくり音・吹き消し音）
  function noise(dur, { gain = 0.1, when = 0, freq = 1200, q = 1 } = {}) {
    const c = ac();
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
  }

  const FX = {
    click:   () => tone(880, 0.06, { type: 'square', gain: 0.05 }),
    select:  () => tone(660, 0.09, { type: 'triangle', gain: 0.08 }),
    flip:    () => { noise(0.12, { freq: 2000, gain: 0.14 }); tone(520, 0.08, { type: 'triangle', when: 0.03, gain: 0.06 }); },
    win:     () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', when: i * 0.09, gain: 0.11 })),
    lose:    () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'sine', when: i * 0.14, gain: 0.1 })),
    draw:    () => { tone(440, 0.2, { type: 'sine' }); tone(445, 0.24, { type: 'sine', when: 0.02, gain: 0.07 }); },
    pot:     () => [1319, 1568, 1319].forEach((f, i) => tone(f, 0.09, { type: 'square', when: i * 0.07, gain: 0.05 })),
    coin:    () => { tone(1976, 0.12, { type: 'square', gain: 0.05 }); tone(2637, 0.18, { type: 'square', when: 0.06, gain: 0.05 }); },
    eclipse: () => { tone(70, 1.4, { type: 'sawtooth', gain: 0.1, glide: 45 }); tone(140, 1.2, { type: 'sine', gain: 0.06, glide: 90 }); },
    howl:    () => tone(400, 1.1, { type: 'sine', gain: 0.11, glide: 750, vibrato: 12 }),
    fox:     () => [880, 1109, 1319, 1109, 880].forEach((f, i) => tone(f, 0.12, { type: 'sine', when: i * 0.07, gain: 0.06 })),
    lantern: () => noise(0.4, { freq: 500, gain: 0.12, q: 0.6 }),
    steal:   () => { noise(0.3, { freq: 3500, gain: 0.07, q: 2 }); tone(300, 0.3, { type: 'sawtooth', gain: 0.05, glide: 120 }); },
    emote:   () => tone(988, 0.1, { type: 'triangle', gain: 0.08, glide: 1319 }),
    start:   () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.25, { type: 'triangle', when: i * 0.11, gain: 0.09 })),
  };

  function play(name) {
    if (muted || !FX[name]) return;
    try { FX[name](); } catch (_) { /* AudioContext不可の環境では黙って無効化 */ }
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('tsukifuda-muted', muted ? '1' : '0');
    return muted;
  }

  // ===== BGM（生成音楽・音源ファイル不要） =====
  // 陰旋法（A, B♭, D, E, F）の琴風プラック＋低音ドローン＋エコー。
  // ランダム生成なので同じフレーズは二度と鳴らない。
  let bgmOn = localStorage.getItem('tsukifuda-bgm') !== '0'; // 既定ON（初回操作後に開始）
  let bgm = null; // { master, drone: [osc], timer }

  const SCALE = [220.0, 233.1, 293.7, 329.6, 349.2, 440.0, 466.2, 587.3]; // A3陰旋法+オクターブ

  function pluck(c, dest, freq, when, gain) {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 6, when);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + 1.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
    osc.connect(f); f.connect(g); g.connect(dest);
    osc.start(when); osc.stop(when + 1.8);
  }

  function startBgm() {
    if (bgm || !bgmOn) return;
    const c = ac();
    const master = c.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.5, c.currentTime + 2.5); // フェードイン
    master.connect(c.destination);

    // エコー（琴の残響）
    const delay = c.createDelay(1.0);
    delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const wet = c.createGain(); wet.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);

    // 低音ドローン（夜の底）
    const drone = [55, 110.3].map(fr => {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = fr;
      const g = c.createGain(); g.gain.value = fr < 100 ? 0.05 : 0.025;
      o.connect(g); g.connect(master);
      o.start();
      return o;
    });

    // フレーズ生成: 1〜3音の小節をランダムな間で置いていく
    let stopped = false;
    const inst = { master, drone, stop: () => { stopped = true; } };
    (function phrase() {
      if (stopped) return;
      const t0 = c.currentTime + 0.05;
      const notes = 1 + Math.floor(Math.random() * 3);
      let base = Math.floor(Math.random() * SCALE.length);
      for (let i = 0; i < notes; i++) {
        const idx = Math.min(SCALE.length - 1, Math.max(0, base + Math.floor(Math.random() * 5) - 2));
        const out = c.createGain(); out.gain.value = 1;
        out.connect(master); out.connect(delay);
        pluck(c, out, SCALE[idx], t0 + i * (0.35 + Math.random() * 0.3), 0.10 + Math.random() * 0.05);
        base = idx;
      }
      inst.timer = setTimeout(phrase, 2200 + Math.random() * 2800);
    })();
    bgm = inst;
  }

  function stopBgm() {
    if (!bgm) return;
    try {
      bgm.stop();
      clearTimeout(bgm.timer);
      const c = ac();
      bgm.master.gain.cancelScheduledValues(c.currentTime);
      bgm.master.gain.setValueAtTime(bgm.master.gain.value, c.currentTime);
      bgm.master.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
      const m = bgm.master, d = bgm.drone;
      setTimeout(() => { d.forEach(o => { try { o.stop(); } catch (_) {} }); m.disconnect(); }, 900);
    } catch (_) {}
    bgm = null;
  }

  function toggleBgm() {
    bgmOn = !bgmOn;
    localStorage.setItem('tsukifuda-bgm', bgmOn ? '1' : '0');
    if (bgmOn) startBgm(); else stopBgm();
    return bgmOn;
  }

  return {
    play, toggleMute, get muted() { return muted; },
    startBgm, toggleBgm, get bgmOn() { return bgmOn; }, get bgmPlaying() { return !!bgm; },
  };
})();
