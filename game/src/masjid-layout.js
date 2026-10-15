// Denah "Masjid Agung NIKORA" (satuan meter). x ke timur, z ke selatan; kiblat = utara (-z).
// Murni data + matematika (tanpa THREE) supaya dipakai bersama renderer, tabrakan, dan kamera, dan mudah diuji.
//
// Skala: kompleks 600 x 500 m (300.000 m²), Aula Shalat Utama 360 x 200 m (72.000 m²), sahn 300 x 170 m,
// empat menara setinggi 150 m. Ini rancangan orisinal (bukan replika bangunan nyata mana pun) yang berskala
// sekelas masjid-masjid terbesar di dunia. Semua ruang di lantai dasar dan bisa dimasuki lewat pintu.
import { isWalkable, resolveMove } from './villa-layout.js';

export const WALL_T = 1;
export const HALL_H = 28;
export const RIWAQ_H = 8;
export const PLAYER_RADIUS = 0.4;
export const BOUNDS = Object.freeze({ minX: -300, maxX: 300, minZ: -260, maxZ: 240 });
// Pemain boleh berjalan keluar pagar lewat gerbang; batas ini hanya pengaman jarak.
export const WORLD_LIMIT = Object.freeze({ minX: -700, maxX: 700, minZ: -700, maxZ: 700 });
export const SPAWN = Object.freeze({ x: 0, z: 262 }); // di luar Gerbang Utama, menghadap utara

// Kubah utama: lingkaran yang melingkupi bukaan atap persegi 80 x 80 m (4 pilar di sudutnya).
export const CENTRAL_DOME = Object.freeze({ x: 0, z: -140, half: 40, radius: 40 * Math.SQRT2, drumH: 8, squash: 0.75 });
export const MINARETS = Object.freeze(
  [[-190, -232], [190, -232], [-190, -48], [190, -48]].map(([x, z]) => Object.freeze({ x, z, half: 5, height: 150 })),
);
export const GATE_TOWERS = Object.freeze(
  [
    { x: -23, z: 240, hx: 3, hz: 4 }, { x: 23, z: 240, hx: 3, hz: 4 },
    { x: 300, z: 49, hx: 4, hz: 3 }, { x: 300, z: 71, hx: 4, hz: 3 },
    { x: -300, z: 49, hx: 4, hz: 3 }, { x: -300, z: 71, hx: 4, hz: 3 },
  ].map((t) => Object.freeze({ ...t, height: 24 })),
);

const room = (id, name, kind, rect, h = 9, t = WALL_T) => Object.freeze({ id, name, kind, rect, h, t });
export const ROOMS = Object.freeze([
  room('prayer_hall', 'Aula Shalat Utama', 'hall', [-180, -240, 180, -40], HALL_H, 1.4),
  room('women_hall', 'Ruang Shalat Muslimah', 'women', [200, -240, 290, -120], 10),
  room('library', 'Perpustakaan Islam', 'library', [200, -120, 290, -40], 10),
  room('tahfidz', 'Ruang Tahfidz Al-Qur\'an', 'study', [-290, -240, -200, -120], 10),
  room('museum', 'Museum Peradaban Islam', 'museum', [-290, -120, -200, -40], 10),
  room('wudhu_east', 'Tempat Wudhu Putra', 'wudhu', [200, 20, 260, 90], 7),
  room('wudhu_west', 'Tempat Wudhu Putri', 'wudhu', [-260, 20, -200, 90], 7),
  room('akad', 'Ruang Akad Nikah', 'akad', [80, 165, 180, 215], 9),
  room('walimah', 'Gedung Walimah', 'walimah', [-180, 165, -80, 215], 9),
]);
export const PERIMETER = Object.freeze({ id: 'perimeter', name: 'Pagar Kompleks', kind: 'perimeter', rect: [BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ], h: 9, t: 2 });

