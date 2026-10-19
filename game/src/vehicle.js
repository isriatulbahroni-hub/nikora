// Mobil yang bisa dikendarai (murni data + matematika, tanpa THREE). Dipakai klien untuk fisika & kursi.
//
// Konvensi arah = model mobil di villa-props.js (depan = +z) dan rotation.y di THREE:
//   heading 0 -> melaju ke selatan (+z), heading PI -> utara (-z), PI/2 -> timur (+x).
//   maju = (sin h, cos h); kanan mobil = (-cos h, sin h). Lalu lintas jalan di sisi kiri, setir di kanan.
//   Arah hadap avatar yang duduk di mobil (konvensi avatar facing = atan2(-dx,-dz)) = heading + PI.
import { resolveMove, WORLD_LIMIT } from './villa-layout.js';
import { surfaceAt as defaultSurface } from './hotel-layout.js';

export const CAR = Object.freeze({
  length: 4.3, width: 1.82, wheelBase: 2.7,
  maxSpeed: 26, // m/s ~ 94 km/j
  reverseMax: 5, accel: 7.5, brake: 16, maxSteer: 0.52, steerRate: 3.2,
  circleRadius: 1.05, circleOffset: 1.05, // dua lingkaran tabrakan di sumbu depan/belakang
  seats: 4,
});
export const SURFACE_CAP = Object.freeze({ road: 26, compound: 8, ground: 10 });
// Posisi kursi dalam bingkai mobil: fwd (+ ke depan), side (+ ke kanan). Kursi 0 = pengemudi (kanan depan).
export const SEAT_OFFSETS = Object.freeze([
  { fwd: 0.45, side: 0.46 }, { fwd: 0.45, side: -0.46 }, { fwd: -0.7, side: 0.46 }, { fwd: -0.7, side: -0.46 },
]);
export const SEAT_HEIGHT = 0.35; // avatar duduk sedikit di atas tanah
export const BOARD_RANGE = 3.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const forward = (h) => ({ x: Math.sin(h), z: Math.cos(h) });
export const rightOf = (h) => ({ x: -Math.cos(h), z: Math.sin(h) });
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createVehicle({ id, x = 0, z = 0, heading = 0, color = 0xf2f2f0 }) {
  return { id, x, z, heading, speed: 0, steer: 0, engine: false, color, seats: Array(CAR.seats).fill(null), hit: 0 };
}

/**
 * Satu langkah fisika. input = { throttle: -1..1, steer: -1..1 (kanan positif), brake?: bool }.
 * env = { colliders, surfaceAt }. Mengubah dan mengembalikan `v`. v.hit = kekuatan benturan langkah ini (0 = tidak ada).
 */
