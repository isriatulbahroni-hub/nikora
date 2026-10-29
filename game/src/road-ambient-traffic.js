// Lalu lintas umum di jalan perjalanan menuju tempat acara selain villa (hall, royal, masjid). Data murni tanpa THREE, deterministik dari jam:
// semua pemain melihat kendaraan yang sama di tempat yang sama. Tampilannya: road-traffic-view.js (createAmbientTrafficView).
//
// Villa sudah punya lalu lintas karyawan sungguhan (villa-road-traffic.js: motor, bus antar-jemput, mobil dinas menurut jadwal shift). Tempat acara lain
// belum punya karyawan berjadwal, jadi jalannya diisi lalu lintas umum: mobil, motor, dan bus yang ramai di jam berangkat dan pulang kerja
// (pagi dan sore), sepi dini hari. Kendaraan dihasilkan langsung dari jam (tanpa daftar sehari penuh), jadi murah di memori dan tetap sama bagi semua pemain.
// Bentuk keluaran sama dengan trafficAt di villa-road-traffic.js: { id, kind, dir, s, color, riders, driver }.
// Arah 'out' = hotel -> tempat acara (s bertambah), 'back' = tempat acara -> hotel (s berkurang). Kecepatan mengikuti profil autopilot rute
// (melambat di tikungan), diregangkan per jenis kendaraan seperti di villa.
import { buildJourney } from './journey.js';
import { startState, stepDrive } from './journey-drive.js';

export const AMBIENT_VENUES = Object.freeze(['hall', 'royal', 'masjid']);
export const KINDS = Object.freeze(['car', 'motor', 'bus']);
export const DIRS = Object.freeze(['out', 'back']);
export const STRETCH = Object.freeze({ motor: 1, car: 1.05, bus: 1.35 }); // lama tempuh relatif terhadap autopilot
/** Perjalanan per jam per arah saat beban = 1. Satu rute 20 menit: 150 mobil per jam berarti sekitar 50 mobil di jalan per arah. */
export const PEAK = Object.freeze({ car: 150, motor: 120, bus: 8 });
/** Beban lalu lintas 0..1 per jam (jam 0..23): puncak pagi (06-08) dan sore (16-18), sepi dini hari. */
export const LOAD = Object.freeze([0.12, 0.1, 0.08, 0.08, 0.12, 0.35, 0.8, 1, 0.9, 0.6, 0.55, 0.6, 0.65, 0.6, 0.55, 0.65, 0.95, 1, 0.9, 0.6, 0.45, 0.35, 0.25, 0.18]);
const HOUR = 3600;
const DAY = 86400;
const mod = (a, m) => ((a % m) + m) % m;
function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const PALETTE = Object.freeze({
  car: [0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0x3a3f46, 0xe9e1cf, 0x2d5a3d, 0xc9a24b],
  motor: [0x222428, 0x3a3d44, 0xb3262c, 0x1f4fa8, 0xe7e7e7, 0xc9a24b],
  bus: [0xd9d4c4, 0x2d5a3d, 0x274a7c, 0xc9a24b],
});

/** Jumlah perjalanan yang berangkat dalam satu jam (per jenis, per arah). */
export const countAt = (kind, hour) => Math.round(PEAK[kind] * LOAD[mod(Math.floor(hour), 24)]);

const profiles = new Map();
/** Profil tempuh autopilot rute tempat acara: ss[t] = jarak (m) tiap detik sejak berangkat. j = rute (buildJourney), dibuat sendiri bila tidak diberikan. */
export function ambientProfile(venue, j) {
  let p = profiles.get(venue);
  if (p) return p;
  const route = j ?? buildJourney(venue);
  const st = startState(0);
  const ss = [0];
  while (!st.arrived && st.t < 7200) {
    stepDrive(route, st, 1);
    ss.push(st.s);
  }
  p = Object.freeze({ length: route.length, duration: st.t, ss });
  profiles.set(venue, p);
  return p;
}

