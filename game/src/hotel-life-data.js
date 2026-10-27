// Data murni untuk lalu lintas dan burung di sekitar hotel (tanpa THREE, diuji di hotel-life-data.test.js). Gambar 3D: hotel-life.js.
// Lalu lintas berjalan di Lingkar NIKORA (RING di highway.js): persegi bersudut membulat, empat lajur per arah, lalu lintas di sisi KIRI
// (sama dengan highway.js). Hanya pemandangan: tidak ada tabrakan dengan pemain, jadi mobil lalu lintas mengecil halus bila terlalu dekat.
import { HUB, LANES_PER_DIRECTION, LANE_WIDTH, MEDIAN_WIDTH, RING } from './highway.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Bilangan acak deterministik 0..1 dari bilangan bulat. */
export function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Garis tengah Lingkar NIKORA: pusat, setengah lebar (a, arah x), setengah tinggi (b, arah z), dan jari-jari sudut. */
export const LOOP = Object.freeze({ cx: (RING.minX + RING.maxX) / 2, cz: (RING.minZ + RING.maxZ) / 2, a: (RING.maxX - RING.minX) / 2, b: (RING.maxZ - RING.minZ) / 2, r: 22 });

/** Jarak pusat lajur ke-k (0 = terdekat median) dari garis tengah jalan. */
export const laneOffset = (k) => MEDIAN_WIDTH / 2 + (k + 0.5) * LANE_WIDTH;

/**
 * Titik-titik (x, z) persegi bersudut membulat, tertutup tanpa titik ganda. Bawaan searah jarum jam di peta (utara di atas, x timur, z selatan):
 * sisi utara ke timur, sisi timur ke selatan, dst. ccw = kebalikannya. Pada arah searah jarum jam, sisi KIRI pengemudi adalah sisi luar.
 */
export function roundedLoop({ cx, cz, a, b, r }, ccw = false, arcSteps = 8) {
  const corners = [
    { x: cx + a - r, z: cz - b + r, from: -90, to: 0 }, // timur laut
    { x: cx + a - r, z: cz + b - r, from: 0, to: 90 }, // tenggara
    { x: cx - a + r, z: cz + b - r, from: 90, to: 180 }, // barat daya
    { x: cx - a + r, z: cz - b + r, from: 180, to: 270 }, // barat laut
  ];
  const pts = [];
  for (const c of corners) {
    for (let i = 0; i <= arcSteps; i++) {
      const phi = ((c.from + ((c.to - c.from) * i) / arcSteps) * Math.PI) / 180;
      pts.push({ x: c.x + r * Math.cos(phi), z: c.z + r * Math.sin(phi) });
    }
  }
  return ccw ? pts.reverse() : pts;
}

/** Jalur tertutup dari titik-titik: panjang dan at(u) = { x, z, heading } pada jarak u meter (melingkar). heading seperti vehicle.js: maju = (sin h, cos h). */
export function makePath(points) {
  const n = points.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(q.x - p.x, q.z - p.z));
  }
  const length = cum[n];
  return {
    length,
    at(u) {
      const d = ((u % length) + length) % length;
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid;
        else hi = mid;
      }
      const p = points[lo];
      const q = points[(lo + 1) % n];
      const f = (d - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
      return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, heading: Math.atan2(q.x - p.x, q.z - p.z) };
    },
  };
}

const paths = new Map();
/** Jalur lajur ke-k. ccw = false: searah jarum jam (lajur kiri = di luar garis tengah); ccw = true: berlawanan (di dalam garis tengah). */
export function lanePath(k, ccw = false) {
  const key = `${k}${ccw ? 'l' : 'r'}`;
  let p = paths.get(key);
  if (!p) {
    const s = ccw ? -1 : 1;
    const d = laneOffset(k);
    p = makePath(roundedLoop({ ...LOOP, a: LOOP.a + s * d, b: LOOP.b + s * d, r: LOOP.r + s * d }, ccw));
    paths.set(key, p);
  }
  return p;
}

const PALETTE = [0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0x3a3f46, 0xe9e1cf, 0x2d5a3d, 0xc9a24b];

/**
 * Mobil lalu lintas: tiap lajur punya satu kecepatan (mobil sejalur tidak saling menyalip) dan jarak awal yang berjauhan.
 * Lajur dekat median lebih cepat. Urutan: searah jarum jam semua lajur, lalu berlawanan.
 */
export function trafficSpecs({ lanes = LANES_PER_DIRECTION, perLane = 3 } = {}) {
  const out = [];
  let n = 0;
  for (const ccw of [false, true]) {
    for (let k = 0; k < lanes; k++) {
      const path = lanePath(k, ccw);
      const speed = 22 - 3.2 * k + 1.5 * hash01(k * 2 + (ccw ? 1 : 0)); // m/s
      for (let i = 0; i < perLane; i++) {
        n++;
        out.push({ id: n, lane: k, ccw, speed, u0: (path.length * (i + 0.8 * hash01(n * 7))) / perLane, color: PALETTE[Math.floor(hash01(n * 13) * PALETTE.length)] });
      }
    }
  }
  return out;
}

/** Pose { x, z, heading } sebuah mobil lalu lintas pada waktu t (detik). */
export const trafficPose = (spec, t) => lanePath(spec.lane, spec.ccw).at(spec.u0 + spec.speed * t);

/** Skala 0..1 mobil lalu lintas menurut jarak ke pemain: penuh di >= far, hilang di <= near (tidak ada tabrakan, jadi menyingkir halus). */
export const proximityScale = (dist, near = 34, far = 60) => smooth(near, far, dist);

/** Kekuatan lampu mobil lalu lintas 0..1: menyala saat gelap atau hujan lebat. night 0..1 (nightLevel), rain 0..1. */
export const lightLevel = (night, rain) => clamp(Math.max(smooth(0.12, 0.5, night), smooth(0.25, 0.6, rain) * 0.9), 0, 1);

/** Burung yang mengorbit di luar tapak hotel (jari-jari 200..340 m dari pusat menara, tinggi 28..98 m). */
export function birdSpecs(count = 16) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const radius = 200 + 140 * hash01(i * 3 + 1);
    out.push({
      id: i,
      radius,
      height: 28 + 70 * hash01(i * 5 + 2),
      omega: ((6 + 4 * hash01(i * 7 + 3)) / radius) * (i % 2 ? 1 : -1), // rad/s; laju sekitar 6..10 m/s
      phase: TAU * hash01(i * 11 + 4),
      flapRate: 9 + 4 * hash01(i * 13 + 5),
    });
  }
  return out;
}

/** Pose burung pada waktu t: { x, y, z, heading, flap } (flap = sudut kepakan sayap, rad). */
export function birdPose(b, t) {
  const ang = b.phase + b.omega * t;
  const sg = Math.sign(b.omega) || 1;
  return {
    x: HUB.x + Math.cos(ang) * b.radius,
    z: HUB.z + Math.sin(ang) * b.radius,
    y: b.height + 4 * Math.sin(t * 0.4 + b.phase * 3),
    heading: Math.atan2(-Math.sin(ang) * sg, Math.cos(ang) * sg),
    flap: Math.sin(t * b.flapRate + b.phase) * 0.7,
  };
}

/** Burung terlihat 0..1: siang cerah penuh, hilang saat malam atau hujan. */
export const birdVisibility = (night, rain) => (1 - smooth(0.1, 0.5, night)) * (1 - clamp(rain * 2.5, 0, 1));
