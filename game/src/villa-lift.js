// Lift mewah NIKORA Villa (lobi timur laut, tembus lantai 1-3).
// Modul ini murni data + matematika (tanpa THREE) supaya dipakai bersama klien (render, tabrakan) dan server (otoritatif).
//
// Cara kerja: tiap lantai punya "titik lift" (spot kind 'lift') di tengah kabin, satu untuk tiap tujuan. Pemain di dalam kabin
// memilih lantai tujuan; klien memakai titik itu lewat mekanisme duduk yang sudah ada (`sit`), jadi tidak ada pesan jaringan baru.
// Server (Room.step) lalu menaikkan/menurunkan pemain sesuai jadwal yang sama dengan `liftProgress` di bawah.
import { LEVEL_COUNT, LEVEL_HEIGHT, levelY } from './villa-layout.js';

// Pusat kabin (x, z). Pintu kabin menghadap selatan (+z), ke ruang lobi/perpustakaan/teras di depannya.
export const LIFT = Object.freeze({
  id: 'lift_lobi',
  name: 'Lift Lobi',
  x: 24.3,
  z: -18.55,
  half: 1.1, // kabin 2,2 m x 2,2 m
  openHalf: 0.65, // bukaan pintu selebar 1,3 m
  height: 2.6, // tinggi kabin
  topY: 10.2, // puncak poros kaca
  shaft: Object.freeze({ minX: 23.0, maxX: 25.6, minZ: -19.8, maxZ: -17.27 }),
});

// Jadwal perjalanan (ms). Harus sama di klien dan server.
export const RIDE = Object.freeze({ closeMs: 700, perLevelMs: 2300, openMs: 700 });

/** Dinding poros sebagai kotak tabrakan (AABB). Bagian dalam kabin dan bukaan pintu dibiarkan kosong. */
export function liftColliders() {
  const { minX, maxX, minZ, maxZ } = LIFT.shaft;
  const w = LIFT.x - LIFT.openHalf;
  const e = LIFT.x + LIFT.openHalf;
  const frontMinZ = LIFT.z + LIFT.half - 0.04; // muka depan kabin + dinding depan
  return [
    { minX, maxX, minZ, maxZ: LIFT.z - LIFT.half + 0.05 }, // belakang (cermin)
    { minX, maxX: LIFT.x - LIFT.half, minZ, maxZ }, // kiri
    { minX: LIFT.x + LIFT.half, maxX, minZ, maxZ }, // kanan
    { minX, maxX: w, minZ: frontMinZ, maxZ }, // depan kiri
    { minX: e, maxX, minZ: frontMinZ, maxZ }, // depan kanan
  ];
}

/** Kotak penghalang kamera (tinggi penuh poros) supaya kamera orang ketiga tidak menembus dinding kabin. */
export function liftCameraBoxes() {
  return liftColliders().map((c) => ({ ...c, minY: 0, maxY: LIFT.topY }));
}

/** Titik lift: satu untuk tiap pasangan (lantai asal -> tujuan). id = indeks di world.spots. */
export function liftSpots(firstId) {
  const out = [];
  let id = firstId;
  for (let level = 0; level < LEVEL_COUNT; level++) {
    for (let to = 0; to < LEVEL_COUNT; to++) {
      if (to === level) continue;
      out.push({ id: id++, kind: 'lift', x: LIFT.x, z: LIFT.z, rot: Math.PI, level, to });
    }
  }
  return out;
}

const installed = new WeakSet();

/** Pasang lift ke dunia vila (idempoten): kotak tabrakan di tiap lantai dan titik lift di akhir world.spots. */
export function installLift(world) {
  if (!world?.levels || !world.spots || installed.has(world)) return world;
  installed.add(world);
  const boxes = liftColliders();
  for (const level of world.levels) level.colliders.push(...boxes);
  world.spots.push(...liftSpots(world.spots.length));
  return world;
}

export const isLiftSpot = (world, id) => world?.spots?.[id]?.kind === 'lift';

export function liftSpotFor(world, level, to) {
  return world.spots.find((s) => s.kind === 'lift' && s.level === level && s.to === to) ?? null;
}

/** Pemain lain (bukan selfId) yang sedang memakai lift, atau null. */
export function liftRider(world, players, selfId) {
  return players.find((p) => p.id !== selfId && Number.isInteger(p.sit) && isLiftSpot(world, p.sit)) ?? null;
}

/** Apakah pemain berdiri di dalam kabin (bukan di tangga)? */
export function inCab(pos, margin = 0.1) {
  if (!pos || pos.stair != null) return false;
  const r = LIFT.half - margin;
  return Math.abs(pos.x - LIFT.x) <= r && Math.abs(pos.z - LIFT.z) <= r;
}

export const rideDuration = (from, to) => RIDE.closeMs + Math.abs(to - from) * RIDE.perLevelMs + RIDE.openMs;

/**
 * Keadaan lift pada `elapsedMs` sejak mulai: y = ketinggian permukaan lantai kabin, door = bukaan pintu 0..1,
 * level = lantai yang dipakai pemain (berganti saat tiba), done = pintu sudah terbuka penuh di tujuan.
 */
export function liftProgress(from, to, elapsedMs) {
  const t = Math.max(0, elapsedMs);
  const travel = Math.abs(to - from) * RIDE.perLevelMs;
  const arriveAt = RIDE.closeMs + travel;
  const y0 = levelY(from);
  const y1 = levelY(to);
  let y = y0;
  let door = 1;
  if (t < RIDE.closeMs) {
    door = 1 - t / RIDE.closeMs;
  } else if (t < arriveAt) {
    const k = (t - RIDE.closeMs) / travel;
    y = y0 + (y1 - y0) * k * k * (3 - 2 * k);
    door = 0;
  } else {
    y = y1;
    door = Math.min(1, (t - arriveAt) / RIDE.openMs);
  }
  return { y, door, level: t >= arriveAt ? to : from, done: t >= arriveAt + RIDE.openMs, direction: Math.sign(to - from), total: arriveAt + RIDE.openMs };
}

export { LEVEL_HEIGHT };
