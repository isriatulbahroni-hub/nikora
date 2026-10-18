// Denah Mansion Horor (orisinal): satu lantai, tujuh ruangan, empat pintu terkunci berantai, satu gerbang keluar.
// Ditulis untuk proyek ini; tidak diambil dari game lain.
//
// Dua bagian:
//   1. DATA murni (ROOMS, DOORS, ITEMS, SPAWNS, PROPS, CAMS, LIGHTS) + fungsi murni (roomAt, camAt, canEscape).
//      Bisa diuji penuh tanpa THREE/DOM.
//   2. buildMansion(): menyusun satu `Room` (horor-room.js) dari data itu: lantai, dinding berlubang pintu, gerbang terkunci,
//      perabot ber-collider, lampu, kamera tetap, titik item/gerbang (`spots`), dan titik muncul zombie (`spawns`).
//
// Koordinat dalam meter, lantai y = 0, rect = [x0, z0, x1, z1]. Konvensi arah mengikuti horor-room.js (rot 0 menghadap +z).
//
//   z=0   +----------+----------+----------+
//         | perpus-  | ruang    |  dapur   |
//         | takaan   | kerja    |          |
//   z=10  +--[K]-----+--(  )----+--[K]-----+
//         |            lorong (3 kamera)   |
//   z=16  +--(  )--------(  )--------------+
//         | ruang    |  lobi    |  gudang  |
//         | makan    |          |          |
//   z=28  +----------+---[K]----+----------+   [K] = gerbang terkunci, (  ) = lubang terbuka
//        x=0        x=14       x=22       x=36
//
// Rantai kunci: ruang kerja -> perpustakaan -> dapur -> gudang -> gerbang keluar (di dinding selatan lobi).
import { mat, texMat } from './horor-core.js';
import { FACE, Room } from './horor-room.js';

export const MANSION_RECT = Object.freeze([0, 0, 36, 28]);
export const WALL_H = 3;
const DOOR_H = 2.3;

const freeze = (list) => Object.freeze(list.map((o) => Object.freeze(o)));

export const ROOMS = freeze([
  { id: 'perpustakaan', name: 'Perpustakaan', rect: [0, 0, 12, 10], surface: 'wood' },
  { id: 'ruang_kerja', name: 'Ruang Kerja', rect: [12, 0, 24, 10], surface: 'wood' },
  { id: 'dapur', name: 'Dapur', rect: [24, 0, 36, 10], surface: 'tile' },
  { id: 'lorong', name: 'Lorong Utama', rect: [0, 10, 36, 16], surface: 'carpet' },
  { id: 'ruang_makan', name: 'Ruang Makan', rect: [0, 16, 14, 28], surface: 'wood' },
  { id: 'lobi', name: 'Lobi', rect: [14, 16, 22, 28], surface: 'tile' },
  { id: 'gudang', name: 'Gudang', rect: [22, 16, 36, 28], surface: 'stone' },
]);

/**
 * Pintu/lubang di dinding. axis 'x' = dinding sepanjang X di z = at (pos = x pintu); axis 'z' = dinding sepanjang Z di x = at (pos = z).
 * lock = id item kunci yang membuka gerbangnya (null = lubang terbuka). exit = membuka jalan keluar mansion (menang).
 */
export const DOORS = freeze([
  { id: 'lobi-lorong', axis: 'x', at: 16, pos: 18, w: 1.6, between: ['lobi', 'lorong'], lock: null },
  { id: 'lorong-makan', axis: 'x', at: 16, pos: 7, w: 1.6, between: ['lorong', 'ruang_makan'], lock: null },
  { id: 'lobi-makan', axis: 'z', at: 14, pos: 22, w: 1.6, between: ['lobi', 'ruang_makan'], lock: null },
  { id: 'lorong-kerja', axis: 'x', at: 10, pos: 18, w: 1.6, between: ['lorong', 'ruang_kerja'], lock: null },
  { id: 'lorong-pustaka', axis: 'x', at: 10, pos: 6, w: 1.6, between: ['lorong', 'perpustakaan'], lock: 'kunci:perpustakaan' },
  { id: 'lorong-dapur', axis: 'x', at: 10, pos: 30, w: 1.6, between: ['lorong', 'dapur'], lock: 'kunci:dapur' },
  { id: 'lobi-gudang', axis: 'z', at: 22, pos: 22, w: 1.6, between: ['lobi', 'gudang'], lock: 'kunci:gudang' },
  { id: 'gerbang', axis: 'x', at: 28, pos: 18, w: 2.4, between: ['lobi', null], lock: 'kunci:gerbang', exit: true },
]);