const zone = (id, name, kind, rect) => Object.freeze({ id, name, kind, rect });
// Urutan penting: yang pertama cocok dipakai untuk label lokasi.
export const ZONES = Object.freeze([
  zone('riwaq_w', 'Serambi Barat', 'riwaq', [-180, -40, -150, 160]),
  zone('riwaq_e', 'Serambi Timur', 'riwaq', [150, -40, 180, 160]),
  zone('riwaq_s', 'Serambi Selatan', 'riwaq', [-150, 130, 150, 160]),
  zone('sahn', 'Sahn (Halaman Utama)', 'sahn', [-150, -40, 150, 130]),
  zone('side_e', 'Lorong Timur', 'corridor', [180, -240, 200, -40]),
  zone('side_w', 'Lorong Barat', 'corridor', [-200, -240, -180, -40]),
  zone('plaza_e', 'Plaza Timur', 'plaza', [180, -40, 300, 160]),
  zone('plaza_w', 'Plaza Barat', 'plaza', [-300, -40, -180, 160]),
  zone('rear', 'Taman Belakang', 'garden', [-300, -260, 300, -240]),
  zone('forecourt', 'Halaman Selatan', 'garden', [-300, 160, 300, 240]),
]);

// orient 'h': pintu pada dinding yang membentang sepanjang x (di koordinat z); 'v': sepanjang z (di koordinat x).
const D = (x, z, orient, width, height = 4.5) => Object.freeze({ x, z, orient, width, height });
export const DOORS = Object.freeze([
  // Aula Shalat Utama: fasad selatan menghadap sahn
  D(0, -40, 'h', 40, 16),
  ...[-140, -100, -60, 60, 100, 140].map((x) => D(x, -40, 'h', 14, 12)),
  D(180, -180, 'v', 10, 10), D(180, -80, 'v', 10, 10), D(-180, -180, 'v', 10, 10), D(-180, -80, 'v', 10, 10),
  // blok timur dan barat
  D(200, -180, 'v', 10, 6), D(200, -80, 'v', 10, 6), D(-200, -180, 'v', 10, 6), D(-200, -80, 'v', 10, 6),
  D(245, -120, 'h', 8, 5), D(-245, -120, 'h', 8, 5), D(245, -40, 'h', 10, 5), D(-245, -40, 'h', 10, 5),
  // tempat wudhu
  D(200, 55, 'v', 8), D(260, 55, 'v', 8), D(230, 20, 'h', 8), D(230, 90, 'h', 8),
  D(-200, 55, 'v', 8), D(-260, 55, 'v', 8), D(-230, 20, 'h', 8), D(-230, 90, 'h', 8),
  // gedung akad dan walimah
  D(80, 190, 'v', 8, 5), D(130, 165, 'h', 10, 5), D(130, 215, 'h', 10, 5),
  D(-80, 190, 'v', 8, 5), D(-130, 165, 'h', 10, 5), D(-130, 215, 'h', 10, 5),
  // gerbang pagar keliling
  D(0, 240, 'h', 40, 8), D(300, 60, 'v', 16, 7), D(-300, 60, 'v', 16, 7),
]);

export const PROP_SPECS = Object.freeze({
  column: { hx: 0.8, hz: 0.8, h: HALL_H },
  pier: { hx: 3.5, hz: 3.5, h: HALL_H },
  minbar: { hx: 2.2, hz: 4, h: 6 },
  fountain: { hx: 9, hz: 9, h: 5 },
  shelf: { hx: 4, hz: 0.5, h: 2.6 },
  glass: { hx: 1.2, hz: 1.2, h: 1.3 },
  rehal: { hx: 3, hz: 0.5, h: 0.5 },
  bench: { hx: 4, hz: 0.6, h: 0.5 },
  table: { hx: 1.3, hz: 1.3, h: 0.8 },
  akadtable: { hx: 1, hz: 3, h: 0.9 },
  pelaminan: { hx: 1.5, hz: 9, h: 5 },
  row: { hx: 0.5, hz: 5, h: 0.9 },
  palm: { hx: 0.35, hz: 0.35, h: 9 },
  tree: { hx: 0.4, hz: 0.4, h: 7 },
});
// Properti yang cukup tinggi/besar untuk menghalangi kamera.
const CAMERA_BLOCKERS = new Set(['pier', 'minbar', 'fountain', 'shelf', 'pelaminan']);

