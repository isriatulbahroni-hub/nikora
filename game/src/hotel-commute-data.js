// Karyawan pulang-pergi ganti shift (data murni, tanpa THREE, diuji di hotel-commute-data.test.js). Gambar 3D: hotel-commute.js.
// Setiap karyawan datang sebelum shift mulai dan pulang sesudah shift selesai: dengan motor atau mobil (parkir di slot karyawan hotel-parking.js)
// atau dengan bus antar-jemput (berhenti di halte Lingkar NIKORA sisi utara), lalu berjalan kaki ke pintu karyawan di sisi utara menara dan
// sebaliknya. Semua deterministik dari jam (detik dalam sehari), jadi semua pemain melihat hal yang sama. Satuan meter, bingkai koordinat hotel.
//
// Sumber tunggal yang TIDAK diulang di sini: parkir motor dan keterisian statisnya (hotel-parking.js), lajur dan jalur Lingkar (hotel-life-data.js),
// shift dan daftar karyawan (hotel-staff.js, diberikan dari luar supaya modul ini tetap murni). Lajur dalam sisi utara (COMMUTE_LANE) dikosongkan
// dari lalu lintas biasa; kendaraan karyawan memakainya lalu berbelok ke parkir lewat jalan masuk di sisi utara tapak.
import { COMMUTE_LANE, LOOP, hash01, lanePath, laneOffset } from './hotel-life-data.js';
import { bikeSlots, occupancy } from './hotel-parking.js';

export const DAY = 86400;
const mod = (a) => ((a % DAY) + DAY) % DAY;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const lerpAngle = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
};

// ---------------------------------------------------------------- tempat
export const STAFF_DOOR = Object.freeze({ x: 14, z: 453 }); // pintu kecil di utara menara (di bawah kanopi, sisi timur pintu utama)
export const WALKWAY_Z = 452.3; // jalur jalan kaki di depan menara: di selatan slot parkir, di utara dinding, di antara tiang kanopi dan dinding
export const BUS_STOP = Object.freeze({ x: 40, lateral: 3.6, wait: 40 }); // halte di bahu jalan sisi utara Lingkar
export const BUS_RUNS = 4; // rit bus antar-jemput per pergantian shift
export const BIKE_FILL = 0.55; // sama dengan hotel-parking-world.js: keterisian statis parkir motor berkanopi (dijaga tes)
export const BIKE_SEED = 11;
export const LANE_Z = LOOP.cz - (LOOP.b - laneOffset(COMMUTE_LANE.lane)); // garis lajur dalam sisi utara (z), 339,625
const LANE = lanePath(COMMUTE_LANE.lane, COMMUTE_LANE.ccw);
const APPROACH = 280; // meter jalur Lingkar yang dilalui sebelum berbelok masuk
const AWAY = 280; // meter jalur Lingkar sesudah keluar sebelum menghilang
const BIKE_TOP_Z = 387.2; // lorong silang di utara slot motor
const CAR_TOP_Z = 386.2; // lorong silang di utara slot mobil
const BIKE_DRIVE_X = 145; // jalan masuk ke parkir motor (timur)
const CAR_DRIVE_X = 100; // jalan masuk ke parkir mobil
export const DRIVEWAYS = Object.freeze([
  Object.freeze({ id: 'motor', x: BIKE_DRIVE_X, from: 345, to: BIKE_TOP_Z + 1 }),
  Object.freeze({ id: 'car', x: CAR_DRIVE_X, from: 345, to: CAR_TOP_Z + 1 }),
]);

const uCache = new Map();
/** Jarak (u) pada lajur karyawan di titik sisi utara dengan x tertentu. */
function uAtX(x) {
  if (uCache.has(x)) return uCache.get(x);
  let best = 0;
  let bd = Infinity;
  for (let u = 0; u < LANE.length; u += 0.25) {
    const p = LANE.at(u);
    const d = Math.hypot(p.x - x, p.z - LANE_Z);
    if (d < bd) { bd = d; best = u; }
  }
  uCache.set(x, best);
  return best;
}

// ---------------------------------------------------------------- slot parkir karyawan
let bikeCache = null;
let carCache = null;
const bikeStall = (id, index, x, z, dir) => ({ id, index, kind: 'motor', x, z, aisleX: x + dir * 2.5, zTop: BIKE_TOP_Z, driveX: BIKE_DRIVE_X });
/**
 * Slot motor karyawan: slot berkanopi yang KOSONG pada keterisian statis hotel-parking-world.js (supaya tidak menimpa motor yang sudah digambar)
 * ditambah dua modul tambahan di lahan cadangan timurnya (x 128..143, 58 slot per baris), seluruhnya di dalam STAFF_BIKES.
 */