/** Jendela di dinding luar utara (z = 0) dan selatan (z = 28). */
const WINDOWS = {
  utara: [{ a: 3.5, b: 5.5, y0: 1.1, y1: 2.3 }, { a: 16, b: 20, y0: 1.1, y1: 2.3 }, { a: 28, b: 32, y0: 1.1, y1: 2.3 }],
  selatan: [{ a: 6, b: 8, y0: 1.1, y1: 2.3 }, { a: 28, b: 31, y0: 1.1, y1: 2.3 }],
};

/** Titik awal pemain: lobi, menghadap utara (ke lorong). */
export const PLAYER_START = Object.freeze({ x: 18, z: 25, rot: FACE.N, room: 'lobi' });

/** Item di lantai. Slot inventori terbatas, jadi peluru dan tonik sengaja sedikit. id item mengikuti horor-rules.js. */
export const ITEMS = freeze([
  { room: 'lobi', item: 'pistol', qty: 1, x: 16.5, z: 26.5 },
  { room: 'lobi', item: 'ammo', qty: 8, x: 20.5, z: 26.5 },
  { room: 'ruang_makan', item: 'tonik', qty: 1, x: 2, z: 19 },
  { room: 'ruang_makan', item: 'ammo', qty: 6, x: 11, z: 26 },
  { room: 'ruang_makan', item: 'berkas:surat-tuan', qty: 1, x: 7, z: 25.5 },
  { room: 'ruang_kerja', item: 'kunci:perpustakaan', qty: 1, x: 14, z: 8.5 },
  { room: 'lorong', item: 'ammo', qty: 4, x: 33, z: 13 },
  { room: 'perpustakaan', item: 'kunci:dapur', qty: 1, x: 6, z: 1.5 },
  { room: 'perpustakaan', item: 'tonik', qty: 1, x: 11, z: 5 },
  { room: 'dapur', item: 'kunci:gudang', qty: 1, x: 26, z: 8.5 },
  { room: 'dapur', item: 'tonik', qty: 1, x: 34.5, z: 2 },
  { room: 'gudang', item: 'ammo', qty: 6, x: 23.2, z: 19.5 },
  { room: 'gudang', item: 'kunci:gerbang', qty: 1, x: 34.5, z: 26.5 },
]);

/** Titik muncul zombie (bentuk sama dengan createZombie di horor-zombie.js). Lobi dan ruang kerja sengaja aman. */
export const SPAWNS = freeze([
  { id: 'z-makan', type: 'walker', x: 3, z: 25, rot: 0, dormant: true, wakeDist: 2.4 },
  { id: 'z-lorong-1', type: 'walker', x: 28, z: 13, rot: FACE.W },
  { id: 'z-lorong-2', type: 'walker', x: 10, z: 13.5, rot: FACE.E },
  { id: 'z-pustaka', type: 'walker', x: 10.8, z: 8, rot: 0, dormant: true, wakeDist: 2.4 },
  { id: 'z-dapur', type: 'brute', x: 34, z: 8, rot: FACE.W, dormant: true, wakeDist: 2.6 },
  { id: 'z-gudang-1', type: 'walker', x: 30, z: 26, rot: FACE.N },
  { id: 'z-gudang-2', type: 'brute', x: 28, z: 24, rot: FACE.N, dormant: true, wakeDist: 2.6 },
]);

