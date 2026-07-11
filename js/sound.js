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
    // 入り(0〜0.66s)にライザー、タメ(〜3.26s)は静かに、ホイップ・アウトの瞬間に一撃
    tension: () => {
      tone(220, 0.66, { type: 'sawtooth', gain: 0.045, glide: 660 });
      tone(55, 0.66, { type: 'sine', gain: 0.09, glide: 82 });
      noise(0.12, { freq: 150, gain: 0.15, q: 2, when: 3.26 });
      tone(85, 0.16, { type: 'sine', gain: 0.12, when: 3.26 });
    },
    tensionBig: () => {
      tone(220, 0.66, { type: 'sawtooth', gain: 0.045, glide: 660 });
      tone(440, 0.66, { type: 'sawtooth', gain: 0.02, glide: 1320 });
      tone(55, 0.66, { type: 'sine', gain: 0.09, glide: 82 });
      noise(0.12, { freq: 150, gain: 0.15, q: 2, when: 3.26 });
      tone(85, 0.16, { type: 'sine', gain: 0.12, when: 3.26 });
    },
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

  // ===== BGM（生成オーケストラ風・音源ファイル不要） =====
  // 「怖いけれど、どこか楽しい月夜の祭り」がテーマ。
  // Aマイナーの壮大な進行に、ドリアの明るいDと和声的短音階のEを混ぜて
  // 不穏さとワクワクを同居させる。弦・チェロ・ピチカート・チェレスタ・
  // フルート・ティンパニの6声をスケジューラで鳴らす。
  let bgmOn = localStorage.getItem('tsukifuda-bgm') !== '0'; // 既定ON（初回操作後に開始）
  let bgm = null; // { master, timer }

  const mf = m => 440 * Math.pow(2, (m - 69) / 12); // MIDIノート→周波数

  // 8小節のコード進行（notes: 和音構成音, bass: チェロの根音）
  const PROG = [
    { notes: [57, 60, 64], bass: 45 },      // Am  — 夜の入り
    { notes: [53, 57, 60], bass: 41 },      // F   — 広がる
    { notes: [48, 55, 60, 64], bass: 36 },  // C   — 明るさが差す
    { notes: [55, 59, 62], bass: 43 },      // G   — 高揚
    { notes: [57, 60, 64], bass: 45 },      // Am
    { notes: [60, 64, 67], bass: 48 },      // C   — 楽しい寄り道
    { notes: [50, 54, 57, 62], bass: 38 },  // D(ドリア) — 妖しい笑み
    { notes: [52, 56, 59], bass: 40 },      // E(ハーモニックマイナー) — 不穏な引き戻し
  ];

  // --- 楽器 ---
  // 弦セクション: デチューンした鋸波3本＋ローパス、ゆっくり立ち上がる
  function vString(c, out, midi, t, dur, gain = 0.026) {
    for (const det of [-7, 0, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mf(midi);
      o.detune.value = det + (Math.random() * 2 - 1);
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 950; f.Q.value = 0.4;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.45);
      g.gain.setValueAtTime(gain, t + dur - 0.35);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f); f.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  // ピチカート弦: 短い三角波（跳ねるリズムの主役）
  function vPizz(c, out, midi, t, gain = 0.085) {
    const o = c.createOscillator();
    o.type = 'triangle'; o.frequency.value = mf(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(mf(midi) * 4, t);
    f.frequency.exponentialRampToValueAtTime(mf(midi) * 1.2, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.28);
  }
  // チェレスタ: 倍音つきの鐘（オルゴールの煌めき）
  function vBell(c, out, midi, t, gain = 0.06) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.32], [5.4, 0.1]]) {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = mf(midi) * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 1.2);
    }
  }
  // フルート: ビブラートつき三角波の対旋律
  function vFlute(c, out, midi, t, dur, gain = 0.045) {
    const o = c.createOscillator();
    o.type = 'triangle'; o.frequency.value = mf(midi);
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
    const lg = c.createGain(); lg.gain.value = 5;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.09);
    g.gain.setValueAtTime(gain, t + dur - 0.12);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur);
  }
  // ティンパニ: 音程が沈む正弦波
  function vTimp(c, out, t, gain = 0.15) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(82, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.55);
  }

  function startBgm() {
    if (bgm || !bgmOn) return;
    const c = ac();
    // コンプレッサーで全体をまとめ、うるさくならないように
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3.5;
    comp.connect(c.destination);
    const master = c.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.55, c.currentTime + 2.0); // フェードイン
    master.connect(comp);
    // 付点8分のエコー（チェレスタとフルート用のセンド）
    const delay = c.createDelay(1.0);
    delay.delayTime.value = 0.31;
    const fb = c.createGain(); fb.gain.value = 0.24;
    const wet = c.createGain(); wet.gain.value = 0.5;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    const echoSend = c.createGain();
    echoSend.connect(master); echoSend.connect(delay);

    const BEAT = 60 / 96, STEP = BEAT / 2, BAR = BEAT * 4; // テンポ96・4拍子
    let next = c.currentTime + 0.15, step = 0, bar = -1;
    let chord = PROG[0];

    const timer = setInterval(() => {
      // 0.4秒先まで先読みスケジュール
      while (next < c.currentTime + 0.4) {
        const inBar = step % 8; // 8分音符単位
        const calm = (bar % 16) >= 12; // 16小節ごとに4小節の静かなブレイク

        if (inBar === 0) {
          bar++;
          chord = PROG[bar % PROG.length];
          const nowCalm = (bar % 16) >= 12;
          // 弦の和音＋チェロ（ブレイク中は弦を薄く）
          chord.notes.forEach(n => vString(c, master, n, next, BAR, nowCalm ? 0.015 : 0.026));
          vString(c, master, chord.bass, next, BAR, 0.03);
          if (!nowCalm) {
            vTimp(c, master, next);
            if ((bar % 4) === 3) vTimp(c, master, next + BEAT * 3, 0.1); // 4小節目はおかず
          }
          // フルートの対旋律（2音のため息、たまに上へ跳ねて楽しげに）
          if ((bar % 2) === 1 && Math.random() < 0.75) {
            const pool = chord.notes;
            const m = pool[1 + Math.floor(Math.random() * (pool.length - 1))] + 12;
            vFlute(c, echoSend, m, next + BEAT * 1.5, BEAT * 0.9);
            vFlute(c, echoSend, m + (Math.random() < 0.4 ? 5 : 2), next + BEAT * 2.5, BEAT * 1.1);
          }
        }

        // ピチカート: 跳ねる8分音符（根音→5度→オクターブ→3度の行き来）
        if (!calm) {
          const seq = [
            chord.bass + 12, chord.notes[1], chord.notes[0] + 12, chord.notes[1],
            chord.bass + 12, chord.notes[chord.notes.length - 1], chord.notes[0] + 12, chord.notes[1],
          ];
          const swing = (inBar % 2) ? STEP * 0.1 : 0; // 裏拍を少し遅らせてスキップ感
          const accent = (inBar === 0 || inBar === 4) ? 0.095 : 0.065;
          vPizz(c, master, seq[inBar], next + swing, accent);
        }
        // チェレスタ: 裏拍にきらめき（ブレイク中はよく歌う）
        const bellChance = calm ? 0.45 : 0.28;
        if ((inBar % 2) === 1 && Math.random() < bellChance) {
          const pool = chord.notes;
          const m = pool[Math.floor(Math.random() * pool.length)] + 24 + (Math.random() < 0.15 ? 2 : 0);
          vBell(c, echoSend, m, next + STEP * 0.1);
        }

        next += STEP;
        step++;
      }
    }, 60);

    bgm = { master, comp, timer };
  }

  function stopBgm() {
    if (!bgm) return;
    try {
      clearInterval(bgm.timer);
      const c = ac();
      // 「押したら即止まる」体感のため、フェードはごく短く
      bgm.master.gain.cancelScheduledValues(c.currentTime);
      bgm.master.gain.setValueAtTime(bgm.master.gain.value, c.currentTime);
      bgm.master.gain.linearRampToValueAtTime(0, c.currentTime + 0.15);
      const m = bgm.master, cp = bgm.comp;
      setTimeout(() => { m.disconnect(); cp.disconnect(); }, 300);
    } catch (_) {}
    bgm = null;
  }

  function toggleBgm() {
    bgmOn = !bgmOn;
    localStorage.setItem('tsukifuda-bgm', bgmOn ? '1' : '0');
    if (bgmOn) startBgm(); else stopBgm();
    return bgmOn;
  }

  // アプリがバックグラウンドに回ったら音声全体を停止（復帰で再開）
  function setBackground(hidden) {
    if (!ctx) return;
    try {
      if (hidden) ctx.suspend();
      else if (ctx.state === 'suspended') ctx.resume();
    } catch (_) {}
  }

  return {
    play, toggleMute, get muted() { return muted; },
    startBgm, toggleBgm, get bgmOn() { return bgmOn; }, get bgmPlaying() { return !!bgm; },
    setBackground,
  };
})();
