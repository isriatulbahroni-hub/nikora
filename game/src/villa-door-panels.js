// Geometri daun pintu villa (murni: tanpa THREE) supaya bisa diuji tanpa renderer.
//
// Aturan produk:
//  - SEMUA pintu ruangan menutup bukaan penuh saat tertutup: tanpa celah di tengah, tepi, atas, maupun bawah.
//  - Pintu ruang utama (aula pernikahan, kind 'hall') dibuka dengan diayun; semua pintu lain dibuka dengan digeser
//    (sliding) di sepanjang dinding.
//
// Koordinat "sepanjang" = searah dinding, relatif ke tengah bukaan; "normal" = tegak lurus dinding.
// Rangka pintu (buildWalls di villa-world.js) menutupi tiap sisi bukaan dari w/2 - FRAME_IN sampai w/2 + FRAME_OUT.
import { DOOR_HEIGHT, HALL_WALL_HEIGHT, WALL_HEIGHT, WALL_THICKNESS } from './villa-layout.js';

export const MAIN_ROOM_KIND = 'hall'; // ruang utama = aula pernikahan: pintunya diayun, bukan digeser
export const FRAME_IN = 0.01; // tepi dalam rangka menjorok ke bukaan
export const FRAME_OUT = 0.09; // tepi luar rangka, diukur dari tepi bukaan
export const LEAF_THICKNESS = 0.06;
export const SWING_OPEN = 1.75; // sudut ayun penuh (rad)
export const SWING_HEIGHT = DOOR_HEIGHT + 0.01; // ujung atas masuk ke ambang
export const SLIDE_HEIGHT = DOOR_HEIGHT + 0.05; // daun geser menutupi rangka atas
// Daun geser tergantung di depan dinding, di luar tonjolan rangka (rangka menjorok 0,04 m dari muka dinding).
export const SLIDE_OFFSET = WALL_THICKNESS / 2 + 0.04 + LEAF_THICKNESS / 2 + 0.01;
export const SLIDE_STAGGER = LEAF_THICKNESS + 0.01; // daun kedua pintu ganda lebih ke luar supaya bisa saling menumpuk
const SWING_HIDDEN = 0.04; // ujung daun ayun masuk ke tiang rangka (tidak terlihat)
const MEET = 0.03; // daun pintu ganda saling menumpuk di tengah

export const isDoubleDoor = (width) => width > 2.0;

const onEdge = (d, [x1, z1, x2, z2]) => (d.orient === 'h'
  ? (Math.abs(d.z - z1) < 1e-6 || Math.abs(d.z - z2) < 1e-6) && d.x > x1 && d.x < x2
  : (Math.abs(d.x - x1) < 1e-6 || Math.abs(d.x - x2) < 1e-6) && d.z > z1 && d.z < z2);

/** Pintu ini milik ruang utama (berada di tepi aula)? Hanya pintu seperti ini yang diayun. */
export function isMainRoomDoor(door, rooms = []) {
  return rooms.some((r) => r.kind === MAIN_ROOM_KIND && r.rect && onEdge(door, r.rect));
}

/**
 * Daun pintu ayun. hinge = posisi engsel, length = panjang daun, dir = arah daun dari engsel (+1/-1),
 * normal = geseran tegak lurus dinding (dua daun bertumpuk tanpa saling menembus), knob = posisi gagang dari engsel.
 */
export function swingLeaves(width) {
  const hinge = width / 2 + SWING_HIDDEN;
  if (!isDoubleDoor(width)) return [{ hinge: -hinge, length: 2 * hinge, dir: 1, normal: 0, knob: 2 * hinge - SWING_HIDDEN - 0.12 }];
  const length = hinge + MEET;
  const knob = length - MEET - 0.12;
  return [
    { hinge: -hinge, length, dir: 1, normal: -LEAF_THICKNESS / 2, knob },
    { hinge, length, dir: -1, normal: LEAF_THICKNESS / 2, knob },
  ];
}

/** Rentang [a, b] yang ditutup daun ayun saat tertutup. */
export const swingSpan = (l) => [Math.min(l.hinge, l.hinge + l.dir * l.length), Math.max(l.hinge, l.hinge + l.dir * l.length)];

/**
 * Daun pintu geser. span = rentang saat tertutup, dir = arah geser saat membuka, travel = jarak geser penuh,
 * normal = tambahan jarak dari dinding. dir untuk pintu tunggal dipilih pemanggil (lihat slideDir).
 */
export function slideLeaves(width, dir = 1) {
  const reach = width / 2 + FRAME_OUT;
  if (!isDoubleDoor(width)) return [{ span: [-reach, reach], dir, travel: width + 0.1, normal: 0 }];
  const travel = width / 2 + MEET + 0.02;
  return [
    { span: [-reach, MEET], dir: -1, travel, normal: 0 },
    { span: [-MEET, reach], dir: 1, travel, normal: SLIDE_STAGGER },
  ];
}

/** Rentang daun geser pada tingkat buka `open` (0 = tertutup, 1 = terbuka penuh). */
export function slideSpanAt(l, open) {
  const shift = l.dir * open * l.travel;
  return [l.span[0] + shift, l.span[1] + shift];
}

/** Panjang dinding lurus (maks `max` m) di sisi `dir` dari tepi bukaan: tempat daun geser menumpuk saat terbuka. */
export function wallRun(door, walls, dir, max = 3) {
  const horizontal = door.orient === 'h';
  const coord = horizontal ? door.z : door.x;
  const edge = (horizontal ? door.x : door.z) + (dir * door.width) / 2;
  let run = 0;
  for (let t = 0.05; t <= max; t += 0.1) {
    const p = edge + dir * t;
    if (!walls.some((w) => w.orient === door.orient && Math.abs(w.coord - coord) < 1e-3 && p > w.a && p < w.b)) break;
    run = t;
  }
  return run;
}

/** Arah geser pintu tunggal: ke sisi yang punya lebih banyak dinding lurus (seri -> arah +). */
export const slideDir = (door, walls = []) => (wallRun(door, walls, 1) >= wallRun(door, walls, -1) ? 1 : -1);

const SIDE_SCORE = { corridor: 2, terrace: 3, stair: 0 };

/** Sisi dinding tempat daun geser digantung (+1 = arah +z/+x): area terbuka lebih dulu, lalu koridor, lalu ruangan lain. */
export function slideSide(door, rooms = []) {
  const horizontal = door.orient === 'h';
  const score = (s) => {
    const x = horizontal ? door.x : door.x + s * 0.8;
    const z = horizontal ? door.z + s * 0.8 : door.z;
    const room = rooms.find((r) => r.rect && x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]);
    return room ? (SIDE_SCORE[room.kind] ?? 1) : 3;
  };
  return score(1) >= score(-1) ? 1 : -1;
}

/** Tinggi ambang (dinding di atas bukaan): sama dengan dinding di sebelahnya, supaya tidak ada lubang di atas pintu. */
export function doorLintelTop(door, walls = []) {
  if (door.tall) return HALL_WALL_HEIGHT;
  const horizontal = door.orient === 'h';
  const coord = horizontal ? door.z : door.x;
  const mid = horizontal ? door.x : door.z;
  const lo = mid - door.width / 2;
  const hi = mid + door.width / 2;
  for (const w of walls) {
    if (w.orient !== door.orient || Math.abs(w.coord - coord) > 1e-3) continue;
    if (Math.abs(w.b - lo) < 0.2 || Math.abs(w.a - hi) < 0.2) return w.h ?? WALL_HEIGHT;
  }
  return WALL_HEIGHT;
}
