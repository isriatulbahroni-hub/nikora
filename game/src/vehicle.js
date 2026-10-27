// Mobil yang bisa dikendarai (murni data + matematika, tanpa THREE). Dipakai klien untuk fisika & kursi.
//
// Konvensi arah = model mobil di villa-props.js (depan = +z) dan rotation.y di THREE:
//   heading 0 -> melaju ke selatan (+z), heading PI -> utara (-z), PI/2 -> timur (+x).
//   maju = (sin h, cos h); kanan mobil = (-cos h, sin h). Lalu lintas jalan di sisi kiri, setir di kanan.
//   Arah hadap avatar yang duduk di mobil (konvensi avatar facing = atan2(-dx,-dz)) = heading + PI.
import { resolveMove, WORLD_LIMIT } from './villa-layout.js';
import { surfaceAt as defaultSurface } from './hotel-layout.js';
import { modelOf } from './car-models.js';
import { TYRE, gripLimit, limitYaw, longSlip, stepTyreTemp } from './tyre-model.js';

export const CAR = Object.freeze({
  length: 4.3, width: 1.82, wheelBase: 2.7,
  maxSpeed: 26, // m/s ~ 94 km/j
  reverseMax: 5, accel: 7.5, brake: 16, maxSteer: 0.52, steerRate: 3.2,
  circleRadius: 1.05, circleOffset: 1.05, // dua lingkaran tabrakan di sumbu depan/belakang
  seats: 4,
});
export const SURFACE_CAP = Object.freeze({ road: 26, compound: 8, ground: 10 });
// Penanda tambahan "ini aspal" untuk jalan yang tidak dikenal surfaceAt() bawaan hotel: lorong perjalanan (hotel-journey.js) dipasang di luar
// jalan raya hotel, jadi tanpa ini mobil di sana dianggap di tanah (batas 10 m/s = 36 km/jam). fn(x, z) -> boolean; null = tidak ada.
let roadProbe = null;
export const setRoadProbe = (fn) => { roadProbe = typeof fn === 'function' ? fn : null; };
// Posisi kursi dalam bingkai mobil: fwd (+ ke depan), side (+ ke kanan). Kursi 0 = pengemudi (kanan depan).
export const SEAT_OFFSETS = Object.freeze([
  { fwd: 0.45, side: 0.46 }, { fwd: 0.45, side: -0.46 }, { fwd: -0.7, side: 0.46 }, { fwd: -0.7, side: -0.46 },
]);
export const SEAT_HEIGHT = 0.35; // avatar duduk sedikit di atas tanah
export const BOARD_RANGE = 3.2;
export const DRAG_K = 0.012; // hambatan udara bawaan (m/s^2 per (m/s)^2); model cepat boleh memakai dragK sendiri
export const GRIP_STEER_MARGIN = 0.9; // model cepat: sudut setir dibatasi agar percepatan samping paling banyak 90% batas cengkeraman ban

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const forward = (h) => ({ x: Math.sin(h), z: Math.cos(h) });
export const rightOf = (h) => ({ x: -Math.cos(h), z: Math.sin(h) });
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Spesifikasi fisika/kursi sebuah mobil: model mewah (car-models.js) atau CAR bawaan (sedan lama). */
export function specOf(model) {
  const m = typeof model === 'string' ? modelOf(model) : model;
  if (!m) return { ...CAR, model: null, seatOffsets: SEAT_OFFSETS, seatLift: 0, seatCount: CAR.seats };
  return { ...CAR, ...m, model: m.id, seatOffsets: m.seats, seatLift: m.seatLift ?? 0, seatCount: m.seats.length };
}

export function createVehicle({ id, x = 0, z = 0, heading = 0, color = 0xf2f2f0, model = null }) {
  const spec = specOf(model);
  const paint = spec.model && spec.paint != null && color === 0xf2f2f0 ? spec.paint : color;
  return { id, x, z, heading, speed: 0, steer: 0, engine: false, color: paint, model: spec.model, spec, seats: Array(spec.seatCount).fill(null), hit: 0, braking: false, throttle: 0, slip: 0, tyreTemp: TYRE.ambient };
}

/**
 * Satu langkah fisika. input = { throttle: -1..1, steer: -1..1 (kanan positif), brake?: bool }.
 * throttle bersifat ANALOG: 0,5 = setengah gas (percepatan dikali throttle), jadi gas bisa diatur dari pedal layar (car-hud.js).
 * env = { colliders, surfaceAt, limit? } (limit = batas dunia; bawaan WORLD_LIMIT villa, hotel memakai HIGHWAY_LIMIT). Mengubah dan mengembalikan `v`. v.hit = kekuatan benturan langkah ini (0 = tidak ada).
 * Opsi spesifikasi model: accelFade (0..1, percepatan menyusut mendekati kecepatan puncak), dragK (hambatan udara), dan powerW + mass
 * (model bertenaga: percepatan dibatasi daya mesin P/(m v), dikurangi hambatan udara). Tanpa opsi ini fisikanya sama seperti semula.
 * Model cepat (punya powerW atau accelFade, yaitu NIKORA W16 dan Bugatti Chiron): sudut setir juga dibatasi cengkeraman ban (GRIP_STEER_MARGIN),
 * jadi setir penuh di kecepatan tinggi tidak lagi melewati batas ban dan memotong laju lewat selip.
 */
