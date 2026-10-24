// Matematika murni penyambung jalan raya hotel dengan rute perjalanan (journey.js) di SATU dunia (tanpa THREE; diuji di hotel-journey-math.test.js).
//
// Rute perjalanan dibangun di bingkainya sendiri: mulai di (0, 0, 0), arah 0, maju = (sin h, cos h) (sama dengan vehicle.js).
// Di dunia hotel rute itu dipasang di gerbang jalan raya: titik awal rute = titik gerbang, lalu rute diputar sebesar psi = arah keluar gerbang.
// Putaran ini sama dengan THREE `rotation.y = psi`: titik lokal (lx, lz) -> dunia = gerbang + (lx cos psi + lz sin psi, -lx sin psi + lz cos psi).
// Jadi ujung jalan raya hotel dan awal rute menyambung tanpa putus dan tanpa pindah halaman; tikungan rute tidak berubah sedikit pun.
import { clamp, frameAt } from './journey.js';
import { ACCEL, BRAKE, stepDrive, targetSpeed } from './journey-drive.js';

export const LANE = 1.875; // lajur kiri rute (sama dengan journey-main.js)
export const START_BEHIND = 150; // mobil boleh mulai sampai sekian meter sebelum gerbang
export const START_AHEAD = 80; // ... dan sampai sekian meter sesudahnya
export const MAX_LATERAL = 30; // geseran samping terbesar dari sumbu jalan saat mulai
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Arah keluar gerbang sebagai heading (0 = +z, PI/2 = +x), sama dengan rotation.y rute di dunia. */
export const gatePsi = (gate) => Math.atan2(gate.dir.x, gate.dir.z);

export function localToWorld(gate, lx, lz) {
  const psi = gatePsi(gate);
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  return { x: gate.x + lx * c + lz * s, z: gate.z - lx * s + lz * c };
}

export function worldToLocal(gate, x, z) {
  const psi = gatePsi(gate);
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  const dx = x - gate.x;
  const dz = z - gate.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** Jarak searah keluar gerbang (s, negatif = masih di jalan raya hotel) dan geseran samping (lateral, + = kiri arah keluar). */
export function alongOf(gate, x, z) {
  const dx = x - gate.x;
  const dz = z - gate.z;
  const psi = gatePsi(gate);
  return { s: dx * gate.dir.x + dz * gate.dir.z, lateral: dx * Math.cos(psi) - dz * Math.sin(psi) };
}

/**
 * Pose mobil di lajur rute pada jarak s, dalam koordinat dunia hotel. s < 0 = ekstrapolasi lurus ke belakang (di atas jalan raya hotel),
 * supaya mobil yang berangkat sebelum gerbang tetap mengikuti garis yang sama. y = tinggi jalan rute (bingkai rute).
 */
export function poseAt(gate, j, s, lane = LANE) {
  let f;
  if (s < 0) {
    const f0 = frameAt(j, 0);
    f = { x: f0.x + Math.sin(f0.heading) * s, y: f0.y, z: f0.z + Math.cos(f0.heading) * s, heading: f0.heading, curvature: 0 };
  } else f = frameAt(j, s);
  const w = localToWorld(gate, f.x + Math.cos(f.heading) * lane, f.z - Math.sin(f.heading) * lane);
  return { x: w.x, z: w.z, y: f.y, heading: wrap(f.heading + gatePsi(gate)), curvature: f.curvature };
}

/** Sudut setir roda depan (rad) yang sesuai kelengkungan jalan; tanda sama dengan v.steer di vehicle.js (+ = kiri). */
export const rideSteer = (curvature, wheelBase = 2.7, max = 0.52) => clamp(Math.atan(wheelBase * curvature), -max, max);

/** Satu langkah autopilot; sebelum gerbang (s < 0) memakai kecepatan bagian pertama, lalu autopilot biasa (journey-drive.js). */
export function stepRide(j, st, dt) {
  if (st.s >= 0) return stepDrive(j, st, dt);
  const tv = targetSpeed(j, 0);
  st.v += clamp(tv - st.v, -BRAKE * dt, ACCEL * dt);
  st.s += st.v * dt;
  st.t += dt;
  st.arrived = false;
  return st;
}

/** Bolehkah mobil `car` berangkat dari gerbang ini? Mengembalikan { ok, s } atau { ok: false, reason }. */
export function startCheck(gate, car) {
  const a = alongOf(gate, car.x, car.z);
  if (Math.abs(a.lateral) > MAX_LATERAL) return { ok: false, reason: 'Arahkan mobil ke jalan di depan gerbang dulu.' };
  if (a.s < -START_BEHIND) return { ok: false, reason: 'Majukan mobil mendekati gerbang dulu.' };
  if (a.s > START_AHEAD) return { ok: false, reason: 'Mundurlah ke dekat gerbang untuk memulai perjalanan.' };
  if (Math.abs(wrap(car.heading - gatePsi(gate))) > 1.2) return { ok: false, reason: 'Hadapkan mobil ke arah gerbang dulu.' };
  return { ok: true, s: a.s };
}

/**
 * Bingkai villa (hotel-villa.js anchor) untuk villa di ujung rute `j` yang dipasang di `gate`.
 * Mobil tiba menghadap utara villa (-z lokal), titik ujung jalan ada di (0, fenceZ + gap) pada bingkai villa.
 * y0 = tinggi lantai villa terhadap jalan (pad): dunia perjalanan digeser vertikal supaya ujung jalan berada di y = 0.
 */
export function villaAnchor(gate, j, fenceZ, { gap, pad }) {
  const e = frameAt(j, j.length);
  const end = localToWorld(gate, e.x, e.z);
  const psi = wrap(e.heading + gatePsi(gate) + Math.PI);
  const lz = fenceZ + gap;
  return { ox: end.x - lz * Math.sin(psi), oz: end.z - lz * Math.cos(psi), psi, y0: pad };
}

/** Titik ujung rute (area penurunan) di dunia hotel. */
export function endPoint(gate, j) {
  const p = poseAt(gate, j, j.length, 0);
  return { x: p.x, z: p.z, heading: p.heading };
}

/** Bidang pemotong (bentuk THREE.Plane: titik dipertahankan bila nx*x + nz*z + c >= 0). beyond = sisi luar gerbang; behind = sisi hotel. */
export const planeBeyond = (g) => ({ nx: g.dir.x, nz: g.dir.z, c: -(g.dir.x * g.x + g.dir.z * g.z) });
export const planeBehind = (g) => ({ nx: -g.dir.x, nz: -g.dir.z, c: g.dir.x * g.x + g.dir.z * g.z });
