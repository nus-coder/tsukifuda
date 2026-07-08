// fx.js — Canvasパーティクルエンジン（依存なし）
// 全画面の canvas に spark / glow / petal / ring を描く。UI から座標を渡して発火する。
'use strict';

const FX = (() => {
  let canvas = null, ctx = null, running = false;
  let particles = [];
  let ambient = false; // タイトル画面の蛍

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'fx-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:14;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function loop() {
    if (!particles.length && !ambient) { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    running = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (ambient && Math.random() < 0.06 && particles.length < 40) spawnFirefly();

    particles = particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity ?? 0;
      p.vx *= p.drag ?? 1; p.vy *= p.drag ?? 1;
      if (p.wobble) p.x += Math.sin(p.life * p.wobble.freq + p.wobble.phase) * p.wobble.amp;

      const a = p.fade === 'in-out' ? Math.sin(Math.PI * p.life) : p.life;
      ctx.globalAlpha = Math.max(0, Math.min(1, a * (p.alpha ?? 1)));
      if (p.type === 'ring') {
        const r = p.size * (1 - p.life) * 3 + 4;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * p.life;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.type === 'petal') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot += p.rotV);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else { // spark / glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      return true;
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  }
  function kick() { ensureCanvas(); if (!running) { running = true; requestAnimationFrame(loop); } }

  // ---- 発火API（座標は viewport px。rect を渡すと中心から） ----
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // 勝利の金色スパーク
  function burst(rect, color = 'rgba(245,220,120,.95)', n = 26, speed = 4.5) {
    const { x, y } = center(rect);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.35 + Math.random()) * speed;
      particles.push({
        type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2,
        size: 2.5 + Math.random() * 4, color, life: 1, decay: 0.016 + Math.random() * 0.014,
        gravity: 0.09, drag: 0.985,
      });
    }
    kick();
  }

  // 大勝負: 画面上部から金の紙吹雪
  function shower(n = 50) {
    for (let i = 0; i < n; i++) {
      particles.push({
        type: 'petal', x: Math.random() * canvasW(), y: -12 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 1.2, vy: 1.6 + Math.random() * 2.2,
        size: 4 + Math.random() * 4, color: ['#e8c93e', '#f5e6a8', '#c94f6a'][i % 3],
        life: 1, decay: 0.005, rot: Math.random() * Math.PI, rotV: (Math.random() - 0.5) * 0.25,
        wobble: { freq: 18 + Math.random() * 10, amp: 0.8, phase: Math.random() * 7 }, fade: 'in-out',
      });
    }
    kick();
  }
  function canvasW() { ensureCanvas(); return canvas.width; }

  // 妖狐の霧粒子
  function mist(rect) {
    for (let i = 0; i < 22; i++) {
      particles.push({
        type: 'glow',
        x: rect.left + Math.random() * rect.width,
        y: rect.top + rect.height * (0.3 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 0.9, vy: -0.25 - Math.random() * 0.5,
        size: 16 + Math.random() * 26, color: 'rgba(94,201,216,.30)',
        life: 1, decay: 0.006 + Math.random() * 0.005, fade: 'in-out',
      });
    }
    kick();
  }

  // 人狼の咆哮リング
  function ring(rect, color = 'rgba(224,82,82,.9)') {
    const { x, y } = center(rect);
    for (let i = 0; i < 3; i++) {
      particles.push({ type: 'ring', x, y, vx: 0, vy: 0, size: 26 + i * 8, color, life: 1, decay: 0.02 + i * 0.004 });
    }
    kick();
  }

  // 大蛇の強奪: 赤い流星が fromRect → toRect へ飛ぶ
  function steal(fromRect, toRect) {
    const f = center(fromRect), t = center(toRect);
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const k = i / steps;
      // 弧を描く経路上に順次出現させる
      const x = f.x + (t.x - f.x) * k;
      const y = f.y + (t.y - f.y) * k - Math.sin(Math.PI * k) * 90;
      particles.push({
        type: 'spark', x, y, vx: 0, vy: 0, size: 5 + (1 - k) * 4,
        color: 'rgba(224,100,100,.9)', life: 1, decay: 0.03, delayLife: 0,
        // 出現を遅らせるため life を先送り（decay前にaが1超えないよう fade in-out）
        fade: 'in-out',
      });
      particles[particles.length - 1].life = 1 + k * 0.8; // 後方ほど遅く消える＝流れて見える
    }
    kick();
  }

  // タイトルの蛍
  function spawnFirefly() {
    particles.push({
      type: 'glow', x: Math.random() * canvas.width, y: canvas.height * (0.3 + Math.random() * 0.7),
      vx: (Math.random() - 0.5) * 0.5, vy: -0.15 - Math.random() * 0.25,
      size: 2.5 + Math.random() * 3.5, color: 'rgba(200,255,180,.8)',
      life: 1, decay: 0.0035, fade: 'in-out',
      wobble: { freq: 6 + Math.random() * 6, amp: 0.5, phase: Math.random() * 7 },
    });
  }
  function setAmbient(on) {
    ambient = on;
    if (on) kick();
  }

  return { burst, shower, mist, ring, steal, setAmbient };
})();
