// Geometri kulit kaca menara NIKORA yang meruncing (satuan meter). Murni data + matematika (tanpa THREE), digambar oleh hotel-tower-skin.js.
// Memakai cincin dari hotel-tower-shape.js: tiap zona 50 lantai = 8 bidang (4 sisi utama + 4 potongan sudut) antara dua cincin.
// Kulit berhenti di bawah Sky Level (lantai 1000, terasnya terbuka); mahkota baru mulai di atap (HOTEL_TOP_Y).
import { HOTEL_TOP_LEVEL, hotelLevelY } from './hotel-layout.js';
import { PANEL_ZONES, crownSpec, skinRings } from './hotel-tower-shape.js';

export const GLASS_TOP_Y = hotelLevelY(HOTEL_TOP_LEVEL); // 4195,8 m: atas lantai 999, tepat di bawah Sky Level
export const EDGES = 8; // segi delapan: genap = sisi utama (utara, timur, selatan, barat), ganjil = potongan sudut

const mixPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Bidang kulit: {zone, edge, main, panel, vTop, lo: [P, Q], hi: [P, Q]} dengan P, Q = [x, y, z] ujung kiri/kanan sisi itu.
 * Urutan P -> Q searah jarum jam dilihat dari atas. `vTop` = bagian tinggi bidang yang dipakai (zona teratas dipotong di GLASS_TOP_Y).
 */
export function skinQuads(rings = skinRings()) {
  const out = [];
  const zones = rings.length - 1;
  for (let i = 0; i < zones; i++) {
    const lo = rings[i];
    const hi = rings[i + 1];
    const vTop = i === zones - 1 ? (GLASS_TOP_Y - lo.y) / (hi.y - lo.y) : 1;
    const yHi = lo.y + (hi.y - lo.y) * vTop;
    for (let e = 0; e < EDGES; e++) {
      const f = (e + 1) % EDGES;
      const a = lo.pts[e];
      const b = lo.pts[f];
      const a2 = mixPt(lo.pts[e], hi.pts[e], vTop);
      const b2 = mixPt(lo.pts[f], hi.pts[f], vTop);
      out.push({ zone: i, edge: e, main: e % 2 === 0, panel: i % PANEL_ZONES, vTop, lo: [[a[0], lo.y, a[1]], [b[0], lo.y, b[1]]], hi: [[a2[0], yHi, a2[1]], [b2[0], yHi, b2[1]]] });
    }
  }
  return out;
}

/** Bidang mahkota: antar tiga cincin crownSpec(), sama bentuknya dengan skinQuads (tanpa potongan zona). */
export function crownQuads(spec = crownSpec()) {
  const out = [];
  for (let j = 0; j < spec.rings.length - 1; j++) {
    const lo = spec.rings[j];
    const hi = spec.rings[j + 1];
    for (let e = 0; e < EDGES; e++) {
      const f = (e + 1) % EDGES;
      out.push({ ring: j, edge: e, lo: [[lo.pts[e][0], lo.y, lo.pts[e][1]], [lo.pts[f][0], lo.y, lo.pts[f][1]]], hi: [[hi.pts[e][0], hi.y, hi.pts[e][1]], [hi.pts[f][0], hi.y, hi.pts[f][1]]] });
    }
  }
  return out;
}

/** Garis diagonal pada tekstur satu panel: kiri-bawah ke kanan-atas dan kebalikannya, dalam koordinat UV (u 0..1, v 0..1), untuk zona ke-`panel` (0..3). */
export function diagonalUV(panel) {
  const t0 = panel / PANEL_ZONES;
  const t1 = (panel + 1) / PANEL_ZONES;
  return [{ u0: t0, v0: 0, u1: t1, v1: 1 }, { u0: 1 - t0, v0: 0, u1: 1 - t1, v1: 1 }];
}

/** Dua segitiga (indeks titik P0 P1 Q1 Q0 = lo[0], lo[1], hi[1], hi[0]) yang menghadap keluar untuk urutan titik searah jarum jam dari atas. */
export const QUAD_TRIANGLES = Object.freeze([[0, 2, 1], [0, 3, 2]]);

/** Normal bidang (x, y, z) dari satu bidang kulit atau mahkota, menurut QUAD_TRIANGLES. */
export function quadNormal(q) {
  const P = [q.lo[0], q.lo[1], q.hi[1], q.hi[0]];
  const [i0, i1, i2] = QUAD_TRIANGLES[0];
  const e1 = [P[i1][0] - P[i0][0], P[i1][1] - P[i0][1], P[i1][2] - P[i0][2]];
  const e2 = [P[i2][0] - P[i0][0], P[i2][1] - P[i0][1], P[i2][2] - P[i0][2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}