// Tujuan "Jelajah": semua ruang utama. Diuji agar bisa diinjak dan terjangkau dari titik awal.
export const PLACES = Object.freeze([
  { id: 'gate', name: 'Gerbang Utama', x: 0, z: 252 },
  { id: 'forecourt', name: 'Halaman Selatan', x: 40, z: 190 },
  { id: 'akad', name: 'Ruang Akad Nikah', x: 125, z: 190 },
  { id: 'walimah', name: 'Gedung Walimah', x: -130, z: 190 },
  { id: 'sahn', name: 'Sahn (Halaman Utama)', x: 30, z: 80 },
  { id: 'fountain', name: 'Pancuran Tengah Sahn', x: 0, z: 62 },
  { id: 'riwaq', name: 'Serambi Timur', x: 165, z: 55 },
  { id: 'wudhu_e', name: 'Tempat Wudhu Putra', x: 236, z: 55 },
  { id: 'wudhu_w', name: 'Tempat Wudhu Putri', x: -236, z: 55 },
  { id: 'portal', name: 'Pintu Utama Aula Shalat', x: 0, z: -48 },
  { id: 'hall', name: 'Aula Shalat Utama', x: 0, z: -80 },
  { id: 'dome', name: 'Di Bawah Kubah Utama', x: 0, z: -140 },
  { id: 'mihrab', name: 'Mihrab dan Mimbar', x: 0, z: -230 },
  { id: 'women', name: 'Ruang Shalat Muslimah', x: 245, z: -180 },
  { id: 'library', name: 'Perpustakaan Islam', x: 245, z: -80 },
  { id: 'tahfidz', name: 'Ruang Tahfidz', x: -245, z: -180 },
  { id: 'museum', name: 'Museum Peradaban Islam', x: -245, z: -80 },
  { id: 'minaret', name: 'Kaki Menara Timur', x: 190, z: -62 },
]);

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

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
const inflate = (r, m) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];

export const COUNTRYSIDE = Object.freeze({ trees: 170, margin: 14, roadHalf: 8 });