/** Perabot ber-collider: kotak w x h x d berpusat di (x, z). */
export const PROPS = freeze([
  { room: 'lobi', w: 0.6, h: WALL_H, d: 0.6, x: 16, z: 20, color: 0x4a4038 },
  { room: 'lobi', w: 0.6, h: WALL_H, d: 0.6, x: 20, z: 20, color: 0x4a4038 },
  { room: 'ruang_makan', w: 4, h: 0.9, d: 1.4, x: 7, z: 23, color: 0x3b2a1d },
  { room: 'ruang_kerja', w: 3, h: 0.9, d: 1.2, x: 18, z: 3.4, color: 0x3b2a1d },
  { room: 'perpustakaan', w: 0.6, h: 2.2, d: 6, x: 3, z: 4, color: 0x2e2118 },
  { room: 'perpustakaan', w: 0.6, h: 2.2, d: 6, x: 9, z: 4, color: 0x2e2118 },
  { room: 'dapur', w: 4, h: 0.9, d: 1.2, x: 30, z: 5, color: 0x6b6e70 },
  { room: 'dapur', w: 3, h: 0.9, d: 0.6, x: 27, z: 0.7, color: 0x6b6e70 },
  { room: 'gudang', w: 1.2, h: 1.2, d: 1.2, x: 25, z: 18.5, color: 0x5b4a30 },
  { room: 'gudang', w: 1.6, h: 1.6, d: 1.6, x: 33, z: 18.5, color: 0x5b4a30 },
  { room: 'gudang', w: 1.4, h: 1.2, d: 1.4, x: 24, z: 26.5, color: 0x5b4a30 },
  { room: 'gudang', w: 1.2, h: 1.0, d: 1.2, x: 31, z: 23, color: 0x5b4a30 },
  { room: 'gudang', w: 1.0, h: 1.6, d: 1.0, x: 34.5, z: 22, color: 0x5b4a30 },
]);

/**
 * Kamera tetap. `zone` = rect tempat kamera ini aktif. Lorong dibagi tiga zona supaya tidak terlalu jauh.
 * Setiap titik di dalam mansion harus masuk tepat satu zona (diuji).
 */
export const CAMS = freeze([
  { room: 'perpustakaan', zone: [0, 0, 12, 10], pos: [11.4, 2.7, 9.4], look: [5, 0.9, 3.5], fov: 58 },
  { room: 'ruang_kerja', zone: [12, 0, 24, 10], pos: [12.6, 2.7, 9.4], look: [19, 0.9, 3.5], fov: 58 },
  { room: 'dapur', zone: [24, 0, 36, 10], pos: [35.4, 2.7, 9.4], look: [29, 0.9, 3.5], fov: 58 },
  { room: 'lorong', zone: [0, 10, 12, 16], pos: [0.6, 2.7, 10.6], look: [7, 0.9, 13.5], fov: 62 },
  { room: 'lorong', zone: [12, 10, 24, 16], pos: [12.6, 2.7, 10.6], look: [19, 0.9, 13.5], fov: 62 },
  { room: 'lorong', zone: [24, 10, 36, 16], pos: [24.6, 2.7, 10.6], look: [31, 0.9, 13.5], fov: 62 },
  { room: 'ruang_makan', zone: [0, 16, 14, 28], pos: [0.6, 2.7, 27.4], look: [7, 0.9, 21.5], fov: 58 },
  { room: 'lobi', zone: [14, 16, 22, 28], pos: [21.4, 2.7, 16.6], look: [18, 0.9, 23], fov: 60 },
  { room: 'gudang', zone: [22, 16, 36, 28], pos: [22.6, 2.7, 27.4], look: [29, 0.9, 21.5], fov: 58 },
]);

/** Lampu. `core` = tetap menyala pada mode hemat (HP); sisanya dilewati. kedip: 'lamp' (halus) atau 'dying' (hampir mati). */
export const LIGHTS = freeze([
  { room: 'lobi', x: 18, z: 22, color: 0xffd9a0, i: 1.0, d: 14, flicker: 'lamp', core: true },
  { room: 'lorong', x: 6, z: 13, color: 0xe8c890, i: 0.7, d: 13, core: false },
  { room: 'lorong', x: 18, z: 13, color: 0xe8c890, i: 0.8, d: 13, flicker: 'dying', core: true },
  { room: 'lorong', x: 30, z: 13, color: 0xe8c890, i: 0.7, d: 13, core: false },
  { room: 'ruang_makan', x: 7, z: 22, color: 0xffcf8a, i: 0.9, d: 15, core: true },
  { room: 'ruang_kerja', x: 18, z: 5, color: 0xa8c0ff, i: 0.7, d: 14, core: true },
  { room: 'perpustakaan', x: 6, z: 5, color: 0xd9b27a, i: 0.6, d: 13, core: true },
  { room: 'dapur', x: 30, z: 5, color: 0xc8e0d0, i: 0.8, d: 14, flicker: 'dying', core: true },
  { room: 'gudang', x: 29, z: 22, color: 0x9fb4d8, i: 0.6, d: 16, core: true },
]);