export function stepVehicle(v, input, dt, env = {}) {
  const C = v.spec ?? CAR;
  let surface = (env.surfaceAt ?? defaultSurface)(v.x, v.z);
  if (surface !== 'road' && roadProbe && roadProbe(v.x, v.z)) surface = 'road';
  const cap = surface === 'road' ? C.maxSpeed : (SURFACE_CAP[surface] ?? SURFACE_CAP.ground);
  const speed0 = v.speed;
  const throttle = v.engine ? clamp(input.throttle ?? 0, -1, 1) : 0;
  const brake = Boolean(input.brake) || !v.engine && Math.abs(v.speed) > 0;
  v.throttle = throttle;
  v.braking = brake || (throttle < 0 && v.speed > 0.3);

  // gas / rem / mundur
  if (brake) {
    v.speed = Math.abs(v.speed) <= C.brake * dt ? 0 : v.speed - Math.sign(v.speed) * C.brake * dt;
  } else if (throttle > 0) {
    const fade = C.accelFade ? 1 - C.accelFade * Math.min(1, (Math.max(0, v.speed) / C.maxSpeed) ** 2) : 1; // tenaga makin sulit menambah laju di kecepatan tinggi
    if (v.speed < 0) {
      v.speed += C.brake * throttle * dt;
    } else if (C.powerW) {
      // model bertenaga (Bugatti Chiron): percepatan = yang lebih kecil dari batas awal dan daya/(massa x kecepatan), dikurangi hambatan udara
      const pull = Math.min(C.accel * fade, C.powerW / (C.mass * Math.max(v.speed, 1)));
      v.speed += (pull - C.dragK * v.speed * v.speed) * throttle * dt;
    } else {
      v.speed += C.accel * fade * throttle * dt;
    }
  } else if (throttle < 0) {
    v.speed -= (v.speed > 0.3 ? C.brake : C.accel * 0.6) * -throttle * dt;
  }
  // hambatan: gesekan + udara
  if (throttle === 0 && !brake) {
    const drag = (0.9 + (C.dragK ?? DRAG_K) * v.speed * v.speed) * dt;
    v.speed = Math.abs(v.speed) <= drag ? 0 : v.speed - Math.sign(v.speed) * drag;
  }
  v.speed = clamp(v.speed, -C.reverseMax, C.maxSpeed);
  if (v.speed > cap) v.speed = Math.max(cap, v.speed - 14 * dt); // di tanah/halaman villa pelan-pelan melambat
  if (v.speed < -cap) v.speed = Math.min(-cap, v.speed + 14 * dt);

  // setir: makin cepat makin sempit sudutnya
  const limit = gripLimit(v.tyreTemp ?? TYRE.ambient, surface, C.grip ?? 1);
  let lock = C.maxSteer * (1 - 0.6 * Math.min(1, Math.abs(v.speed) / C.maxSpeed));
  if (C.powerW !== undefined || C.accelFade !== undefined) {
    // model cepat: sudut yang menghasilkan percepatan samping = 90% batas ban (a = v^2 tan(s) / wheelBase), supaya setir penuh tidak membuat selip yang memotong laju
    lock = Math.min(lock, Math.atan((C.wheelBase * GRIP_STEER_MARGIN * limit) / Math.max(v.speed * v.speed, 1)));
  }
  const target = clamp(input.steer ?? 0, -1, 1) * lock;
  const dSteer = clamp(target - v.steer, -C.steerRate * dt, C.steerRate * dt);
  v.steer += dSteer;

  // grip ban: yaw rate dibatasi percepatan samping yang masih bisa ditahan ban (understeer + selip), dibawa lingkaran gesek
  const aLong = dt > 0 && (throttle !== 0 || brake) ? (v.speed - speed0) / dt : 0; // hambatan udara/gesekan bukan gaya ban
  const wantedYaw = (v.speed / C.wheelBase) * Math.tan(v.steer);
  const lim = limitYaw({ speed: v.speed, wantedYaw, aLong, limit });
  v.slip = Math.max(lim.slip, longSlip(aLong, limit));
  if (lim.slip > 0) v.speed -= Math.sign(v.speed) * lim.slip * 6 * dt; // menyelip mengikis laju
  v.tyreTemp = stepTyreTemp(v.tyreTemp ?? TYRE.ambient, { slip: v.slip, speed: v.speed, dt });

  // gerak (sepeda kinematik: pusat = sumbu belakang+setengah wheelBase, disederhanakan ke pusat mobil)
  v.heading = wrapAngle(v.heading + lim.yawRate * dt);
  const f = forward(v.heading);
  v.x += f.x * v.speed * dt;
  v.z += f.z * v.speed * dt;

  // tabrakan: dua lingkaran melawan kotak penghalang
  v.hit = 0;
  const colliders = env.colliders ?? [];
  if (colliders.length) {
    let ox = 0;
    let oz = 0;
    for (const s of [C.circleOffset, -C.circleOffset]) {
      const p = { x: v.x + f.x * s, z: v.z + f.z * s };
      const q = resolveMove(p, C.circleRadius, colliders, env.limit ?? WORLD_LIMIT);
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
  const b = env.limit ?? WORLD_LIMIT;
  v.x = clamp(v.x, b.minX + C.length / 2, b.maxX - C.length / 2);
  v.z = clamp(v.z, b.minZ + C.length / 2, b.maxZ - C.length / 2);
  return v;
}

// ---------------------------------------------------------------- kursi
const offsetsOf = (v) => v.spec?.seatOffsets ?? SEAT_OFFSETS;

export function seatWorld(v, i) {
  const o = offsetsOf(v)[i];
  const f = forward(v.heading);
  const r = rightOf(v.heading);
  return { x: v.x + f.x * o.fwd + r.x * o.side, z: v.z + f.z * o.fwd + r.z * o.side, y: SEAT_HEIGHT, facing: wrapAngle(v.heading + Math.PI) };
}

/** Titik turun: ke sisi pintu kursi itu (kanan untuk kursi kanan, kiri untuk kursi kiri). */
export function exitPose(v, i, distance = 1.9) {
  const r = rightOf(v.heading);
  const side = Math.sign(offsetsOf(v)[i].side);
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
