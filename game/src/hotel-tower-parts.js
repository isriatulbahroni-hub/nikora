// Data murni (tanpa THREE) untuk menggambar bentuk luar menara: kulit kaca berfaset, batang rangka, tutup atap, sayap podium,
// dan kotak penghalang kamera. Diubah menjadi geometri oleh hotel-tower-view.js; dipisah supaya bisa diuji di node.
import { HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, hotelLevelY, isSkyLobbyLevel } from './hotel-layout.js';
import { skinRings, skinShapeAt } from './hotel-tower-shape.js';
import { SATELLITES, satelliteRect } from './hotel-satellites.js';

export const BAY_WIDTH = 6; // lebar satu bay fasad (m), sama dengan hotel-facade.js

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Kulit berfaset: untuk tiap pasang cincin berurutan dan tiap sisi cincin, satu bidang datar (dua segitiga) yang menghadap keluar.
 * Mengembalikan larik datar positions, normals (satu normal per bidang, jadi tepi tampak berfaset), uvs (bay diulang bulat
 * supaya tiang tidak terpotong), dan count = jumlah bidang. rings = [{ y, pts: [[x, z] ...] }], urut dari bawah, titik searah jarum jam.
 */
export function loftData(rings, { bayWidth = BAY_WIDTH, levelHeight = HOTEL_LEVEL_HEIGHT } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  let count = 0;
  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i];
    const hi = rings[i + 1];
    const n = lo.pts.length;
    const cx = lo.pts.reduce((s, p) => s + p[0], 0) / n;
    const cz = lo.pts.reduce((s, p) => s + p[1], 0) / n;
    for (let v = 0; v < n; v++) {
      const w = (v + 1) % n;
      const A = [lo.pts[v][0], lo.y, lo.pts[v][1]];
      const B = [lo.pts[w][0], lo.y, lo.pts[w][1]];
      const C = [hi.pts[w][0], hi.y, hi.pts[w][1]];
      const D = [hi.pts[v][0], hi.y, hi.pts[v][1]];
      const n0 = norm(cross(sub(B, A), sub(D, A)));
      const mid = [(A[0] + B[0] + C[0] + D[0]) / 4, 0, (A[2] + B[2] + C[2] + D[2]) / 4];
      const outward = dot(n0, [mid[0] - cx, 0, mid[2] - cz]) >= 0;
      const nrm = outward ? n0 : [-n0[0], -n0[1], -n0[2]];
      const len = (Math.hypot(B[0] - A[0], B[2] - A[2]) + Math.hypot(C[0] - D[0], C[2] - D[2])) / 2;
      const u = Math.max(1, Math.round(len / bayWidth));
      const vv = Math.max(1, Math.round((hi.y - lo.y) / levelHeight));
      const uvA = [0, 0];
      const uvB = [u, 0];
      const uvC = [u, vv];
      const uvD = [0, vv];
      // sisi depan menghadap keluar: urutan (A,B,C),(A,C,D) bila normal hasil silang sudah keluar, kalau tidak dibalik
      const tris = outward ? [[A, B, C, uvA, uvB, uvC], [A, C, D, uvA, uvC, uvD]] : [[A, C, B, uvA, uvC, uvB], [A, D, C, uvA, uvD, uvC]];
      for (const [p, q, r, a, b, c] of tris) {
        positions.push(...p, ...q, ...r);
        normals.push(...nrm, ...nrm, ...nrm);
        uvs.push(...a, ...b, ...c);
      }
      count++;
    }
  }
  return { positions, normals, uvs, count };
}

/** Tutup datar (kipas dari pusat) untuk cincin `pts` di ketinggian y; menghadap ke atas. */
export function capData(pts, y) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cz = pts.reduce((s, p) => s + p[1], 0) / n;
  const positions = [];
  const normals = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    // titik cincin searah jarum jam dari atas: urutan (pusat, q, p) menghadap ke atas
    positions.push(cx, y, cz, q[0], y, q[1], p[0], y, p[1]);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  return { positions, normals, count: n };
}

/** Rusuk vertikal di tiap sudut cincin sepanjang tiap ruas (untuk menara pendamping). */
export function ridgeSegments(rings) {
  const segs = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let v = 0; v < rings[i].pts.length; v++) segs.push({ a: [rings[i].pts[v][0], rings[i].y, rings[i].pts[v][1]], b: [rings[i + 1].pts[v][0], rings[i + 1].y, rings[i + 1].pts[v][1]] });
  }
  return segs;
}

/** Titik tengah, panjang, dan arah satuan satu batang a -> b. */
export function beamTransform(seg) {
  const d = sub(seg.b, seg.a);
  const length = Math.hypot(d[0], d[1], d[2]);
  return { mid: [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2, (seg.a[2] + seg.b[2]) / 2], length, dir: length > 0 ? [d[0] / length, d[1] / length, d[2] / length] : [0, 1, 0] };
}

/** Segitiga sayap podium [[x,y,z] x3] menjadi larik datar positions dan normals per segitiga. */
export function wingData(tris) {
  const positions = [];
  const normals = [];
  for (const t of tris) {
    const n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
    for (const p of t) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
    }
  }
  return { positions, normals, count: tris.length };
}

/** Kotak penghalang kamera badan menara di atas podium: satu kotak per zona (memakai cincin bawah yang lebih lebar). */
export function towerBodyBoxes(rings = skinRings()) {
  const boxes = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const s = rings[i].shape;
    boxes.push({ minX: s.x0, maxX: s.x1, minY: rings[i].y, maxY: rings[i + 1].y, minZ: s.z0, maxZ: s.z1 });
  }
  return boxes;
}

/** Kotak penghalang kamera tiap menara pendamping (sebesar tapak dasar + kulit). */
export function satelliteBodyBoxes() {
  return SATELLITES.map((s) => {
    const r = satelliteRect(s, 0.5);
    return { minX: r[0], maxX: r[2], minY: 0, maxY: s.height, minZ: r[1], maxZ: r[3] };
  });
}

/**
 * Sabuk emas Sky Lobby: delapan balok sepanjang sisi cincin kulit di atas jendela tiap Sky Lobby (lantai 51, 101, ...).
 * Tiap balok { x, y, z, sx (panjang), sy, sz (tebal), ry } untuk InstancedMesh kotak; ry memutar sumbu x balok searah sisinya.
 */
export function skyBeltBoxes(rings = skinRings()) {
  const items = [];
  for (let l = 1; l < HOTEL_LEVEL_COUNT; l++) {
    if (!isSkyLobbyLevel(l)) continue;
    const y = hotelLevelY(l) + HOTEL_LEVEL_HEIGHT - 0.6;
    const s = skinShapeAt(y, rings);
    if (!s) continue;
    const { x0, z0, x1, z1, c } = s;
    const pts = [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      items.push({ x: (p[0] + q[0]) / 2, y, z: (p[1] + q[1]) / 2, sx: Math.hypot(dx, dz) + 0.8, sy: 1.2, sz: 1.0, ry: Math.atan2(-dz, dx) });
    }
  }
  return items;
}