function buildProps() {
  const props = [];
  const add = (type, x, z, extra) => props.push({ type, x, z, ...extra });

  // Aula Shalat Utama: hutan tiang, kecuali bawah kubah utama dan lorong tengah
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 13; j++) {
      const x = -161 + 14 * i;
      const z = -228 + 14 * j;
      if (Math.abs(x) < 46 && z > -190 && z < -90) continue;
      add('column', x, z, { h: HALL_H - 0.5 });
    }
  }
  for (const [x, z] of [[-40, -180], [40, -180], [-40, -100], [40, -100]]) add('pier', x, z);
  add('minbar', 12, -232);

  // Ruang shalat muslimah dan tahfidz: tiang dan meja baca
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 7; j++) {
      const z = -222 + 16 * j;
      add('column', 214 + 14 * i, z, { h: 9.5 });
      add('column', -214 - 14 * i, z, { h: 9.5 });
    }
  }
  for (const x of [-221, -249, -277]) for (const z of [-214, -198, -166, -150, -134]) add('rehal', x, z);

  // perpustakaan dan museum
  for (const x of [210, 222, 234, 256, 268, 280]) for (const z of [-110, -102, -62, -54]) add('shelf', x, z);
  for (const x of [-210, -222, -234, -256, -268, -280]) for (const z of [-108, -98, -62, -52]) add('glass', x, z);

  // tempat wudhu
  for (const x of [212, 228, 244]) for (const z of [34, 44, 66, 76]) add('bench', x, z);
  for (const x of [-212, -228, -244]) for (const z of [34, 44, 66, 76]) add('bench', x, z);

  // gedung akad (meja akad, kursi, pelaminan) dan walimah (meja bundar)
  add('pelaminan', 176, 190);
  add('akadtable', 166, 190);
  for (const x of [100, 110, 120, 130, 140, 150]) for (const z of [177, 203]) add('row', x, z);
  add('pelaminan', -176, 190);
  for (const x of [-165, -151, -137, -123, -109]) for (const z of [176, 190, 204]) add('table', x, z);

  // pancuran wudhu di tengah sahn
  add('fountain', 0, 45);

  // serambi (riwaq) keliling sahn
  for (let z = -30; z <= 150; z += 10) for (const x of [156, 174, -156, -174]) add('column', x, z, { h: RIWAQ_H - 0.2 });
  for (let x = -145; x <= 145; x += 10) for (const z of [136, 154]) add('column', x, z, { h: RIWAQ_H - 0.2 });

  // pepohonan: jalan raya berpalem, taman plaza, taman belakang
  const palms = [];
  for (let z = 168; z <= 228; z += 12) palms.push([-14, z], [14, z]);
  for (let x = -280; x <= 280; x += 15) palms.push([x, -250]);
  const rects = [...ROOMS.map((r) => inflate(r.rect, 6)), ...ZONES.filter((s) => s.kind === 'riwaq').map((s) => inflate(s.rect, 4))];
  const rand = mulberry32(20261015);
  const scatter = (rect, n, ok) => {
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 4000) {
      const x = rect[0] + rand() * (rect[2] - rect[0]);
      const z = rect[1] + rand() * (rect[3] - rect[1]);
      if (rects.some((r) => inRect(r, x, z))) continue;
      if (!ok(x, z)) continue;
      if (palms.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) continue;
      palms.push([x, z]);
      placed++;
    }
  };
  const eastWestGate = (x, z) => Math.abs(x) < 260 || Math.abs(z - 60) > 16;
  scatter([186, -34, 294, 156], 36, eastWestGate);
  scatter([-294, -34, -186, 156], 36, eastWestGate);
  scatter([-294, 166, 294, 236], 40, (x) => Math.abs(x) > 22);
  for (const [x, z] of palms) add('palm', x, z, { s: 0.85 + rand() * 0.4 });

  // pepohonan di luar pagar (jalan di selatan gerbang dibiarkan kosong)
  const trees = [];
  let guard = 0;
  while (trees.length < COUNTRYSIDE.trees && guard++ < 20000) {
    const x = (rand() * 2 - 1) * 480;
    const z = -420 + rand() * 960;
    const m = COUNTRYSIDE.margin;
    if (x > BOUNDS.minX - m && x < BOUNDS.maxX + m && z > BOUNDS.minZ - m && z < BOUNDS.maxZ + m) continue;
    if (Math.abs(x) < COUNTRYSIDE.roadHalf + 3 && z > BOUNDS.maxZ) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
    trees.push({ x, z });
  }
  for (const t of trees) add('tree', t.x, t.z, { s: 0.8 + rand() * 0.7 });
  return props;
}

const EPS = 1e-6;

function buildWalls(rooms, doors) {
  const seen = new Set();
  const segs = [];
  const add = (s) => {
    const key = `${s.orient}|${s.coord}|${s.a}|${s.b}`;
    if (seen.has(key)) return;
    seen.add(key);
    segs.push(s);
  };
  for (const r of rooms) {
    const [x1, z1, x2, z2] = r.rect;
    const half = r.t / 2;
    const edges = [['h', z1, x1, x2], ['h', z2, x1, x2], ['v', x1, z1, z2], ['v', x2, z1, z2]];
    for (const [orient, coord, lo, hi] of edges) {
      const gaps = doors
        .filter((d) => d.orient === orient && Math.abs((orient === 'h' ? d.z : d.x) - coord) < EPS)
        .map((d) => {
          const c = orient === 'h' ? d.x : d.z;
          return [c - d.width / 2, c + d.width / 2];
        })
        .filter((g) => g[1] > lo && g[0] < hi)
        .sort((p, q) => p[0] - q[0]);
      let cursor = lo;
      for (const g of gaps) {
        if (g[0] > cursor + EPS) add({ orient, coord, a: cursor === lo ? lo - half : cursor, b: g[0], h: r.h, t: r.t, room: r.id });
        cursor = Math.max(cursor, g[1]);
      }
      if (hi > cursor + EPS) add({ orient, coord, a: cursor === lo ? lo - half : cursor, b: hi + half, h: r.h, t: r.t, room: r.id });
    }
  }
  return segs;
}

function edgeHasDoor(r, d) {
  const [x1, z1, x2, z2] = r.rect;
  const hw = d.width / 2;
  if (d.orient === 'h') return (Math.abs(d.z - z1) < EPS || Math.abs(d.z - z2) < EPS) && d.x - hw >= x1 - EPS && d.x + hw <= x2 + EPS;
  return (Math.abs(d.x - x1) < EPS || Math.abs(d.x - x2) < EPS) && d.z - hw >= z1 - EPS && d.z + hw <= z2 + EPS;
}