export function bikeStalls() {
  if (bikeCache) return bikeCache;
  const slots = bikeSlots();
  const occupied = occupancy(slots, BIKE_FILL, BIKE_SEED);
  const out = [];
  for (const s of slots) {
    if (occupied.has(s.id)) continue;
    out.push(bikeStall(s.id, out.length, s.x, s.z, Math.cos(s.heading) > 0 ? 1 : -1));
  }
  for (const xL of [128, 136]) {
    for (const dir of [1, -1]) {
      const xBack = dir > 0 ? xL : xL + 7; // baris timur: punggung di xL; baris barat: xL + 2 x 2 + 3
      for (let i = 0; i < 58; i++) out.push(bikeStall(`MX-${xL}-${dir > 0 ? 'T' : 'B'}-${String(i + 1).padStart(2, '0')}`, out.length, xBack + dir, 390 + (i + 0.5) * 0.9, dir));
    }
  }
  bikeCache = Object.freeze(out.map((s) => Object.freeze(s)));
  return bikeCache;
}

const CAR_ROWS = Object.freeze([{ x: 59, aisle: 64 }, { x: 69, aisle: 64 }, { x: 83, aisle: 88.5 }, { x: 94, aisle: 88.5 }]);
/** Slot mobil karyawan di lahan HOTEL_PARKING: dua blok di kiri dan kanan mobil armada hotel (x 52 dan 76), 23 slot per baris. */
export function carStalls() {
  if (carCache) return carCache;
  const out = [];
  CAR_ROWS.forEach((r, ri) => {
    for (let i = 0; i < 23; i++) out.push(Object.freeze({ id: `SC-${ri}-${String(i + 1).padStart(2, '0')}`, index: out.length, kind: 'car', x: r.x, z: 389.5 + 2.6 * i, aisleX: r.aisle, zTop: CAR_TOP_Z, driveX: CAR_DRIVE_X }));
  });
  carCache = Object.freeze(out);
  return carCache;
}

// ---------------------------------------------------------------- rute berwaktu (kendaraan)
const dedupe = (pts) => {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p.x - q.x, p.z - q.z) < 1e-6) {
      if (p.wait) q.wait = p.wait;
      continue;
    }
    out.push({ ...p });
  }
  return out;
};
/** Potong sudut tajam menjadi dua titik (belokan miring) supaya arah hadap berubah halus. */
function chamfer(pts, r) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z);
    const l2 = Math.hypot(c.x - b.x, c.z - b.z);
    const d1x = (b.x - a.x) / l1;
    const d1z = (b.z - a.z) / l1;
    const d2x = (c.x - b.x) / l2;
    const d2z = (c.z - b.z) / l2;
    if (d1x * d2x + d1z * d2z > 0.95 || b.wait) { out.push(b); continue; }
    const cut = Math.min(r, l1 * 0.45, l2 * 0.45);
    out.push({ x: b.x - d1x * cut, z: b.z - d1z * cut, v: b.v }, { x: b.x + d2x * cut, z: b.z + d2z * cut, v: b.v });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Rute berwaktu dari titik-titik { x, z, v (m/s di ruas yang dimulai titik ini), wait (detik berhenti di titik ini) }. at(t) = { x, z, heading, d }. */
function makeRoute(rawPts, { smoothCorners = true, r = 3.5 } = {}) {
  let pts = dedupe(rawPts);
  if (smoothCorners && pts.length > 2) pts = chamfer(pts, r);
  const segs = [];
  let t = 0;
  let d = 0;
  let lastH = 0;
  let stopT = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const dur = len / (a.v || 5);
    lastH = Math.atan2(dx, dz);
    segs.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, len, t0: t, dur, d0: d, h: lastH });
    t += dur;
    d += len;
    if (b.wait) {
      stopT = t;
      segs.push({ x0: b.x, z0: b.z, x1: b.x, z1: b.z, len: 0, t0: t, dur: b.wait, d0: d, h: lastH });
      t += b.wait;
    }
  }
  const duration = t;
  const length = d;
  return {
    duration, length, stopT, startH: segs.length ? segs[0].h : 0, endH: lastH,
    at(time, out = {}) {
      const tt = clamp(time, 0, duration);
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].t0 <= tt) lo = mid;
        else hi = mid - 1;
      }
      const s = segs[lo];
      const f = s.dur > 0 ? Math.min(1, (tt - s.t0) / s.dur) : 1;
      out.x = s.x0 + (s.x1 - s.x0) * f;
      out.z = s.z0 + (s.z1 - s.z0) * f;
      out.heading = s.h;
      out.d = s.d0 + s.len * f;
      return out;
    },
  };
}

