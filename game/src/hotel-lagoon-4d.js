// Efek 4D Taman Air Terjun (tambahan indra, tidak mengubah fisika, jaringan, atau penghalang): getaran HP saat berdiri di dekat air terjun
// dan percikan air di layar saat kamera dekat dan menghadap air terjun. Makin deras bila hujan. Mengikuti pola haptics.js: fungsi murni yang
// diuji di hotel-lagoon-4d.test.js + pembungkus kecil untuk navigator.vibrate dan DOM. ?getar=0 mematikan getaran, ?lagoon=0 mematikan semuanya,
// ?q=low mengurangi percikan, dan pengaturan sistem "kurangi gerakan" mematikan percikan dan getaran. iPhone/Safari tidak punya navigator.vibrate.
import { SOUND_SOURCES } from './hotel-lagoon-data.js';
import { engineHapticsEnabled } from './haptics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MAIN = SOUND_SOURCES.find((s) => s.id === 'main');

export const SPRAY_RANGE = 16; // meter dari titik pendaratan air terjun utama: di luar ini tidak terasa

/** Seberapa "basah" suasananya di (x, z): 0 jauh .. 1 di ujung dermaga. Hujan menambah hingga 40%. active = false di lantai atas / selama perjalanan. */
export function mistLevel({ x, z, active = true, rain = 0 }) {
  if (!active || !MAIN) return 0;
  const d = Math.hypot(x - MAIN.x, z - MAIN.z);
  const k = clamp((SPRAY_RANGE - d) / (SPRAY_RANGE - 3), 0, 1);
  return clamp(k * k * (1 + 0.4 * clamp(rain, 0, 1)), 0, 1);
}

/** Tingkat percikan di layar: mistLevel dikali seberapa kamera menghadap air terjun (membelakangi = tinggal 40%). (fx, fz) = arah pandang kamera. */
export function sprayLevel({ x, z, fx, fz, active = true, rain = 0 }) {
  const base = mistLevel({ x, z, active, rain });
  if (base === 0) return 0;
  const dx = MAIN.x - x;
  const dz = MAIN.z - z;
  const d = Math.hypot(dx, dz);
  const f = Math.hypot(fx, fz);
  const dot = d < 1e-6 || f < 1e-6 ? 1 : (fx * dx + fz * dz) / (f * d);
  return base * (0.4 + 0.6 * Math.max(0, dot));
}

export const HAPTIC_MIN_LEVEL = 0.2; // di bawah ini tidak bergetar

/** Denyut getaran untuk tingkat basah 0..1: jeda (detik) dan lama (ms); null bila terlalu jauh. Makin dekat makin rapat dan kuat. */
export function lagoonBeat(level) {
  if (!(level >= HAPTIC_MIN_LEVEL)) return null;
  const f = clamp(level, 0, 1);
  return { gap: 0.9 - 0.45 * f, ms: Math.round(8 + 14 * f) };
}

/** Getaran hanya bila tidak di-nonaktifkan: ?getar=0 atau "kurangi gerakan" (sama dengan getaran mesin di haptics.js). */
export const lagoonHapticsEnabled = (search = '', reducedMotion = false) => engineHapticsEnabled(search, reducedMotion) && new URLSearchParams(search).get('lagoon') !== '0';

/** Pembuat getaran air terjun. Dipanggil tiap frame: (now detik jam game, level). Mengembalikan ms yang dipakai (0 = tidak bergetar). */
export function createLagoonHaptics({ vibrate = (ms) => globalThis.navigator?.vibrate?.(ms), enabled = true } = {}) {
  let next = -Infinity;
  return (now, level) => {
    if (!enabled) return 0;
    const beat = lagoonBeat(level);
    if (!beat || now < next) return 0;
    next = now + beat.gap;
    try { vibrate(beat.ms); } catch { /* getaran gagal: abaikan */ }
    return beat.ms;
  };
}

/** Jumlah tetes baru per detik untuk tingkat percikan 0..1 (low = HP lemah). */
export const dropletRate = (level, low = false) => (level < 0.03 ? 0 : (low ? 8 : 22) * clamp(level, 0, 1));
export const DROPLET_MAX = Object.freeze({ normal: 30, low: 12 });

/**
 * Lapisan percikan di layar (canvas tembus pandang di atas dunia 3D, tidak menangkap sentuhan): tetes bening yang meluncur turun pelan lalu
 * memudar, ditambah kabut putih tipis. Mengembalikan { update({ level, delta }), info(), dispose() }; tanpa DOM atau dengan "kurangi gerakan"
 * semuanya tidak berbuat apa-apa.
 */
export function createLagoonSpray({ search = '', low = false, doc = globalThis.document, win = globalThis.window } = {}) {
  const none = { update() {}, info: () => ({ on: false, drops: 0 }), dispose() {} };
  if (!doc?.createElement || !win || new URLSearchParams(search).get('lagoon') === '0') return none;
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return none;
  const canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '3', display: 'none' });
  const ctx = canvas.getContext('2d');
  if (!ctx) return none;
  doc.body.appendChild(canvas);
  const SCALE = 0.5; // resolusi kanvas separuh layar: cukup untuk tetes lembut dan murah
  const resize = () => {
    canvas.width = Math.max(2, Math.round((win.innerWidth || 800) * SCALE));
    canvas.height = Math.max(2, Math.round((win.innerHeight || 600) * SCALE));
  };
  resize();
  win.addEventListener('resize', resize);
  const max = low ? DROPLET_MAX.low : DROPLET_MAX.normal;
  const drops = [];
  let carry = 0;
  let shown = false;
  let seed = 1234567;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  return {
    update({ level = 0, delta = 0.016 } = {}) {
      const dt = clamp(delta, 0, 0.1);
      carry += dropletRate(level, low) * dt;
      while (carry >= 1) {
        carry -= 1;
        if (drops.length < max) drops.push({ x: rand() * canvas.width, y: rand() * canvas.height * 0.8, r: (3 + rand() * 7) * (low ? 1.1 : 1), age: 0, life: 1.6 + rand() * 1.8, vy: 4 + rand() * 10 });
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        drops[i].age += dt;
        drops[i].y += drops[i].vy * dt;
        if (drops[i].age >= drops[i].life) drops.splice(i, 1);
      }
      const visible = level > 0.01 || drops.length > 0;
      if (!visible) {
        if (shown) {
          canvas.style.display = 'none';
          shown = false;
        }
        return;
      }
      if (!shown) {
        canvas.style.display = 'block';
        shown = true;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = `rgba(226, 241, 248, ${0.08 * clamp(level, 0, 1)})`; // kabut tipis
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const d of drops) {
        const k = d.age / d.life;
        const a = Math.min(1, k * 6) * (1 - k);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.14 * a})`;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(190, 228, 242, ${0.55 * a})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, Math.max(0.8, d.r * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * a})`;
        ctx.fill();
      }
    },
    info: () => ({ on: true, drops: drops.length, shown }),
    dispose() {
      win.removeEventListener('resize', resize);
      canvas.remove();
    },
  };
}