/** Dinding di atas bukaan pintu (ambang). Pintu tanpa dinding pemilik dikembalikan di `orphans` (dipakai uji). */
function buildLintels(rooms, doors) {
  const lintels = [];
  const orphans = [];
  for (const d of doors) {
    const owner = rooms.find((r) => edgeHasDoor(r, d));
    if (!owner) orphans.push(d);
    else lintels.push({ ...d, wallH: owner.h, t: owner.t });
  }
  return { lintels, orphans };
}

function buildRoofSlabs() {
  const slabs = [];
  const add = (rect, y, th) => slabs.push({ rect, y, th });
  const hall = ROOMS.find((r) => r.id === 'prayer_hall');
  const [x1, z1, x2, z2] = hall.rect;
  const { x, z, half } = CENTRAL_DOME;
  add([x1, z1, x2, z - half], HALL_H, 2); // empat pelat mengelilingi bukaan kubah
  add([x1, z + half, x2, z2], HALL_H, 2);
  add([x1, z - half, x - half, z + half], HALL_H, 2);
  add([x + half, z - half, x2, z + half], HALL_H, 2);
  for (const r of ROOMS) if (r.id !== 'prayer_hall') add(inflate(r.rect, 0.5), r.h, 0.8);
  for (const s of ZONES) if (s.kind === 'riwaq') add(s.rect, RIWAQ_H, 0.8);
  return slabs;
}

function buildDomes() {
  const domes = [];
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 6; j++) {
      const x = -154 + 28 * i;
      const z = -212 + 28 * j;
      if (Math.hypot(x - CENTRAL_DOME.x, z - CENTRAL_DOME.z) < CENTRAL_DOME.radius + 9) continue;
      domes.push({ x, z, y: HALL_H + 2, r: 9, sy: 0.9, tone: 'white' });
    }
  }
  for (const r of ROOMS) {
    if (r.id === 'prayer_hall') continue;
    const [x1, z1, x2, z2] = r.rect;
    domes.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, y: r.h + 0.8, r: Math.min(x2 - x1, z2 - z1) * 0.3, sy: 0.85, tone: 'gold' });
  }
  return domes;
}

function makeGrid(items, cell = 40) {
  const cells = new Map();
  const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  for (const it of items) {
    for (let i = Math.floor(it.minX / cell); i <= Math.floor(it.maxX / cell); i++) {
      for (let j = Math.floor(it.minZ / cell); j <= Math.floor(it.maxZ / cell); j++) {
        const k = key(i, j);
        const list = cells.get(k);
        if (list) list.push(it);
        else cells.set(k, [it]);
      }
    }
  }
  return {
    query(x, z, r) {
      const seen = new Set();
      const out = [];
      for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++) {
        for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++) {
          const list = cells.get(key(i, j));
          if (!list) continue;
          for (const it of list) {
            if (seen.has(it)) continue;
            seen.add(it);
            out.push(it);
          }
        }
      }
      return out;
    },
  };
}

export const wallRect = (w) => {
  const h = w.t / 2;
  return w.orient === 'h' ? { minX: w.a, maxX: w.b, minZ: w.coord - h, maxZ: w.coord + h } : { minX: w.coord - h, maxX: w.coord + h, minZ: w.a, maxZ: w.b };
};
export const propRect = (p) => {
  const s = PROP_SPECS[p.type];
  return { minX: p.x - s.hx, maxX: p.x + s.hx, minZ: p.z - s.hz, maxZ: p.z + s.hz };
};

