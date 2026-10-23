// Jalan Raya NIKORA (THREE): lingkar hotel, empat lengan, gerbang, dan portal rambu. Geometri dari highway.js.
// Semua digambar dengan InstancedMesh (beberapa draw call saja) supaya tetap ringan di HP.
import * as THREE from 'three';
import {
  BARRIER_HALF, CARRIAGE_HALF, GATES, HIGHWAY_ARMS, HIGHWAY_HALF, HIGHWAY_SEGMENTS, HUB, LANES_PER_DIRECTION, LANE_WIDTH, MEDIAN_WIDTH, RING, SHOULDER_WIDTH, leftOf,
} from './highway.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const GOLD = 0xc9a24b;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

function instanced(parent, items, material, { cast = false, receive = false } = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(BOX, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromEuler(e.set(0, it.ry ?? 0, 0));
    m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz));
    mesh.setMatrixAt(i, m);
    if (it.color !== undefined) mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Papan: teks di atas latar berwarna dengan bingkai. */
function boardTexture(title, sub, { bg, fg, edge, w = 768, h = 240 }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = edge;
  g.lineWidth = 8;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 74;
  g.font = `600 ${size}px Georgia, serif`;
  while (g.measureText(title).width > w - 60 && size > 28) {
    size -= 4;
    g.font = `600 ${size}px Georgia, serif`;
  }
  g.fillText(title, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) {
    g.font = '500 44px ui-sans-serif, sans-serif';
    g.fillText(sub, w / 2, h * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pita datar sepanjang titik garis tengah antara lateral t0..t1 pada tinggi y (menghadap ke atas). */
export function ribbonGeometry(points, t0, t1, y) {
  const n = points.length;
  const pos = new Float32Array(n * 6);
  const idx = [];
  points.forEach((p, i) => {
    const lx = p.tz; // kiri = (tz, -tx)
    const lz = -p.tx;
    pos.set([p.x + lx * t0, y, p.z + lz * t0, p.x + lx * t1, y, p.z + lz * t1], i * 6);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from({ length: n * 6 }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Titik terinterpolasi di jarak s sepanjang garis tengah. */
export function pointAt(points, s) {
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (points[m].s <= s) lo = m; else hi = m; }
  const a = points[lo];
  const b = points[hi];
  const t = b.s > a.s ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 0;
  const tx = a.tx + (b.tx - a.tx) * t;
  const tz = a.tz + (b.tz - a.tz) * t;
  const l = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / l, tz: tz / l, i: lo };
}

const ryAlong = (p) => Math.atan2(-p.tz, p.tx); // kotak dengan sumbu x searah jalan
const ryAcross = (p) => Math.atan2(p.tx, p.tz); // kotak dengan sumbu x melintang jalan (ke kiri)
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

export function buildHighway(parent) {
  const root = new THREE.Group();
  root.name = 'nikora-highway';
  parent.add(root);
  const M = {
    asphalt: std(0x2a2c31, { roughness: 0.95 }), shoulder: std(0x3b3d43, { roughness: 0.95 }), curb: std(0xcfcfc8), soil: std(0x4d7d3b),
    white: std(0xf2f0e4, { roughness: 0.7 }), yellow: std(0xe6b422, { roughness: 0.7 }), dark: std(0x1a1b1f), gold: std(GOLD, { roughness: 0.35, metalness: 0.75 }),
    rail: std(0xb9bec6, { roughness: 0.4, metalness: 0.6 }), glow: new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), eye: new THREE.MeshBasicMaterial({ color: 0xfff7d6 }), trunk: std(0x6b4a2f), leaf: std(0xffffff), // putih: warna tajuk datang dari warna tiap instance (dulu 0x2f6f3a dikali warna instance = hampir hitam)
   
  };
  const pavement = [];
  const shoulders = [];
  const curbs = [];
  const soil = [];
  const dashes = [];
  const edges = [];
  const yellow = [];
  const eyes = [];
  const posts = [];
  const arms = [];
  const bulbs = [];
  const trunks = [];
  const crowns = [];

  for (const s of HIGHWAY_SEGMENTS) {
    // koordinat lokal ruas: a = sepanjang jalan, t = menyamping dari garis tengah
    const at = (a, t, y, len, wid, h, extra = {}) => (s.axis === 'z' ? { x: s.c + t, y, z: a, sx: wid, sy: h, sz: len, ...extra } : { x: a, y, z: s.c + t, sx: len, sy: h, sz: wid, ...extra });
    const cross = (a, t, y, w, h, d) => (s.axis === 'z' ? { x: s.c + t, y, z: a, sx: w, sy: h, sz: d } : { x: a, y, z: s.c + t, sx: d, sy: h, sz: w });
    const len = s.to - s.from;
    const mid = (s.from + s.to) / 2;
    pavement.push(at(mid, 0, 0.03, len, CARRIAGE_HALF * 2, 0.06));
    for (const side of [-1, 1]) shoulders.push(at(mid, side * (CARRIAGE_HALF + SHOULDER_WIDTH / 2), 0.028, len, SHOULDER_WIDTH, 0.056));
    for (const [m0, m1] of s.marks) {
      const ml = m1 - m0;
      const mm = (m0 + m1) / 2;
      curbs.push(at(mm, 0, 0.15, ml, MEDIAN_WIDTH, 0.3));
      soil.push(at(mm, 0, 0.1, ml, MEDIAN_WIDTH - 0.8, 0.2));
      for (const side of [-1, 1]) {
        edges.push(at(mm, side * CARRIAGE_HALF, 0.07, ml, 0.2, 0.02));
        yellow.push(at(mm, side * (MEDIAN_WIDTH / 2 + 0.3), 0.07, ml, 0.15, 0.02));
        for (let k = 1; k < LANES_PER_DIRECTION; k++) {
          const t = side * (MEDIAN_WIDTH / 2 + k * LANE_WIDTH);
          for (let a = m0 + 6; a < m1 - 2; a += 12) dashes.push(at(a + 2.25, t, 0.07, 4.5, 0.15, 0.02));
          for (let a = m0 + 3; a < m1; a += 6) eyes.push(at(a, t, 0.08, 0.3, 0.3, 0.04));
        }
        for (let a = m0 + 3; a < m1; a += 6) eyes.push(at(a, side * CARRIAGE_HALF, 0.08, 0.3, 0.3, 0.04));
      }
      // lampu jalan dua lengan di median, pohon di antaranya
      for (let a = m0 + 15; a < m1 - 6; a += 30) {
        posts.push(at(a, 0, 4.5, 0.25, 0.25, 9));
        arms.push(cross(a, 0, 8.9, 12.6, 0.18, 0.18));
        for (const side of [-1, 1]) bulbs.push(cross(a, side * 5.8, 8.7, 0.8, 0.2, 0.5));
      }
      for (let a = m0 + 30; a < m1 - 6; a += 30) {
        const h = 3.4 + ((Math.round(a) * 7) % 5) * 0.2;
        trunks.push(at(a, 0, h * 0.4, 0.35, 0.35, h * 0.8));
        crowns.push(at(a, 0, h * 0.8 + 1.1, 2.4, 2.4, 2.2, { color: [0x2f6f3a, 0x3c8044, 0x27603a][Math.abs(Math.round(a)) % 3] }));
      }
    }
  }
  // ---- empat lengan berkelok: aspal/bahu/marka sebagai pita, selebihnya instance searah jalan (rel pengaman, lampu, pohon, rambu tikungan)
  const rails = [];
  const railPosts = [];
  const chevronPlates = [];
  const chevronBars = [];
  const wildTrunks = [];
  const wildCrowns = [];
  const ribbonMeshes = [];
  const ribbon = (pts, t0, t1, y, mat, receive = true) => {
    const mesh = new THREE.Mesh(ribbonGeometry(pts, t0, t1, y), mat);
    mesh.receiveShadow = receive;
    root.add(mesh);
    ribbonMeshes.push(mesh);
  };
  for (const armDef of HIGHWAY_ARMS) {
    const road = armDef.road;
    const pts = road.points;
    const L = road.length;
    ribbon(pts, -CARRIAGE_HALF, CARRIAGE_HALF, 0.03, M.asphalt);
    ribbon(pts, CARRIAGE_HALF, HIGHWAY_HALF, 0.028, M.shoulder);
    ribbon(pts, -HIGHWAY_HALF, -CARRIAGE_HALF, 0.028, M.shoulder);
    for (const side of [-1, 1]) {
      const e = side * CARRIAGE_HALF;
      ribbon(pts, Math.min(e - 0.1, e + 0.1), Math.max(e - 0.1, e + 0.1), 0.07, M.white, false);
      const y0 = side * (MEDIAN_WIDTH / 2 + 0.3);
      ribbon(pts, y0 - 0.075, y0 + 0.075, 0.07, M.yellow, false);
    }
    // median: batas trotoar + tanah, per 8 m
    for (let s = 4; s < L; s += 8) {
      const p = pointAt(pts, s);
      curbs.push({ x: p.x, y: 0.15, z: p.z, sx: 8.6, sy: 0.3, sz: MEDIAN_WIDTH, ry: ryAlong(p) });
      soil.push({ x: p.x, y: 0.1, z: p.z, sx: 8.6, sy: 0.2, sz: MEDIAN_WIDTH - 0.8, ry: ryAlong(p) });
    }
    // garis lajur putus-putus
    for (let s = 6; s < L - 6; s += 12) {
      const p = pointAt(pts, s);
      for (const side of [-1, 1]) for (let k = 1; k < LANES_PER_DIRECTION; k++) {
        const t = side * (MEDIAN_WIDTH / 2 + k * LANE_WIDTH);
        dashes.push({ x: p.x + p.tz * t, y: 0.07, z: p.z - p.tx * t, sx: 4.5, sy: 0.02, sz: 0.15, ry: ryAlong(p) });
      }
    }
    // lampu di median dan pohon median
    for (let s = 45; s < L - 20; s += 30) {
      const p = pointAt(pts, s);
      const across = ryAcross(p);
      posts.push({ x: p.x, y: 4.5, z: p.z, sx: 0.25, sy: 9, sz: 0.25 });
      arms.push({ x: p.x, y: 8.9, z: p.z, sx: 12.6, sy: 0.18, sz: 0.18, ry: across });
      for (const side of [-1, 1]) bulbs.push({ x: p.x + p.tz * side * 5.8, y: 8.7, z: p.z - p.tx * side * 5.8, sx: 0.8, sy: 0.2, sz: 0.5, ry: across });
      const q = pointAt(pts, s + 15);
      const h = 3.4 + hash01(s) * 1.0;
      trunks.push({ x: q.x, y: h * 0.4, z: q.z, sx: 0.35, sy: h * 0.8, sz: 0.35 });
      crowns.push({ x: q.x, y: h * 0.8 + 1.1, z: q.z, sx: 2.4, sy: 2.2, sz: 2.4, color: [0x2f6f3a, 0x3c8044, 0x27603a][Math.floor(hash01(s + 3) * 3)] });
    }
    // rel pengaman dua sisi
    for (let s = 4; s < L - 4; s += 8) {
      if (s < 30 || s > L - 6) continue;
      const p = pointAt(pts, s);
      for (const side of [-1, 1]) {
        const t = side * BARRIER_HALF;
        rails.push({ x: p.x + p.tz * t, y: 0.62, z: p.z - p.tx * t, sx: 8.8, sy: 0.32, sz: 0.12, ry: ryAlong(p) });
      }
    }
    for (let s = 30; s < L - 6; s += 4) {
      const p = pointAt(pts, s);
      for (const side of [-1, 1]) {
        const t = side * BARRIER_HALF;
        railPosts.push({ x: p.x + p.tz * t, y: 0.35, z: p.z - p.tx * t, sx: 0.12, sy: 0.7, sz: 0.12 });
      }
    }
    // rambu panah tikungan: di sisi luar tikungan yang cukup tajam, tiap 14 m
    for (let i = 0; i < pts.length; i += 2) {
      const r = road.signedRadius(i);
      if (!Number.isFinite(r) || Math.abs(r) > 150 || pts[i].s < 60 || pts[i].s > L - 60 || Math.round(pts[i].s / 8) % 2) continue;
      const p = pts[i];
      const outer = r > 0 ? -1 : 1; // belok kiri -> sisi luar = kanan (lateral negatif)
      const t = outer * (BARRIER_HALF + 0.5);
      const x = p.x + p.tz * t;
      const z = p.z - p.tx * t;
      chevronPlates.push({ x, y: 1.7, z, sx: 0.08, sy: 1.1, sz: 1.3, ry: ryAcross(p) }, { x, y: 0.9, z, sx: 0.1, sy: 1.8, sz: 0.1 });
      chevronBars.push({ x: x - outer * p.tz * 0.07, y: 1.7, z: z + outer * p.tx * 0.07, sx: 0.09, sy: 0.9, sz: 0.28, ry: ryAcross(p) });
    }
    // pohon dan semak di tepi jalan, tersebar acak tetapi tetap (hash)
    for (let s = 20; s < L - 20; s += 22) {
      const p = pointAt(pts, s + hash01(s) * 10);
      for (const side of [-1, 1]) {
        const t = side * (BARRIER_HALF + 7 + hash01(s * side + 5) * 60);
        const h = 4 + hash01(s + side * 9) * 4;
        const x = p.x + p.tz * t;
        const z = p.z - p.tx * t;
        wildTrunks.push({ x, y: h * 0.4, z, sx: 0.5, sy: h * 0.8, sz: 0.5 });
        wildCrowns.push({ x, y: h * 0.8 + 1.4, z, sx: 3.4 + hash01(s + 2) * 1.6, sy: 3 + hash01(s + 4), sz: 3.4 + hash01(s + 6) * 1.6, color: [0x2f6f3a, 0x3c8044, 0x27603a, 0x4d7d3b][Math.floor(hash01(s + side) * 4)] });
      }
    }
  }
  instanced(root, pavement, M.asphalt, { receive: true });
  instanced(root, shoulders, M.shoulder, { receive: true });
  instanced(root, curbs, M.curb, { receive: true });
  instanced(root, soil, M.soil, { receive: true });
  instanced(root, dashes, M.white);
  instanced(root, edges, M.white);
  instanced(root, yellow, M.yellow);
  instanced(root, eyes, M.eye);
  instanced(root, posts, M.dark, { cast: true });
  instanced(root, arms, M.dark);
  instanced(root, bulbs, M.glow);
  instanced(root, trunks, M.trunk, { cast: true });
  instanced(root, crowns, M.leaf, { cast: true });
  instanced(root, rails, M.rail);
  instanced(root, railPosts, M.dark);
  instanced(root, chevronPlates, M.yellow);
  instanced(root, chevronBars, M.dark);
  instanced(root, wildTrunks, M.trunk);
  instanced(root, wildCrowns, M.leaf);

  // ---- tugu emas di empat sudut lingkar (di luar aspal)
  const pylons = [];
  const pylonCaps = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (RING.maxX + HIGHWAY_HALF + 7);
    const z = sz < 0 ? RING.minZ - HIGHWAY_HALF - 7 : RING.maxZ + HIGHWAY_HALF + 7;
    pylons.push({ x, y: 14, z, sx: 2.6, sy: 28, sz: 2.6 }, { x, y: 0.5, z, sx: 6, sy: 1, sz: 6 });
    pylonCaps.push({ x, y: 29, z, sx: 1.6, sy: 2, sz: 1.6 });
  }
  instanced(root, pylons, M.gold, { cast: true });
  instanced(root, pylonCaps, M.glow);

  // ---- gerbang tiap tempat acara (lengkung emas + papan nama di dua sisi) dan portal rambu penunjuk jarak
  const frames = [];
  const boards = new THREE.Group();
  const board = (tex, w, h, x, y, z, facing) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    m.rotation.y = Math.atan2(facing.x, facing.z); // PlaneGeometry menghadap +z; putar supaya menghadap lalu lintas yang datang
    boards.add(m);
  };
  for (const g of GATES) {
    const left = leftOf(g.heading); // sumbu menyamping jalan (bebas tanda)
    const side = (t, a, y, w, h, d) => ({ x: g.x + left.x * t + g.inbound.x * a, y, z: g.z + left.z * t + g.inbound.z * a, sx: Math.abs(left.x) * w + Math.abs(g.inbound.x) * d, sy: h, sz: Math.abs(left.z) * w + Math.abs(g.inbound.z) * d });
    const T = HIGHWAY_HALF + 2.5;
    for (const t of [-T, T]) frames.push(side(t, 0, 7.5, 1.8, 15, 1.8), side(t, 0, 0.5, 3.4, 1, 3.4));
    frames.push(side(0, 0, 15.6, T * 2 + 3, 2.4, 2.6), side(0, 0, 14.2, T * 2, 0.5, 1.2));
    const tex = boardTexture(`GERBANG ${g.venue === 'hall' ? 'AULA' : g.venue.toUpperCase()}`, g.label, { bg: '#14110d', fg: '#e7c76a', edge: '#c9a24b', w: 1024, h: 256 });
    board(tex, 34, 8.5, g.x + g.inbound.x * 1.4, 15.6, g.z + g.inbound.z * 1.4, g.inbound); // sisi yang dilihat dari arah hotel
    board(tex, 34, 8.5, g.x + g.dir.x * 1.4, 15.6, g.z + g.dir.z * 1.4, g.dir); // sisi yang dilihat dari tempat acara

    // portal rambu 150 m dari gerbang ke arah hotel
    const gp = { x: g.x + g.inbound.x * 150, z: g.z + g.inbound.z * 150 };
    const gside = (t, y, w, h, d) => ({ x: gp.x + left.x * t, y, z: gp.z + left.z * t, sx: Math.abs(left.x) * w + Math.abs(g.inbound.x) * d, sy: h, sz: Math.abs(left.z) * w + Math.abs(g.inbound.z) * d });
    const GT = HIGHWAY_HALF + 1.4;
    for (const t of [-GT, GT]) frames.push(gside(t, 3.9, 0.7, 7.8, 0.7));
    frames.push(gside(0, 7.6, GT * 2 + 1, 0.8, 0.9));
    const lat = MEDIAN_WIDTH / 2 + 1.5 * LANE_WIDTH; // pusat tiga lajur satu arah
    const toVenue = boardTexture(g.venue === 'hall' ? 'Aula Resepsi' : g.label.split(' · ')[0], km(Math.hypot(gp.x - g.x, gp.z - g.z)), { bg: '#0b6b3a', fg: '#ffffff', edge: '#ffffff' });
    const toHotel = boardTexture('NIKORA Grand Hotel', km(Math.hypot(gp.x - HUB.x, gp.z - HUB.z)), { bg: '#0b4a8a', fg: '#ffffff', edge: '#ffffff' });
    const leftOut = leftOf(Math.atan2(g.dir.x, g.dir.z)); // sisi kiri lalu lintas menuju tempat acara
    const leftIn = leftOf(g.heading);
    board(toVenue, 11, 3.4, gp.x + leftOut.x * lat, 5.4, gp.z + leftOut.z * lat, g.inbound); // dilihat pengemudi yang menuju tempat acara
    board(toHotel, 11, 3.4, gp.x + leftIn.x * lat, 5.4, gp.z + leftIn.z * lat, g.dir); // dilihat pengemudi yang menuju hotel
  }
  instanced(root, frames, M.gold, { cast: true });
  root.add(boards);
  return { root, dispose: () => { parent.remove(root); for (const m of ribbonMeshes) m.geometry.dispose(); } };
}