const SPEED = Object.freeze({ car: { lane: 14, lot: 7 }, motor: { lane: 15, lot: 6 } });
const routeCache = new Map();
/** Rute masuk (Lingkar -> jalan masuk -> lorong -> slot) atau keluar (kebalikannya, lalu terus di Lingkar) untuk satu slot. */
export function stallRoute(stall, dir) {
  const key = `${stall.id}:${dir}`;
  let route = routeCache.get(key);
  if (route) return route;
  const sp = SPEED[stall.kind];
  const uEnt = uAtX(stall.driveX);
  const pts = [];
  if (dir === 'in') {
    for (let u = uEnt - APPROACH; u < uEnt; u += 8) { const p = LANE.at(u); pts.push({ x: p.x, z: p.z, v: sp.lane }); }
    pts.push({ x: stall.driveX, z: LANE_Z, v: sp.lot + 3 }, { x: stall.driveX, z: stall.zTop, v: sp.lot }, { x: stall.aisleX, z: stall.zTop, v: sp.lot }, { x: stall.aisleX, z: stall.z, v: sp.lot * 0.8 }, { x: stall.x, z: stall.z, v: sp.lot * 0.6 });
  } else {
    pts.push({ x: stall.x, z: stall.z, v: sp.lot * 0.5 }, { x: stall.aisleX, z: stall.z, v: sp.lot * 0.8 }, { x: stall.aisleX, z: stall.zTop, v: sp.lot }, { x: stall.driveX, z: stall.zTop, v: sp.lot }, { x: stall.driveX, z: LANE_Z, v: sp.lane * 0.7 });
    for (let u = uEnt + 8; u <= uEnt + AWAY; u += 8) { const p = LANE.at(u); pts.push({ x: p.x, z: p.z, v: sp.lane }); }
  }
  route = makeRoute(pts);
  routeCache.set(key, route);
  return route;
}

let busCache = null;
/** Rute bus antar-jemput: menyusuri lajur karyawan, bergeser ke bahu jalan di halte, berhenti BUS_STOP.wait detik, lalu kembali ke lajur. */
export function busRoute() {
  if (busCache) return busCache;
  const uStop = uAtX(BUS_STOP.x);
  const pts = [];
  for (let u = uStop - APPROACH; u <= uStop + AWAY; u += 6) {
    const p = LANE.at(u);
    const straight = Math.abs(p.z - LANE_Z) < 0.5;
    const lat = straight ? BUS_STOP.lateral * smooth((BUS_STOP.x + 45 - p.x) / 37) * (1 - smooth((BUS_STOP.x - 8 - p.x) / 37)) : 0;
    pts.push({ x: p.x + Math.cos(p.heading) * lat, z: p.z - Math.sin(p.heading) * lat, v: straight && Math.abs(p.x - BUS_STOP.x) < 40 ? 7 : 12 });
  }
  let k = 0;
  let bd = Infinity;
  pts.forEach((p, i) => {
    const d = Math.abs(p.x - BUS_STOP.x) + Math.abs(p.z - (LANE_Z + BUS_STOP.lateral));
    if (d < bd) { bd = d; k = i; }
  });
  pts[k] = { x: BUS_STOP.x, z: LANE_Z + BUS_STOP.lateral, v: 7, wait: BUS_STOP.wait };
  busCache = makeRoute(pts, { smoothCorners: false });
  return busCache;
}