const COLORS = Object.freeze({ ammo: 0xc9a227, heal: 0x3fae5a, key: 0xdcdcf0, weapon: 0x8a8f99, file: 0xe8e0c0 });
const itemColor = (id) => {
  if (id.startsWith('kunci:')) return COLORS.key;
  if (id.startsWith('berkas:')) return COLORS.file;
  if (id === 'ammo') return COLORS.ammo;
  if (id === 'tonik') return COLORS.heal;
  return COLORS.weapon;
};

const inRect = (x, z, r) => x >= r[0] && x < r[2] && z >= r[1] && z < r[3];

/** Ruangan yang memuat titik (x, z), atau null bila di luar mansion. */
export function roomAt(x, z, rooms = ROOMS) {
  for (const r of rooms) if (inRect(x, z, r.rect)) return r;
  return null;
}

/** Kamera tetap untuk titik (x, z): yang zonanya memuat titik; di luar semua zona -> yang terdekat ke pusat zona. */
export function camAt(x, z, cams = CAMS) {
  for (const c of cams) if (inRect(x, z, c.zone)) return c;
  let best = null;
  let bd = Infinity;
  for (const c of cams) {
    const d = Math.hypot((c.zone[0] + c.zone[2]) / 2 - x, (c.zone[1] + c.zone[3]) / 2 - z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Bisakah pemain keluar? Mulai dari ruangan awal dengan tangan kosong, ambil semua kunci di ruangan yang terjangkau,
 * buka pintu yang kuncinya sudah ada, ulangi. Berhasil bila gerbang keluar bisa dibuka dari ruangan yang terjangkau.
 */
export function canEscape({ doors = DOORS, items = ITEMS, start = PLAYER_START.room } = {}) {
  const reach = new Set([start]);
  const keys = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const it of items) {
      if (reach.has(it.room) && it.item.startsWith('kunci:') && !keys.has(it.item)) {
        keys.add(it.item);
        changed = true;
      }
    }
    for (const d of doors) {
      if (d.lock && !keys.has(d.lock)) continue;
      const [a, b] = d.between;
      if (d.exit && reach.has(a)) return true;
      if (b && reach.has(a) !== reach.has(b)) {
        reach.add(a);
        reach.add(b);
        changed = true;
      }
    }
  }
  return false;
}

// ---- pembangun ----

/** Dinding sepanjang `axis` di `at` dari `from` ke `to`, dengan lubang pintu `gaps` ({pos, w}) dan jendela yang jatuh di tiap ruas. */
function wallWithGaps(room, axis, at, from, to, inner, gaps = [], wins = []) {
  let cur = from;
  const seg = (a, b) => {
    if (b - a < 0.001) return;
    const win = wins.filter((w) => w.a >= a && w.b <= b);
    room.wall(axis, at, a, b, inner, { win, wains: 1.0 });
  };
  for (const g of gaps.slice().sort((p, q) => p.pos - q.pos)) {
    seg(cur, g.pos - g.w / 2);
    cur = g.pos + g.w / 2;
  }
  seg(cur, to);
}

/** Ambang pintu: dua tiang dan balok atas (lubang pintu tidak punya daun pintu, jadi bisa dilewati tanpa animasi). */
function doorFrame(room, d) {
  const frame = mat(0x2a2622);
  const top = WALL_H - DOOR_H;
  if (d.axis === 'x') {
    room.box(d.w, top, 0.2, frame, d.pos, DOOR_H, d.at);
    room.box(0.1, DOOR_H, 0.26, frame, d.pos - d.w / 2 - 0.05, 0, d.at);
    room.box(0.1, DOOR_H, 0.26, frame, d.pos + d.w / 2 + 0.05, 0, d.at);
  } else {
    room.box(0.2, top, d.w, frame, d.at, DOOR_H, d.pos);
    room.box(0.26, DOOR_H, 0.1, frame, d.at, 0, d.pos - d.w / 2 - 0.05);
    room.box(0.26, DOOR_H, 0.1, frame, d.at, 0, d.pos + d.w / 2 + 0.05);
  }
}

/** Gerbang terkunci: terdaftar di room.shutters[id] sehingga room.setShutter(id, false, true) membukanya (collider ikut pergi). */
function lockedGate(room, d) {
  const sm = texMat('shutter', 0x6c7076);
  const long = d.w + 0.4;
  const mesh =
    d.axis === 'x'
      ? room.box(long, DOOR_H, 0.08, sm, d.pos, 0, d.at, { dyn: true })
      : room.box(0.08, DOOR_H, long, sm, d.at, 0, d.pos, { dyn: true });
  const c =
    d.axis === 'x'
      ? { x0: d.pos - long / 2, x1: d.pos + long / 2, z0: d.at - 0.25, z1: d.at + 0.25, kind: 'wall' }
      : { x0: d.at - 0.25, x1: d.at + 0.25, z0: d.pos - long / 2, z1: d.pos + long / 2, kind: 'wall' };
  room.colliders.push(c);
  (room.shutters ||= {})[d.id] = { mesh, c, saved: { ...c }, y: mesh.position.y };
}

/**
 * Bangun mansion sebagai satu Room (sudah finalize). `lights: 'low'` hanya memasang lampu `core` (hemat untuk HP).
 * Hasil tambahan di `room.layout`: { rect, rooms, doors, items, start, lights } dan `room.spots` (kind 'item' | 'gate').
 * Buka gerbang dengan room.setShutter(id, false, true); item diambil dengan menyembunyikan `spot.mesh`.
 */
export function buildMansion({ lights = 'full' } = {}) {
  const room = new Room('mansion', { name: 'Mansion Horor', ambience: [0.05, 0.05, 0.08], fogNear: 6, fogFar: 22 });
  const [X0, Z0, X1, Z1] = MANSION_RECT;
  const gapsOf = (axis, at) => DOORS.filter((d) => d.axis === axis && d.at === at).map((d) => ({ pos: d.pos, w: d.w }));
  const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

  // lantai per ruangan, satu langit-langit
  const floorColor = { wood: 0x3a2a1c, tile: 0x4a4d52, carpet: 0x3d1f22, stone: 0x45423c };
  for (const r of ROOMS) room.floor(...r.rect, texMat(r.surface, floorColor[r.surface]), 2.5);
  room.ceiling(X0, Z0, X1, Z1, WALL_H, texMat('ceiling', 0x2b2824));

  // dinding luar
  wallWithGaps(room, 'x', Z0, X0, X1, 1, [], WINDOWS.utara);
  wallWithGaps(room, 'x', Z1, X0, X1, -1, gapsOf('x', Z1), WINDOWS.selatan);
  wallWithGaps(room, 'z', X0, Z0, Z1, 1);
  wallWithGaps(room, 'z', X1, Z0, Z1, -1);
  // dinding dalam
  wallWithGaps(room, 'x', 10, X0, X1, 1, gapsOf('x', 10));
  wallWithGaps(room, 'x', 16, X0, X1, 1, gapsOf('x', 16));
  wallWithGaps(room, 'z', 12, 0, 10, 1);
  wallWithGaps(room, 'z', 24, 0, 10, 1);
  wallWithGaps(room, 'z', 14, 16, Z1, 1, gapsOf('z', 14));
  wallWithGaps(room, 'z', 22, 16, Z1, 1, gapsOf('z', 22));

  for (const d of DOORS) {
    doorFrame(room, d);
    if (d.lock) {
      lockedGate(room, d);
      const [gx, gz] = d.axis === 'x' ? [d.pos, d.at] : [d.at, d.pos];
      room.spot({ kind: 'gate', id: d.id, x: gx, z: gz, r: 1.6, lock: d.lock, exit: !!d.exit });
    }
  }

  for (const p of PROPS) room.box(p.w, p.h, p.d, mat(p.color), p.x, 0, p.z, { solid: true });

  ITEMS.forEach((it, i) => {
    const mesh = room.box(0.28, 0.28, 0.28, mat(itemColor(it.item)), it.x, 0.05, it.z, { dyn: true, cast: false });
    room.spot({ kind: 'item', id: `i${i}`, item: it.item, qty: it.qty, room: it.room, x: it.x, z: it.z, r: 1.1, mesh });
  });

  room.ambient(0x3a3f5c, 0.14);
  room.hemi(0x2a3350, 0x120c08, 0.3);
  const placed = [];
  for (const l of LIGHTS) {
    if (lights === 'low' && !l.core) continue;
    placed.push({ room: l.room, light: room.point(l.color, l.i, l.d, l.x, 2.6, l.z, l.flicker) });
  }

  for (const c of CAMS) room.cam(c.zone, c.pos, c.look, c.fov);
  for (const s of SPAWNS) room.enemy({ ...s });

  room.layout = { rect: MANSION_RECT, rooms: ROOMS, doors: DOORS, items: ITEMS, start: PLAYER_START, lights: placed, byId };
  return room.finalize();
}
