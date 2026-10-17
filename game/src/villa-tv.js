// Penempatan TV di tiap kamar tidur villa. Murni data + matematika (tanpa THREE/DOM) agar bisa diuji.
// TV dipasang di dinding yang menghadap kaki tempat tidur, digeser dari pintu dan jendela, menghadap ke tempat tidur.
import { WALL_THICKNESS, levelY } from './villa-layout.js';

export const TV = Object.freeze({
  width: 1.2, height: 0.675, // layar 16:9 (±55 inci)
  bezel: 0.05, // tebal bingkai tiap sisi
  depth: 0.06, // tebal bingkai ke dinding
  centerY: 1.55, // tinggi pusat layar dari lantai (terlihat dari tempat tidur)
  gap: 0.07, // pusat grup layar ke muka dinding dalam: sisi belakang bingkai menempel dinding
});

// Aturan jendela SAMA dengan buildWalls() di villa-world.js (lebar 1,5 m; hanya dinding luar sepanjang >= 3,4 m;
// n = floor((panjang - 1,4) / 3,2) jendela, tersebar rata). villa-tv.test.js menjaga agar keduanya tidak berpisah.
export const WINDOW_W = 1.5;

/** Dinding luar = salah satu sisinya tidak berbatasan dengan ruangan mana pun (titik uji 0,5 m di kedua sisi). */
export function wallIsExterior(w, rooms) {
  const mid = (w.a + w.b) / 2;
  const inside = (x, z) => rooms.some((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]);
  const p1 = w.orient === 'h' ? [mid, w.coord - 0.5] : [w.coord - 0.5, mid];
  const p2 = w.orient === 'h' ? [mid, w.coord + 0.5] : [w.coord + 0.5, mid];
  return !(inside(...p1) && inside(...p2));
}

/** Titik tengah jendela di satu potongan dinding. */
export function windowCenters(w, exterior) {
  const len = w.b - w.a;
  const n = exterior && len >= 3.4 ? Math.floor((len - 1.4) / 3.2) : 0;
  return Array.from({ length: n }, (_, i) => w.a + (len * (i + 0.5)) / n);
}

const EDGE = 0.25; // jarak dari garis tengah dinding sudut ruangan (tebal dinding 0,15 + napas)
const DOOR_PAD = 0.12; // rangka pintu menjorok
const WINDOW_HALF = WINDOW_W / 2 + 0.06 + 0.05; // rangka jendela menjorok + napas
const STEP = 0.05;

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

/** Interval x pada dinding horizontal z = wallZ yang tidak boleh ditutup TV (pintu dan jendela). */
function blockedSpans(level, rooms, wallZ) {
  const spans = [];
  for (const d of level.doors) {
    if (d.orient === 'h' && Math.abs(d.z - wallZ) < 1e-6) spans.push([d.x - d.width / 2 - DOOR_PAD, d.x + d.width / 2 + DOOR_PAD]);
  }
  for (const w of level.walls) {
    if (w.dup || w.orient !== 'h' || Math.abs(w.coord - wallZ) > 1e-6) continue;
    for (const c of windowCenters(w, wallIsExterior(w, rooms))) spans.push([c - WINDOW_HALF, c + WINDOW_HALF]);
  }
  return spans;
}

/**
 * Satu TV per tempat tidur. Kepala tempat tidur di sisi utara bila z < 10 (sama seperti villa-world.js), jadi kaki
 * menghadap ke selatan dan TV di dinding selatan; sebaliknya untuk kamar di sisi selatan.
 * -> [{ id, roomId, level, x, y, z, ry, width, height }]
 */
export function bedroomTvs(world) {
  const out = [];
  for (const level of world.levels) {
    for (const bed of world.allProps.filter((p) => p.type === 'bed' && p.level === level.level)) {
      const room = level.rooms.find((r) => r.kind !== 'stair' && inRect(r.rect, bed.x, bed.z));
      if (!room) continue;
      const [x1, z1, x2, z2] = room.rect;
      const dir = bed.z < 10 ? 1 : -1; // arah dari kepala ke kaki tempat tidur
      const wallZ = dir > 0 ? z2 : z1;
      const spans = blockedSpans(level, level.rooms, wallZ);
      const half = TV.width / 2 + TV.bezel;
      const lo = x1 + EDGE + half;
      const hi = x2 - EDGE - half;
      let best = null;
      for (let x = lo; x <= hi + 1e-9; x += STEP) {
        if (spans.some(([a, b]) => x + half > a && x - half < b)) continue;
        // terdekat dengan tempat tidur; lampu status pintu ada di sisi +x pintu, jadi sisi -x sedikit diutamakan
        const cost = Math.abs(x - bed.x) + (x > bed.x ? 0.01 : 0);
        if (!best || cost < best.cost - 1e-9) best = { x, cost };
      }
      if (!best) throw new Error(`Tidak ada tempat kosong untuk TV di ${room.id}`);
      const z = dir > 0 ? wallZ - WALL_THICKNESS / 2 - TV.gap : wallZ + WALL_THICKNESS / 2 + TV.gap;
      out.push({
        id: `tv_${room.id}`, roomId: room.id, level: level.level,
        x: Math.round(best.x * 100) / 100, y: levelY(level.level) + TV.centerY, z: Math.round(z * 1000) / 1000,
        ry: dir > 0 ? Math.PI : 0, // bidang layar menghadap +z secara bawaan; dinding selatan menghadap utara (-z)
        width: TV.width, height: TV.height,
        bedX: bed.x, bedZ: bed.z,
      });
    }
  }
  return out;
}
