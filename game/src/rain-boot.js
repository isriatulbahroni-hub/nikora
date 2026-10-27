// Hujan acak di halaman hotel (/hotel.html): menyambungkan drive-weather.js ke game. Sebelumnya modul cuaca itu belum dipakai siapa pun.
//  - Jadwal hujan dari jam dinding (sama untuk semua pemain, tiba-tiba, gerimis lalu makin deras lalu reda): createWeather().
//  - Tampilan: guratan hujan di atas layar dan layar sedikit meredup/kelabu. Miring mengikuti laju mobil.
//  - Fisika: jalan basah memperkecil grip ban (setWetness di vehicle.js), dan mengering pelan setelah hujan reda.
//  - Kontrol: tombol "Hujan" di panel ⋯ mobil, tombol U di papan ketik, ?hujan=1 (langsung hujan), ?cuaca=0 (tanpa hujan acak), ?cuaca=cepat (waktu 30x).
//  - window.__weather: intensity(), active(), start(), calm(), toggle(), next() (pengujian).
import { createWeather } from './drive-weather.js';
import { setWetness } from './vehicle.js';

const MAX_DROPS = 260;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function mountRain({ search = window.location.search, root = document.body } = {}) {
  const weather = createWeather({ search });
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:4;pointer-events:none';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  addEventListener('resize', resize);

  const drops = Array.from({ length: MAX_DROPS }, () => ({ x: Math.random(), y: Math.random(), l: 0.5 + Math.random() * 0.5, v: 0.8 + Math.random() * 0.6 }));
  let wet = 0; // 0..1: jalan basah (mengering pelan, ~20 dtk)
  let drawn = false;
  let last = performance.now();
  let toastTimer = 0;
  const say = (text) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2400);
  };

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const level = weather.intensity();
    wet += (level - wet) * (1 - Math.exp(-dt / (level > wet ? 6 : 20)));
    setWetness(wet > 0.05 ? wet : 0);
    if (level < 0.01) {
      if (drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
      return;
    }
    drawn = true;
    const car = window.__hotel?.driving?.();
    const slant = 0.12 + clamp(Math.abs(car?.speed ?? 0) / 45, 0, 1) * 0.9; // makin cepat makin miring ke belakang
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgba(38,50,64,${(0.34 * level).toFixed(3)})`; // langit dan dunia meredup kelabu
    ctx.fillRect(0, 0, W, H);
    const n = Math.round(MAX_DROPS * clamp(level, 0, 1) ** 0.8);
    ctx.lineWidth = 1 + level * 0.8;
    ctx.strokeStyle = `rgba(205,220,235,${(0.18 + 0.32 * level).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y += dt * (1.1 + level) * d.v * (1.2 + slant);
      d.x -= dt * 0.25 * slant * d.v;
      if (d.y > 1.05) { d.y = -0.1; d.x = Math.random(); }
      if (d.x < -0.1) d.x += 1.2;
      const x = d.x * W;
      const y = d.y * H;
      const len = (14 + 30 * level) * d.l;
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * slant, y - len);
    }
    ctx.stroke();
  }
  requestAnimationFrame(frame);

  const api = {
    intensity: () => weather.intensity(),
    active: () => weather.active(),
    start: (peak) => weather.start(peak),
    calm: () => weather.calm(),
    next: () => weather.next(),
    wet: () => wet,
    toggle() {
      if (weather.active()) { weather.calm(); say('Hujan reda'); } else { weather.start(); say('Hujan turun: gerimis, lalu makin deras'); }
    },
  };
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'u' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName ?? '')) return;
    api.toggle();
  });
  window.__weather = api;
  return api;
}

mountRain();
