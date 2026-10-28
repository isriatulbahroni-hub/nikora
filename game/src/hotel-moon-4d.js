// Efek 4D Bulan Purnama Agung (tambahan indra, tidak mengubah fisika, jaringan, atau pencahayaan dunia): saat pemain menatap bulan di malam hari layar
// dimandikan cahaya perak (pendar di posisi bulan, bayangan lensa di sepanjang garis ke tengah layar, tirai tipis), HP bergetar pelan seperti napas,
// dan di lantai tinggi tepi layar ditutupi udara dingin kebiruan. Mengikuti pola hotel-lagoon-4d.js: fungsi murni yang diuji di hotel-moon-4d.test.js +
// pembungkus kecil untuk navigator.vibrate dan DOM. ?bulan4d=0 mematikan semuanya, ?getar=0 mematikan getaran, ?q=low mengurangi bayangan lensa,
// dan pengaturan sistem "kurangi gerakan" mematikan getaran, denyut pendar, dan bayangan lensa. iPhone/Safari tidak punya navigator.vibrate.
import { engineHapticsEnabled } from './haptics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- menatap bulan
/** Batas tatapan sebagai cosinus sudut antara arah pandang dan arah bulan: mulai terasa di 45 derajat, penuh di 7 derajat. */
export const GAZE = Object.freeze({ wide: Math.cos((45 * Math.PI) / 180), tight: Math.cos((7 * Math.PI) / 180) });
/** 0 membelakangi bulan .. 1 tepat menatapnya. cosAngle = dot(arah pandang, arah bulan). */
export const gazeLevel = (cosAngle) => smooth(GAZE.wide, GAZE.tight, cosAngle);

/**
 * Tingkat mandi cahaya bulan 0..1: tatapan x bulan tampak x ketinggian (udara makin bening di atas, 60% sampai 100%) x terang bulan (35% sabit tipis sampai 100% purnama).
 * Nol di dalam ruangan (indoor = 1) atau saat tidak aktif (perjalanan, lantai tertentu).
 */
export function bathLevel({ gaze, moon, altitude, indoor = 0, illumination = 1, active = true }) {
  if (!active) return 0;
  return clamp(gaze, 0, 1) * clamp(moon, 0, 1) * (0.6 + 0.4 * clamp(altitude, 0, 1)) * (0.35 + 0.65 * clamp(illumination, 0, 1)) * (1 - clamp(indoor, 0, 1));
}

/** Udara dingin di lantai tinggi pada malam hari: 0 di bawah 25% tinggi menara, penuh di 90%. Tidak bergantung ke arah pandang. */
export function coldLevel({ altitude, moon, indoor = 0, active = true }) {
  if (!active) return 0;
  return smooth(0.25, 0.9, altitude) * clamp(moon, 0, 1) * (1 - clamp(indoor, 0, 1));
}