export function stepVehicle(v, input, dt, env = {}) {
  const surface = (env.surfaceAt ?? defaultSurface)(v.x, v.z);
  const cap = SURFACE_CAP[surface] ?? SURFACE_CAP.ground;
  const throttle = v.engine ? clamp(input.throttle ?? 0, -1, 1) : 0;
  const brake = Boolean(input.brake) || !v.engine && Math.abs(v.speed) > 0;

  // gas / rem / mundur
  if (brake) {
    v.speed = Math.abs(v.speed) <= CAR.brake * dt ? 0 : v.speed - Math.sign(v.speed) * CAR.brake * dt;
  } else if (throttle > 0) {
    v.speed += (v.speed < 0 ? CAR.brake : CAR.accel) * throttle * dt;
  } else if (throttle < 0) {
    v.speed -= (v.speed > 0.3 ? CAR.brake : CAR.accel * 0.6) * -throttle * dt;
  }
  // hambatan: gesekan + udara
  if (throttle === 0 && !brake) {
    const drag = (0.9 + 0.012 * v.speed * v.speed) * dt;
    v.speed = Math.abs(v.speed) <= drag ? 0 : v.speed - Math.sign(v.speed) * drag;
  }
  v.speed = clamp(v.speed, -CAR.reverseMax, CAR.maxSpeed);
  if (v.speed > cap) v.speed = Math.max(cap, v.speed - 14 * dt); // di tanah/halaman villa pelan-pelan melambat
  if (v.speed < -cap) v.speed = Math.min(-cap, v.speed + 14 * dt);

  // setir: makin cepat makin sempit sudutnya
  const lock = CAR.maxSteer * (1 - 0.6 * Math.min(1, Math.abs(v.speed) / CAR.maxSpeed));
  const target = clamp(input.steer ?? 0, -1, 1) * lock;
  const dSteer = clamp(target - v.steer, -CAR.steerRate * dt, CAR.steerRate * dt);
  v.steer += dSteer;

  // gerak (sepeda kinematik: pusat = sumbu belakang+setengah wheelBase, disederhanakan ke pusat mobil)
  v.heading = wrapAngle(v.heading + (v.speed / CAR.wheelBase) * Math.tan(v.steer) * dt);
  const f = forward(v.heading);
  v.x += f.x * v.speed * dt;
  v.z += f.z * v.speed * dt;

  // tabrakan: dua lingkaran melawan kotak penghalang
  v.hit = 0;
  const colliders = env.colliders ?? [];
  if (colliders.length) {
    let ox = 0;
    let oz = 0;
    for (const s of [CAR.circleOffset, -CAR.circleOffset]) {
      const p = { x: v.x + f.x * s, z: v.z + f.z * s };
      const q = resolveMove(p, CAR.circleRadius, colliders, WORLD_LIMIT);
      ox += q.x - p.x;
      oz += q.z - p.z;
    }
    const push = Math.hypot(ox, oz) / 2;
    if (push > 1e-4) {
      v.x += ox / 2;
      v.z += oz / 2;
      v.hit = Math.abs(v.speed);
      v.speed *= 0.2; // benturan: hampir berhenti
    }
  }
  const b = WORLD_LIMIT;
  v.x = clamp(v.x, b.minX + CAR.length / 2, b.maxX - CAR.length / 2);
  v.z = clamp(v.z, b.minZ + CAR.length / 2, b.maxZ - CAR.length / 2);
  return v;
}

// ---------------------------------------------------------------- kursi
export function seatWorld(v, i) {
  const o = SEAT_OFFSETS[i];
  const f = forward(v.heading);
  const r = rightOf(v.heading);
  return { x: v.x + f.x * o.fwd + r.x * o.side, z: v.z + f.z * o.fwd + r.z * o.side, y: SEAT_HEIGHT, facing: wrapAngle(v.heading + Math.PI) };
}

/** Titik turun: ke sisi pintu kursi itu (kanan untuk kursi kanan, kiri untuk kursi kiri). */
export function exitPose(v, i, distance = 1.9) {
  const r = rightOf(v.heading);
  const side = Math.sign(SEAT_OFFSETS[i].side);
  const s = seatWorld(v, i);
  return { x: s.x + r.x * side * distance, z: s.z + r.z * side * distance };
}

/** Mobil terdekat (dalam jangkauan) yang punya kursi kosong; pengemudi dipilih dulu bila kosong. Mengembalikan { vehicle, seat } atau null. */
export function findBoardable(vehicles, pos, range = BOARD_RANGE) {
  let best = null;
  let bestD = range;
  for (const v of vehicles) {
    const d = Math.hypot(v.x - pos.x, v.z - pos.z);
    if (d > bestD) continue;
    const free = v.seats.findIndex((s) => s === null);
    if (free < 0) continue;
    best = { vehicle: v, seat: free };
    bestD = d;
  }
  return best;
}

export function boardVehicle(v, seat, playerId) {
  if (seat < 0 || seat >= v.seats.length || v.seats[seat] !== null) return false;
  if (v.seats.includes(playerId)) return false;
  v.seats[seat] = playerId;
  if (seat === 0) v.engine = true; // pengemudi naik = mesin hidup
  return true;
}

/** Turun: kursi dikosongkan; bila pengemudi turun mesin mati (mobil berhenti perlahan). Mengembalikan posisi turun. */
export function leaveVehicle(v, playerId) {
  const seat = v.seats.indexOf(playerId);
  if (seat < 0) return null;
  v.seats[seat] = null;
  if (seat === 0) v.engine = false;
  return { seat, ...exitPose(v, seat) };
}

export const driverOf = (v) => v.seats[0];
export const occupants = (v) => v.seats.filter((s) => s !== null);