// ---------------------------------------------------------------- rute jalan kaki
function makeWalk(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return Object.freeze({ pts, cum, length: cum[cum.length - 1] });
}
/** Posisi pada rute jalan kaki sejauh d meter dari awal (reverse: dari ujung, menghadap ke arah sebaliknya). */
export function walkAt(route, d, out = {}, reverse = false) {
  const L = route.length;
  const dd = clamp(reverse ? L - d : d, 0, L);
  let lo = 0;
  let hi = route.pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (route.cum[mid] <= dd) lo = mid;
    else hi = mid - 1;
  }
  const a = route.pts[lo];
  const b = route.pts[lo + 1];
  const len = route.cum[lo + 1] - route.cum[lo];
  const f = len > 0 ? (dd - route.cum[lo]) / len : 1;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.heading = Math.atan2(b.x - a.x, b.z - a.z) + (reverse ? Math.PI : 0);
  return out;
}
/** Jalan kaki dari slot ke pintu karyawan: ke lorong, menyusuri lorong ke selatan sampai jalur depan menara, lalu ke barat ke pintu. */
const stallWalk = (st, j) => makeWalk([{ x: st.x, z: st.z }, { x: st.aisleX, z: st.z }, { x: st.aisleX, z: WALKWAY_Z + j * 0.4 }, { x: STAFF_DOOR.x, z: WALKWAY_Z + j * 0.4 }, { x: STAFF_DOOR.x, z: STAFF_DOOR.z }]);
/** Jalan kaki dari halte bus ke pintu karyawan: menyeberangi bahu jalan, lalu ke selatan menyusuri tepi timur halaman drop-off. */
const busWalk = (j) => makeWalk([{ x: BUS_STOP.x + j * 3, z: LANE_Z + BUS_STOP.lateral + 2.4 }, { x: 34.5 + j, z: 352 }, { x: 31.6 + j, z: 360 }, { x: 31.6 + j, z: WALKWAY_Z + j * 0.4 }, { x: STAFF_DOOR.x, z: WALKWAY_Z + j * 0.4 }, { x: STAFF_DOOR.x, z: STAFF_DOOR.z }]);

// ---------------------------------------------------------------- dunia komuter
const BUS_COLOR = 0xc9a24b;
const MOTOR_COLORS = Object.freeze([0x222428, 0x3a3d44, 0xb3262c, 0x1f4fa8, 0xe7e7e7]);
const CAR_COLORS = Object.freeze([0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0xe9e1cf]);

/**
 * Susun rencana pulang-pergi semua karyawan. `staff` = [{ id, shift, ... }] (urutan = urutan roster), `shifts` = [{ from, to }] jam permainan.
 * Moda: motor 55%, mobil 15%, sisanya bus antar-jemput; slot satu per orang dan tidak pernah dipakai bersama (tiap shift punya jatah slot sendiri
 * = tiap slot ke-(k mod jumlah shift)), jadi tidak ada dua kendaraan di satu slot walau dua shift bersilangan di pergantian. Bila jatah penuh,
 * sisanya naik bus.
 */
export function createCommuteWorld(staff, shifts) {
  const S = shifts.length;
  const bikes = bikeStalls();
  const cars = carStalls();
  const pool = { motor: Array.from({ length: S }, () => []), car: Array.from({ length: S }, () => []) };
  bikes.forEach((st, k) => pool.motor[k % S].push(st));
  cars.forEach((st, k) => pool.car[k % S].push(st));
  const used = { motor: Array(S).fill(0), car: Array(S).fill(0) };
  const bus = busRoute();
  const commuters = [];
  staff.forEach((member, i) => {
    const sh = member.shift % S;
    const start = shifts[sh].from * 3600;
    const end = shifts[sh].to * 3600;
    const h = hash01(i * 3 + 11);
    let mode = h < 0.55 ? 'motor' : h < 0.7 ? 'car' : 'bus';
    let stall = null;
    if (mode !== 'bus') {
      const list = pool[mode][sh];
      if (used[mode][sh] < list.length) stall = list[used[mode][sh]++];
      else mode = 'bus';
    }
    const vW = 1.25 + 0.3 * hash01(i * 23 + 9);
    const jit = hash01(i * 29 + 3) * 2 - 1;
    const c = { id: member.id, staff: member, index: i, shift: sh, mode, stall, vW, jit, color: mode === 'car' ? CAR_COLORS[i % CAR_COLORS.length] : MOTOR_COLORS[i % MOTOR_COLORS.length], walk: null, inRoute: null, outRoute: null, parkedHeading: 0, w: {} };
    if (stall) {
      c.inRoute = stallRoute(stall, 'in');
      c.outRoute = stallRoute(stall, 'out');
      c.parkedHeading = c.inRoute.endH;
      c.walk = stallWalk(stall, jit);
      const wk = c.walk.length / vW;
      const tPark = mod(start - (6 + 30 * hash01(i * 5 + 3)) * 60);
      const tExit = mod(end + (4 + 30 * hash01(i * 7 + 5)) * 60);
      const tOut = tExit + wk + 3;
      c.w = { drive_in: [mod(tPark - c.inRoute.duration), c.inRoute.duration], walk_in: [mod(tPark + 3), wk], parked: [tPark, mod(tOut - tPark)], walk_out: [tExit, wk], drive_out: [mod(tOut), c.outRoute.duration] };
    } else {
      c.walk = busWalk(jit);
      const wk = c.walk.length / vW;
      const rIn = Math.min(BUS_RUNS - 1, Math.floor(BUS_RUNS * hash01(i * 11 + 7)));
      const rOut = Math.min(BUS_RUNS - 1, Math.floor(BUS_RUNS * hash01(i * 17 + 3)));
      const tDis = mod(start - (40 - 9 * rIn) * 60) + 3 + 20 * hash01(i * 13 + 1);
      const tBoard = mod(end + (8 + 9 * rOut) * 60) + 5 + 25 * hash01(i * 19 + 2);
      c.w = { walk_in: [mod(tDis), wk], walk_out: [mod(tBoard - wk), wk] };
    }
    commuters.push(c);
  });
  const buses = [];
  shifts.forEach((sh, si) => {
    for (let r = 0; r < BUS_RUNS; r++) {
      buses.push({ id: `bus-in-${si}-${r}`, t0: mod(mod(sh.from * 3600 - (40 - 9 * r) * 60) - bus.stopT) });
      buses.push({ id: `bus-out-${si}-${r}`, t0: mod(mod(sh.to * 3600 + (8 + 9 * r) * 60) - bus.stopT) });
    }
  });
  return { commuters, buses, bikes, cars, busRoute: bus };
}

