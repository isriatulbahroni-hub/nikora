// Denah "Rumah Tua" untuk Mansion Horor: satu lantai, enam ruangan, dua gerbang terkunci. Orisinal untuk proyek ini.
//
// Koordinat meter, x ke timur, z ke selatan. Alur: ambil pistol di Lobi -> Perpustakaan (kunci gudang) -> Gudang
// (kunci gerbang, dijaga zombie besar) -> Lorong -> gerbang -> Teras (keluar). Dapur dan Lorong berisi bekal dan zombie biasa.
import { Room } from './horor-room.js';
import { texMat } from './horor-core.js';

export const MANSION = Object.freeze({
  name: 'Rumah Tua',
  size: [0, 0, 32, 18],
  wallHeight: 3,
  start: { x: 6, z: 7, rot: 0 },
  rooms: [
    { id: 'lobi', name: 'Lobi', rect: [0, 0, 12, 10] },
    { id: 'perpus', name: 'Perpustakaan', rect: [12, 0, 22, 10] },
    { id: 'gudang', name: 'Gudang', rect: [22, 0, 32, 10] },
    { id: 'dapur', name: 'Dapur', rect: [0, 10, 12, 18] },
    { id: 'lorong', name: 'Lorong', rect: [12, 10, 22, 18] },
    { id: 'teras', name: 'Teras', rect: [22, 10, 32, 18] },
  ],
  // sumbu 'x' = dinding sepanjang X di z = at; 'z' = dinding sepanjang Z di x = at. gaps = bukaan pintu.
  walls: [
    { axis: 'x', at: 0, from: 0, to: 32, inner: 1, win: [{ a: 3, b: 5, y0: 1, y1: 2.2 }, { a: 16, b: 18, y0: 1, y1: 2.2 }, { a: 26, b: 28, y0: 1, y1: 2.2 }] },
    { axis: 'x', at: 18, from: 0, to: 32, inner: -1 },
    { axis: 'z', at: 0, from: 0, to: 18, inner: 1 },
    { axis: 'z', at: 32, from: 0, to: 18, inner: -1 },
    { axis: 'x', at: 10, from: 0, to: 32, inner: 1, gaps: [{ a: 5, b: 7 }, { a: 16, b: 18 }], wains: 1 },
    { axis: 'z', at: 12, from: 0, to: 18, inner: 1, gaps: [{ a: 4, b: 6 }, { a: 13, b: 15 }], wains: 1 },
    { axis: 'z', at: 22, from: 0, to: 18, inner: 1, gaps: [{ a: 4, b: 6 }, { a: 13, b: 15 }], wains: 1 },
  ],
  gates: [
    { id: 'gudang', axis: 'z', at: 22, pos: 5, w: 2, key: 'kunci:gudang', label: 'Pintu gudang terkunci. Butuh kunci gudang.' },
    { id: 'gerbang', axis: 'z', at: 22, pos: 14, w: 2, key: 'kunci:gerbang', label: 'Gerbang teras terkunci. Butuh kunci gerbang.' },
  ],
  exit: { rect: [25, 11, 31, 17] },
  pickups: [
    { id: 'p-pistol', item: 'pistol', x: 3, z: 3 },
    { id: 'p-amunisi-lobi', item: 'ammo', qty: 4, x: 9, z: 2 },
    { id: 'p-tonik-dapur', item: 'tonik', x: 2, z: 16 },
    { id: 'p-amunisi-dapur', item: 'ammo', qty: 4, x: 10, z: 16 },
    { id: 'p-kunci-gudang', item: 'kunci:gudang', x: 20, z: 2 },
    { id: 'p-amunisi-perpus', item: 'ammo', qty: 4, x: 14, z: 2 },
    { id: 'p-berkas', item: 'berkas:catatan', x: 13.5, z: 17 },
    { id: 'p-tonik-gudang', item: 'tonik', x: 24, z: 2 },
    { id: 'p-amunisi-gudang', item: 'ammo', qty: 6, x: 30, z: 8 },
    { id: 'p-kunci-gerbang', item: 'kunci:gerbang', x: 30, z: 2 },
  ],
  zombies: [
    { id: 'z-dapur', type: 'walker', x: 6, z: 15, rot: Math.PI },
    { id: 'z-perpus', type: 'walker', x: 17, z: 6, rot: 0 },
    { id: 'z-lorong', type: 'walker', x: 17, z: 14, rot: 0, dormant: true },
    { id: 'z-gudang', type: 'brute', x: 27, z: 5, rot: 0, dormant: true, wakeDist: 3 },
  ],
});

export const roomAt = (layout, x, z) => layout.rooms.find((r) => x >= r.rect[0] && x < r.rect[2] && z >= r.rect[1] && z < r.rect[3]) ?? null;

/** Bangun Room (scene THREE + collider) dari denah. Mengembalikan { room, gates } (gates: id -> {x, z, ...}). */
export function buildMansion(layout = MANSION) {
  const room = new Room('mansion', { name: layout.name, fogNear: 6, fogFar: 22 });
  const [x0, z0, x1, z1] = layout.size;
  room.floor(x0, z0, x1, z1, texMat('floor', 0x4a3b2c), 2);
  room.ceiling(x0, z0, x1, z1, layout.wallHeight);
  for (const w of layout.walls) room.wall(w.axis, w.at, w.from, w.to, w.inner, { h: layout.wallHeight, win: w.win, gaps: w.gaps, wains: w.wains });
  const gates = {};
  for (const g of layout.gates) gates[g.id] = { ...room.gate(g.id, g), key: g.key, label: g.label };

  room.ambient(0x1a1f33, 0.5);
  room.hemi(0x2a3350, 0x0a0806, 0.35);
  for (const r of layout.rooms) {
    const [a, b, c, d] = r.rect;
    const cx = (a + c) / 2;
    const cz = (b + d) / 2;
    const dying = r.id === 'lorong' || r.id === 'gudang';
    room.point(dying ? 0xffd9a0 : 0xffb870, 1.0, 11, cx, 2.5, cz, dying ? 'dying' : 'lamp');
    // kamera tetap di sudut barat laut ruangan, menghadap pusat (gaya survival horror klasik)
    room.cam(r.id, [a + 0.8, 2.55, b + 0.8], [cx, 0.9, cz], 62);
  }
  room.finalize();
  return { room, gates };
}
