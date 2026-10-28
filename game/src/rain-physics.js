// Fisika tetes hujan 3D (murni, tanpa THREE, diuji di Node): kotak hujan yang mengikuti pemain, angin, pembungkus, dan tabrakan dengan atap dan tanah.
// rain-3d.js hanya menggambar hasilnya. Tetes yang menembus atap memercik di atap (y atap); di bawah atap tidak ada tetes sama sekali.
import { ROOFS, roofCrossed, roofOver } from './rain-cover.js';

export const RAIN_BOX = Object.freeze({ R: 15, H: 14 }); // setengah sisi (m) dan tinggi kotak hujan di sekitar pemain
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jumlah tetes yang digambar untuk intensitas hujan 0..1. */
export const rainCount = (level, { low = false } = {}) => Math.round((low ? 420 : 900) * clamp(Number(level) || 0, 0, 1) ** 0.8);

/**
 * Angin pada waktu t (detik): arah berputar pelan, kecepatan naik dengan hujan, embusan datang sesekali.
 * calm 0..1 meredam (efek 4D mati = 0,35). Mengembalikan { x, z, speed, gust } (m/s; gust 0..1).
 */
export function windAt(t, level, calm = 1) {
  const L = clamp(Number(level) || 0, 0, 1);
  const ang = 0.9 + 0.55 * Math.sin(t * 0.021) + 0.25 * Math.sin(t * 0.063 + 1.7);
  const gustTerm = Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 0.113 + 1.3)) ** 2 * (1.5 + 4 * L);
  const speed = (0.25 + 3.2 * L + gustTerm * L) * calm;
  return { x: Math.cos(ang) * speed, z: Math.sin(ang) * speed, speed, gust: clamp((gustTerm * L) / 5.5, 0, 1) };
}

export function createDrops(max, seed = 11) {
  return { max, rnd: mulberry32(seed), x: new Float32Array(max), y: new Float32Array(max), z: new Float32Array(max), v: new Float32Array(max), l: new Float32Array(max) };
}

/** Tebar semua tetes merata di kotak hujan di sekitar c (dipanggil sekali di awal). */
export function seedDrops(d, c, groundY) {
  const { R, H } = RAIN_BOX;
  for (let i = 0; i < d.max; i++) {
    d.x[i] = c.x + (d.rnd() * 2 - 1) * R;
    d.z[i] = c.z + (d.rnd() * 2 - 1) * R;
    d.y[i] = groundY + d.rnd() * H;
    d.v[i] = 8.5 + d.rnd() * 3;
    d.l[i] = 0.55 + d.rnd() * 0.45;
  }
}

function respawn(d, i, c, top) {
  const { R } = RAIN_BOX;
  d.x[i] = c.x + (d.rnd() * 2 - 1) * R;
  d.z[i] = c.z + (d.rnd() * 2 - 1) * R;
  d.y[i] = top - d.rnd() * 3;
  d.v[i] = 8.5 + d.rnd() * 3;
  d.l[i] = 0.55 + d.rnd() * 0.45;
}

/**
 * Majukan n tetes pertama selama dt detik. c = pusat kotak (pemain), groundY = lantai, wind = { x, z } (m/s),
 * cull(x, y, z) = true bila tetes di dalam benda (mis. mobil yang dikendarai). Mengembalikan percikan baru [{ x, y, z }] di dekat pemain.
 */
export function stepDrops(d, n, dt, { c, groundY, wind = { x: 0, z: 0 }, cull = null, roofs = ROOFS, splashR = 14, maxSplash = 24 } = {}) {
  const { R, H } = RAIN_BOX;
  const R2 = R * 2;
  const top = groundY + H;
  const out = [];
  const near = (x, z) => (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < splashR * splashR;
  const count = Math.min(n, d.max);
  for (let i = 0; i < count; i++) {
    const y0 = d.y[i];
    const y1 = y0 - d.v[i] * dt;
    let x = d.x[i] + wind.x * dt;
    let z = d.z[i] + wind.z * dt;
    x = c.x + ((((x - c.x + R) % R2) + R2) % R2) - R;
    z = c.z + ((((z - c.z + R) % R2) + R2) % R2) - R;
    const roof = roofCrossed(x, z, y0, y1, roofs);
    if (roof) {
      if (out.length < maxSplash && near(x, z)) out.push({ x, y: roof.y, z });
      respawn(d, i, c, top);
    } else if (y1 <= groundY) {
      if (out.length < maxSplash && near(x, z)) out.push({ x, y: groundY, z });
      respawn(d, i, c, top);
    } else if (y1 > top + 1 || roofOver(x, y1, z, roofs) || (cull && cull(x, y1, z))) {
      respawn(d, i, c, top); // di bawah atap, di dalam benda, atau di luar kotak (pemain naik lift): diam-diam ke atas lagi
    } else {
      d.x[i] = x;
      d.y[i] = y1;
      d.z[i] = z;
    }
  }
  return out;
}

/**
 * Ekor guratan tetes: rel = kecepatan tetes relatif terhadap pemain {x, y, z} (m/s). Guratan memanjang berlawanan arah gerak,
 * makin panjang bila mobil melaju kencang (hujan menyilang di kaca depan). Mengembalikan selisih (x, y, z) dari kepala ke ekor.
 */
export function streakTail(rel, l = 1, { k = 0.05, max = 3 } = {}) {
  const sp = Math.hypot(rel.x, rel.y, rel.z);
  if (sp < 1e-6) return { x: 0, y: 0.3, z: 0 };
  const len = Math.min(sp * k * (0.6 + 0.6 * l), max);
  return { x: (-rel.x / sp) * len, y: (-rel.y / sp) * len, z: (-rel.z / sp) * len };
}