/** Rincian untuk papan admin dan tes: jumlah orang per moda. */
export function commuteStats(world) {
  const modes = { motor: 0, car: 0, bus: 0 };
  for (const c of world.commuters) modes[c.mode]++;
  return { people: world.commuters.length, modes, busRuns: world.buses.length, bikeStalls: world.bikes.length, carStalls: world.cars.length };
}

/** Penampung hasil cuplikan (dipakai ulang tiap frame): kendaraan yang berjalan, pejalan kaki, dan kendaraan yang sedang parkir per slot. */
export function createSampleBuffer(world) {
  return { vehicles: [], walkers: [], parkedMotor: new Uint8Array(world.bikes.length), parkedCar: new Uint8Array(world.cars.length) };
}

const inWin = (s, w) => {
  const p = mod(s - w[0]);
  return p < w[1] ? p : -1;
};
const FADE = 35; // meter: kendaraan muncul dan hilang halus di ujung rute Lingkar
const tmp = {};

/** Cuplik keadaan pada `seconds` (detik dalam sehari; boleh pecahan). Mengisi `out` (createSampleBuffer). */
export function sampleCommute(world, seconds, out) {
  const s = mod(seconds);
  out.vehicles.length = 0;
  out.walkers.length = 0;
  out.parkedMotor.fill(0);
  out.parkedCar.fill(0);
  const walker = (c, p, reverse) => {
    walkAt(c.walk, p * c.vW, tmp, reverse);
    out.walkers.push({ id: c.id, staff: c.staff, x: tmp.x, z: tmp.z, heading: tmp.heading, speed: c.vW });
  };
  for (const c of world.commuters) {
    let p = inWin(s, c.w.walk_in);
    if (p >= 0) walker(c, p, false);
    p = inWin(s, c.w.walk_out);
    if (p >= 0) walker(c, p, true);
    if (c.mode === 'bus') continue;
    p = inWin(s, c.w.drive_in);
    if (p >= 0) {
      c.inRoute.at(p, tmp);
      out.vehicles.push({ id: c.id, kind: c.mode, x: tmp.x, z: tmp.z, heading: tmp.heading, scale: smooth(tmp.d / FADE), color: c.color });
    }
    p = inWin(s, c.w.drive_out);
    if (p >= 0) {
      c.outRoute.at(p, tmp);
      out.vehicles.push({ id: c.id, kind: c.mode, x: tmp.x, z: tmp.z, heading: lerpAngle(c.parkedHeading, tmp.heading, smooth(tmp.d / 3.5)), scale: smooth((c.outRoute.length - tmp.d) / FADE), color: c.color });
    }
    if (inWin(s, c.w.parked) >= 0) (c.mode === 'car' ? out.parkedCar : out.parkedMotor)[c.stall.index] = 1;
  }
  for (const b of world.buses) {
    const p = inWin(s, [b.t0, world.busRoute.duration]);
    if (p < 0) continue;
    world.busRoute.at(p, tmp);
    out.vehicles.push({ id: b.id, kind: 'bus', x: tmp.x, z: tmp.z, heading: tmp.heading, scale: smooth(tmp.d / FADE) * smooth((world.busRoute.length - tmp.d) / FADE), color: BUS_COLOR });
  }
  return out;
}