/** Lama tempuh satu perjalanan (detik) untuk jenis kendaraan ini. */
export const ambientTripDuration = (venue, kind, j) => ambientProfile(venue, j).duration * STRETCH[kind];

function forward(p, t) {
  if (t <= 0) return 0;
  if (t >= p.duration) return p.length;
  const i = Math.min(p.ss.length - 2, Math.floor(t));
  return p.ss[i] + (p.ss[i + 1] - p.ss[i]) * (t - i);
}

/** Jarak dari gerbang (m) setelah `elapsed` detik: arah 'out' bertambah dari 0, arah 'back' berkurang dari panjang rute. */
export function ambientProgressAt(venue, kind, dir, elapsed, j) {
  const p = ambientProfile(venue, j);
  const s = forward(p, Math.min(elapsed / STRETCH[kind], p.duration));
  return dir === 'out' ? s : p.length - s;
}

/**
 * Kendaraan umum yang sedang di jalan pada `seconds` (detik dalam sehari, boleh pecahan). Mengisi dan mengembalikan `out`.
 * Tempat acara selain hall/royal/masjid (mis. villa, yang punya lalu lintas karyawan sendiri) menghasilkan daftar kosong.
 */
export function ambientTrafficAt(venue, seconds, out = [], j) {
  out.length = 0;
  const vi = AMBIENT_VENUES.indexOf(venue);
  if (vi < 0) return out;
  const p = ambientProfile(venue, j);
  const now = mod(seconds, DAY);
  const maxDur = p.duration * STRETCH.bus;
  const hFirst = Math.floor((now - maxDur) / HOUR);
  const hLast = Math.floor(now / HOUR);
  for (let h = hFirst; h <= hLast; h++) {
    const hour = mod(h, 24);
    const base = h * HOUR;
    for (let ki = 0; ki < KINDS.length; ki++) {
      const kind = KINDS[ki];
      const n = countAt(kind, hour);
      if (!n) continue;
      const dur = p.duration * STRETCH[kind];
      // tiap perjalanan punya satu "lapisan" jam sepanjang HOUR/n detik; hanya lapisan yang bersinggungan dengan [now - dur, now] yang dicek
      const lo = Math.max(0, Math.floor(((now - dur - base) / HOUR) * n));
      const hi = Math.min(n - 1, Math.floor(((now - base) / HOUR) * n));
      const pal = PALETTE[kind];
      for (let di = 0; di < DIRS.length; di++) {
        const dir = DIRS[di];
        for (let i = lo; i <= hi; i++) {
          const seed = ((((vi * KINDS.length + ki) * DIRS.length + di) * 24 + hour) * 1024 + i) * 4;
          const t0 = base + ((i + 0.15 + 0.7 * hash01(seed)) / n) * HOUR;
          const elapsed = now - t0;
          if (elapsed < 0 || elapsed >= dur) continue;
          out.push({
            id: `${venue}:${kind}:${dir}:${h}:${i}`,
            kind,
            dir,
            s: ambientProgressAt(venue, kind, dir, elapsed, j),
            color: pal[Math.floor(hash01(seed + 1) * pal.length)],
            riders: kind === 'bus' ? 6 + Math.floor(hash01(seed + 2) * 14) : 1,
            driver: null,
          });
        }
      }
    }
  }
  return out;
}

/** Ringkasan untuk papan admin dan tes: jumlah perjalanan per hari menurut jenis, dan profil rute. */
export function ambientSummary(venue, j) {
  const p = ambientProfile(venue, j);
  const byKind = { car: 0, motor: 0, bus: 0 };
  for (const kind of KINDS) for (let h = 0; h < 24; h++) byKind[kind] += countAt(kind, h) * DIRS.length;
  return { length: p.length, duration: p.duration, trips: byKind.car + byKind.motor + byKind.bus, byKind };
}
