// Data dan hitungan murni (tanpa THREE) untuk keindahan menara NIKORA Grand Hotel siang dan malam. Dipakai hotel-tower-glow.js dan hotel-tower-skin.js, dan bisa diuji.
// Fase langit (day-night.js): -1 = siang penuh, 0 = senja keemasan, +1 = malam penuh.
import { nightLevel } from './hotel-sky-data.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ---------------------------------------------------------------- warna kaca per zona (vertex color, mengalikan tekstur bay)
/** Tiga titik warna dari dasar ke puncak: hijau toska di bawah, biru jernih di tengah, makin terang di atas (udara makin tipis). */
export const ZONE_TINT_STOPS = Object.freeze([[0.78, 1.0, 0.92], [0.92, 1.0, 1.05], [1.45, 1.5, 1.6]]);
/** Warna pengali [r, g, b] untuk zona ke-`zone` dari `zones` zona (0 = paling bawah). */
export function zoneTint(zone, zones) {
  const t = zones > 1 ? clamp(zone / (zones - 1), 0, 1) : 0;
  const s = t * 2;
  const i = Math.min(1, Math.floor(s));
  return lerp3(ZONE_TINT_STOPS[i], ZONE_TINT_STOPS[i + 1], s - i);
}

// ---------------------------------------------------------------- tingkat nyala menurut fase (0..1)
/** Rangka diagonal, potongan sudut emas, dan mahkota mulai bersinar saat senja dan penuh saat malam. */
export const structureGlow = (phase) => clamp((phase + 0.1) / 0.7, 0, 1);
/** Berkas cahaya mahkota: mulai sesudah senja, penuh saat malam. */
export const beamLevel = (phase) => clamp((phase - 0.1) / 0.4, 0, 1);
/** Kekuatan pantulan langit di kaca: kuat di siang, redup di malam. */
export const reflectionIntensity = (phase) => 0.6 + 0.9 * (1 - nightLevel(phase));
/** Denyut lembut sinar rangka (1 = penuh; turun sampai 0,85). `motion` 0 mematikan denyut (prefers-reduced-motion). */
export const glowPulse = (t, motion = 1) => 1 - 0.15 * motion * (0.5 + 0.5 * Math.sin(t * 0.9));

// ---------------------------------------------------------------- pantulan kaca
/** Bahan kaca dibuat sedikit lebih logam dan halus supaya memantulkan langit; bisa disetel di sini. */
export const GLASS_REFLECT = Object.freeze({ metalness: 0.3, roughness: 0.24 });
export const ENV_PHASE_STEP = 0.04; // peta pantulan dibuat ulang bila fase bergeser sebesar ini
export const ENV_ALT_STEP = 0.1; // atau ketinggian pemain (0..1) bergeser sebesar ini
export const ENV_MIN_INTERVAL = 1.5; // detik antar pembuatan ulang (jaga performa di HP)
/** Apakah peta pantulan perlu dibuat ulang? `last` = { phase, altitude, time } terakhir, atau null bila belum pernah. */
export function envStale({ phase, altitude, last, now }) {
  if (!last) return true;
  if (now - last.time < ENV_MIN_INTERVAL) return false;
  return Math.abs(phase - last.phase) >= ENV_PHASE_STEP || Math.abs(altitude - last.altitude) >= ENV_ALT_STEP;
}

// ---------------------------------------------------------------- berkas cahaya di mahkota
export const BEAM = Object.freeze({ length: 2400, radius: 110, tilt: 0.04, turn: 0.35, count: 2 }); // m, m, rad (condong ke bawah), rad/detik
/** Sudut putar berkas (radian, 0..2pi) pada waktu `t` detik. */
export const beamAngle = (t, turn = BEAM.turn) => (t * turn) % (Math.PI * 2);