/** Mendekati target dengan peredaman eksponensial: tingkat efek naik dan turun halus, bukan melompat saat kamera berputar. rate = per detik. */
export function approach(current, target, dt, rate) {
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

// ---------------------------------------------------------------- getaran napas
export const MOON_HAPTIC_MIN = 0.3; // di bawah ini tidak bergetar
/** Denyut getaran untuk tingkat 0..1: jeda (detik) dan lama (ms); null bila terlalu lemah. Pelan seperti napas: 2,6 detik sampai 1,4 detik. */
export function moonBeat(level) {
  if (!(level >= MOON_HAPTIC_MIN)) return null;
  const f = clamp(level, 0, 1);
  return { gap: 2.6 - 1.2 * f, ms: Math.round(6 + 10 * f) };
}

/** Getaran hanya bila tidak di-nonaktifkan: ?bulan4d=0, ?getar=0, atau "kurangi gerakan" (sama dengan getaran mesin di haptics.js). */
export const moonHapticsEnabled = (search = '', reducedMotion = false) => engineHapticsEnabled(search, reducedMotion) && new URLSearchParams(search).get('bulan4d') !== '0';

/** Pembuat getaran napas. Dipanggil tiap frame: (now detik jam game, level). Mengembalikan ms yang dipakai (0 = tidak bergetar). */
export function createMoonHaptics({ vibrate = (ms) => globalThis.navigator?.vibrate?.(ms), enabled = true } = {}) {
  let next = -Infinity;
  return (now, level) => {
    if (!enabled) return 0;
    const beat = moonBeat(level);
    if (!beat || now < next) return 0;
    next = now + beat.gap;
    try { vibrate(beat.ms); } catch { /* getaran gagal: abaikan */ }
    return beat.ms;
  };
}

// ---------------------------------------------------------------- bayangan lensa
/**
 * Bayangan lensa: t = letak di sepanjang garis dari bulan melalui pusat layar (0 di bulan, 1 di pusat layar, 2 bayangan cermin bulan),
 * r = jari-jari (pecahan sisi pendek layar), a = kekuatan, hue = warna rgb.
 */
export const GHOSTS = Object.freeze([
  Object.freeze({ t: 0.45, r: 0.05, a: 0.1, hue: Object.freeze([160, 200, 255]) }),
  Object.freeze({ t: 0.9, r: 0.11, a: 0.07, hue: Object.freeze([255, 220, 170]) }),
  Object.freeze({ t: 1.5, r: 0.035, a: 0.12, hue: Object.freeze([190, 170, 255]) }),
  Object.freeze({ t: 2.0, r: 0.16, a: 0.05, hue: Object.freeze([170, 230, 255]) }),
]);
/** Posisi piksel bayangan lensa untuk bulan di (sx, sy) (pecahan layar 0..1) pada kanvas w x h. */
export function ghostPositions(sx, sy, w, h) {
  const mx = sx * w;
  const my = sy * h;
  const cx = w / 2;
  const cy = h / 2;
  return GHOSTS.map((g) => ({ x: mx + (cx - mx) * g.t, y: my + (cy - my) * g.t, r: g.r * Math.min(w, h), a: g.a, hue: g.hue }));
}

// ---------------------------------------------------------------- lapisan layar
/**
 * Lapisan mandi cahaya bulan di layar (canvas tembus pandang di atas dunia 3D, tidak menangkap sentuhan).
 * Mengembalikan { update({ level, cold, sx, sy, behind, time }), info(), dispose() }; tanpa DOM, dengan ?bulan4d=0, atau dengan "kurangi gerakan"
 * untuk bagian geraknya, ia tidak berbuat apa-apa atau tidak berdenyut.
 */
export function createMoonBath({ search = '', low = false, doc = globalThis.document, win = globalThis.window } = {}) {
  const none = { update() {}, info: () => ({ on: false, shown: false }), dispose() {} };
  if (!doc?.createElement || !win || new URLSearchParams(search).get('bulan4d') === '0') return none;
  const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2', display: 'none' });
  const ctx = canvas.getContext('2d');
  if (!ctx) return none;
  doc.body.appendChild(canvas);
  const SCALE = 0.5; // resolusi kanvas separuh layar: cukup untuk pendar lembut dan murah
  const resize = () => {
    canvas.width = Math.max(2, Math.round((win.innerWidth || 800) * SCALE));
    canvas.height = Math.max(2, Math.round((win.innerHeight || 600) * SCALE));
  };
  resize();
  win.addEventListener('resize', resize);
  let shown = false;
  const radial = (x, y, r0, r1, stops) => {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  };

  return {
    update({ level = 0, cold = 0, sx = 0.5, sy = 0.3, behind = false, time = 0 } = {}) {
      if (!(level > 0.01 || cold > 0.01)) {
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
      const w = canvas.width;
      const h = canvas.height;
      const m = Math.max(w, h);
      ctx.clearRect(0, 0, w, h);
      if (cold > 0.01) { // udara dingin: tepi layar kebiruan
        ctx.fillStyle = radial(w / 2, h / 2, m * 0.25, m * 0.75, [[0, 'rgba(150,190,240,0)'], [1, `rgba(150,190,240,${0.22 * clamp(cold, 0, 1)})`]]);
        ctx.fillRect(0, 0, w, h);
      }
      if (level <= 0.01) return;
      const L = clamp(level, 0, 1);
      ctx.fillStyle = `rgba(196,214,255,${0.07 * L})`; // tirai perak tipis
      ctx.fillRect(0, 0, w, h);
      if (behind || sx < -0.3 || sx > 1.3 || sy < -0.3 || sy > 1.3) return;
      const pulse = reduced ? 1 : 1 + 0.04 * Math.sin(time * 0.9); // pendar "bernapas" pelan
      const x = sx * w;
      const y = sy * h;
      ctx.fillStyle = radial(x, y, 0, m * 0.6 * pulse, [[0, `rgba(236,243,255,${0.34 * L})`], [0.25, `rgba(205,222,255,${0.16 * L})`], [1, 'rgba(190,210,255,0)']]);
      ctx.fillRect(0, 0, w, h);
      if (low || reduced) return;
      for (const g of ghostPositions(sx, sy, w, h)) {
        const [r, gg, b] = g.hue;
        ctx.fillStyle = radial(g.x, g.y, 0, g.r, [[0, `rgba(${r},${gg},${b},0)`], [0.7, `rgba(${r},${gg},${b},${g.a * L})`], [1, `rgba(${r},${gg},${b},0)`]]);
        ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
      }
    },
    info: () => ({ on: true, shown, reduced }),
    dispose() {
      win.removeEventListener('resize', resize);
      canvas.remove();
    },
  };
}
