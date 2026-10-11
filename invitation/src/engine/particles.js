const PRESETS = {
  kelopak: { shape: 'petal', n: 24, vy: [28, 60], vx: [-14, 14], size: [7, 13], spin: [-2, 2], sway: true, fall: true, burstShape: 'petal' },
  debu: { shape: 'dot', n: 36, vy: [-14, -5], vx: [-5, 5], size: [1, 2.6], twinkle: true },
  bintang: { shape: 'dot', n: 55, vy: [0, 0], vx: [0, 0], size: [0.8, 2.2], twinkle: true, still: true },
  kilau: { shape: 'sparkle', n: 20, vy: [-6, -2], vx: [-4, 4], size: [4, 9], twinkle: true },
  kunang: { shape: 'glow', n: 24, vy: [-12, -3], vx: [-8, 8], size: [2, 4], twinkle: true },
  neon: { shape: 'line', n: 30, vy: [90, 220], vx: [0, 0], size: [10, 34], fall: true, burstShape: 'sparkle' },
  konfeti: { shape: 'rect', n: 0, vy: [0, 0], vx: [0, 0], size: [6, 11], spin: [-8, 8], fall: true, burstShape: 'rect' },
};

const noop = { start() {}, stop() {}, burst() {}, destroy() {} };
const rnd = (a, b) => a + Math.random() * (b - a);

/** Partikel kanvas ringan. Mengembalikan objek no-op bila tidak ada kanvas, mode ringan, atau reduced motion. */
export function createParticles(canvas, { kind, colors = ['#fff'], light = false, reduced = false } = {}) {
  const preset = PRESETS[kind];
  if (!preset || light || reduced) return noop;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return noop;

  let w = 0, h = 0, dpr = 1, raf = 0, last = 0, running = false, ps = [], ro = null;
  const pick = () => colors[Math.floor(Math.random() * colors.length)];

  function spawn(initial) {
    const size = rnd(...preset.size);
    const rises = preset.vy[1] < 0;
    return {
      shape: preset.shape, x: rnd(0, w), size, color: pick(), a: 1, burst: false,
      y: preset.still || initial ? rnd(0, h) : rises ? h + size : -size,
      vx: rnd(...preset.vx), vy: rnd(...preset.vy), g: 0,
      rot: preset.shape === 'line' ? 0 : rnd(0, 6.28), vr: preset.spin ? rnd(...preset.spin) : 0, ph: rnd(0, 6.28),
    };
  }

  function resize() {
    dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    w = canvas.clientWidth || 360;
    h = canvas.clientHeight || 640;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(p) {
    ctx.save();
    ctx.globalAlpha = p.a * (preset.twinkle && !p.burst ? 0.35 + 0.65 * Math.abs(Math.sin(p.ph)) : 1);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    switch (p.shape) {
      case 'petal':
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.283); ctx.fill(); break;
      case 'rect':
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); break;
      case 'line':
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, p.size); ctx.stroke(); break;
      case 'sparkle': {
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill(); break;
      }
      case 'glow': {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 4);
        g.addColorStop(0, p.color); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.size * 4, 0, 6.283); ctx.fill(); break;
      }
      default:
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      p.ph += dt * 2.2;
      p.rot += p.vr * dt;
      if (p.burst) { p.vy += p.g * dt; p.vx *= 0.992; p.life -= dt; p.a = Math.max(0, p.life / p.maxLife); }
      p.x += p.vx * dt + (preset.sway && !p.burst ? Math.sin(p.ph) * 14 * dt : 0);
      p.y += p.vy * dt;
      if (!p.burst && !preset.still && (p.y < -30 || p.y > h + 30 || p.x < -30 || p.x > w + 30)) Object.assign(p, spawn(false));
    }
    ps = ps.filter((p) => !p.burst || p.life > 0);
    for (const p of ps) draw(p);
    raf = requestAnimationFrame(frame);
  }

  const onVisibility = () => (document.hidden ? pause() : api.start());
  function pause() { running = false; cancelAnimationFrame(raf); }

  const api = {
    start() {
      if (running) return;
      resize();
      if (!ps.some((p) => !p.burst)) for (let i = 0; i < preset.n; i++) ps.push(spawn(true));
      running = true; last = performance.now(); raf = requestAnimationFrame(frame);
    },
    stop() { pause(); },
    burst(n = 40) {
      if (!running) return;
      const shape = preset.burstShape || 'sparkle';
      for (let i = 0; i < n; i++) {
        const a = rnd(-Math.PI, 0), v = rnd(120, 340);
        ps.push({
          shape, x: w / 2 + rnd(-20, 20), y: h * 0.52, size: rnd(5, 10), color: pick(), a: 1, burst: true,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420, rot: rnd(0, 6.28), vr: rnd(-8, 8), ph: 0,
          life: rnd(1.4, 2.4), maxLife: 2.4,
        });
      }
    },
    destroy() { pause(); document.removeEventListener('visibilitychange', onVisibility); ro && ro.disconnect(); ps = []; },
  };
  document.addEventListener('visibilitychange', onVisibility);
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => running && resize()); ro.observe(canvas); }
  return api;
}