let cached = null;
export function getMasjidWorld() {
  if (cached) return cached;
  const allRooms = [...ROOMS, PERIMETER];
  const walls = buildWalls(allRooms, DOORS);
  const { lintels, orphans } = buildLintels(allRooms, DOORS);
  const props = buildProps();
  const roofs = buildRoofSlabs();
  const domes = buildDomes();

  const colliders = [
    ...walls.map(wallRect),
    ...props.map(propRect),
    ...MINARETS.map((m) => ({ minX: m.x - m.half, maxX: m.x + m.half, minZ: m.z - m.half, maxZ: m.z + m.half })),
    ...GATE_TOWERS.map((t) => ({ minX: t.x - t.hx, maxX: t.x + t.hx, minZ: t.z - t.hz, maxZ: t.z + t.hz })),
  ];

  const box = (minX, maxX, minY, maxY, minZ, maxZ) => ({ minX, maxX, minY, maxY, minZ, maxZ });
  const occluders = [];
  for (const w of walls) {
    const r = wallRect(w);
    occluders.push(box(r.minX, r.maxX, 0, w.h, r.minZ, r.maxZ));
  }
  for (const d of lintels) {
    if (d.height >= d.wallH) continue;
    const hw = d.width / 2;
    const ht = d.t / 2;
    occluders.push(d.orient === 'h' ? box(d.x - hw, d.x + hw, d.height, d.wallH, d.z - ht, d.z + ht) : box(d.x - ht, d.x + ht, d.height, d.wallH, d.z - hw, d.z + hw));
  }
  for (const s of roofs) occluders.push(box(s.rect[0], s.rect[2], s.y, s.y + s.th, s.rect[1], s.rect[3]));
  for (const p of props) {
    if (!CAMERA_BLOCKERS.has(p.type)) continue;
    const s = PROP_SPECS[p.type];
    occluders.push(box(p.x - s.hx, p.x + s.hx, 0, s.h, p.z - s.hz, p.z + s.hz));
  }
  for (const m of MINARETS) occluders.push(box(m.x - m.half, m.x + m.half, 0, m.height, m.z - m.half, m.z + m.half));
  for (const t of GATE_TOWERS) occluders.push(box(t.x - t.hx, t.x + t.hx, 0, t.height, t.z - t.hz, t.z + t.hz));
  const cd = CENTRAL_DOME;
  occluders.push(box(cd.x - cd.radius, cd.x + cd.radius, HALL_H, HALL_H + cd.drumH + cd.radius * cd.squash, cd.z - cd.radius, cd.z + cd.radius));
  const GROUND = box(-2000, 2000, -6, 0.05, -2000, 2000); // kamera tidak boleh masuk ke bawah tanah

  const colliderGrid = makeGrid(colliders);
  const occluderGrid = makeGrid(occluders);
  const R = PLAYER_RADIUS;

  const near = (x, z) => colliderGrid.query(x, z, 3);
  const move = (pos, dx, dz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    let x = pos.x;
    let z = pos.z;
    for (let i = 0; i < n; i++) {
      const c = resolveMove({ x: x + dx / n, z: z + dz / n }, R, near(x, z), WORLD_LIMIT);
      x = c.x;
      z = c.z;
    }
    return { x, z };
  };

  const roomAt = (x, z) => {
    const r = ROOMS.find((q) => inRect(q.rect, x, z));
    if (r) return { id: r.id, name: r.name, kind: r.kind, indoor: true };
    const zn = ZONES.find((q) => inRect(q.rect, x, z));
    if (zn) return { id: zn.id, name: zn.name, kind: zn.kind, indoor: false };
    if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return { id: 'outside', name: 'Di luar kompleks', kind: 'outside', indoor: false };
    return { id: 'grounds', name: 'Kompleks Masjid', kind: 'grounds', indoor: false };
  };

  cached = Object.freeze({
    name: 'masjid-agung-nikora',
    bounds: BOUNDS,
    limit: WORLD_LIMIT,
    spawn: SPAWN,
    radius: R,
    rooms: ROOMS,
    zones: ZONES,
    doors: DOORS,
    walls,
    lintels,
    orphanDoors: orphans,
    props,
    roofs,
    domes,
    colliders,
    occluders,
    places: PLACES,
    move,
    constrain: (pos) => resolveMove(pos, R, near(pos.x, pos.z), WORLD_LIMIT),
    canStand: (x, z) => isWalkable(x, z, R, near(x, z), WORLD_LIMIT),
    occludersNear: (x, z, r) => [...occluderGrid.query(x, z, r), GROUND],
    roomAt,
  });
  return cached;
}
