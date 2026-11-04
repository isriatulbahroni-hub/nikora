// Fisika lalu lintas hotel (murni, tanpa THREE; diuji di hotel-traffic-sim.test.js). Gambar 3D: hotel-life.js. Suara: hotel-traffic-audio.js.
// Kendaraan Lingkar NIKORA sudah tampil utuh dan bisa menabrak pejalan kaki (hotel-life-data.js: hitVehicle). Modul ini menambah badan nyata
// terhadap MOBIL PEMAIN yang dikemudikan, dan membuat kendaraan bereaksi:
//  - badan berarah per jenis (shapesFrom); mobil pemain (dua lingkaran, vehicle.js) didorong keluar dari badan itu dan kehilangan laju menurut massa,
//  - kendaraan mengerem untuk mobil pemain yang ada di depannya dan untuk kendaraan di depannya (tidak saling menembus),
//  - ditabrak = berhenti sebentar, badan miring (kick), motor roboh; dihalangi lama = membunyikan klakson.
// Posisi dihitung dari jarak tempuh u di jalur lajur (lanePath di hotel-life-data.js), bukan lagi dari jam: kendaraan bisa berhenti lalu jalan lagi.
// Jalur, kendaraan, dan ukuran badan diberikan dari luar (laneAt, specs, VEHICLE_HITBOX di hotel-life-data.js) supaya modul ini tetap murni
// dan ukuran badan hanya punya satu sumber (sama dengan uji tabrakan pejalan kaki, hitVehicle).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (a, n) => ((a % n) + n) % n;

/** Massa relatif tiap jenis: bagian laju mobil penabrak yang hilang saat menabrak (motor ringan, bus dan truk berat). */
export const MASS = Object.freeze({ car: 0.45, motor: 0.12, bus: 0.8, truck: 0.85 });

/**
 * Bentuk badan tiap jenis dari kotak tabrak hotel-life-data.js (VEHICLE_HITBOX: front, back, half): halfL = setengah panjang,
 * halfW = setengah lebar, off = pusat badan terhadap titik jalur (+ ke depan), mass = MASS.
 */
export function shapesFrom(hitbox) {
  const out = {};
  for (const [kind, b] of Object.entries(hitbox)) out[kind] = Object.freeze({ halfL: (b.front + b.back) / 2, halfW: b.half, off: (b.front - b.back) / 2, mass: MASS[kind] ?? MASS.car });
  return Object.freeze(out);
}

const ACCEL = Object.freeze({ car: 3.6, motor: 5, bus: 1.8, truck: 2.2 }); // m/s^2 menambah laju
const BRAKE = 8; // m/s^2 pengereman biasa
const STOP_DECEL = 22; // m/s^2 berhenti mendadak sesudah ditabrak
const COMFORT = 5; // m/s^2 pengereman nyaman: dasar kecepatan aman menuju halangan
const MIN_GAP = 2.5; // m jarak berhenti dari halangan
export const MIN_IMPACT = 0.6; // m/s: di bawah ini hanya didorong, tidak dihitung tabrakan
export const STUN = Object.freeze({ base: 1.2, perMs: 0.18, max: 4.5, fall: 3.6 }); // detik berhenti sesudah ditabrak; fall = motor roboh
export const HONK_AFTER = 1.6; // detik dihalangi sebelum membunyikan klakson
const HONK_EVERY = 6; // detik antar klakson satu kendaraan
const BUMP_COOLDOWN = 0.35; // detik antar tabrakan yang dihitung pada kendaraan yang sama

/** Kecepatan aman (m/s) agar bisa berhenti MIN_GAP sebelum halangan yang berjarak `gap` (jarak badan ke badan). */
export const safeSpeed = (gap) => Math.sqrt(2 * COMFORT * Math.max(0, gap - MIN_GAP));

// ---------------------------------------------------------------- bentuk
/** Kotak berarah: pusat (x, z), sumbu depan (fx, fz) dan sumbu samping (sx, sz), setengah panjang dan lebar. Arah mengikuti vehicle.js: maju = (sin h, cos h). */
export const makeObb = () => ({ x: 0, z: 0, fx: 0, fz: 1, sx: 1, sz: 0, halfL: 1, halfW: 1 });

export function fillObb(o, shape, x, z, heading, grow = 0) {
  o.fx = Math.sin(heading);
  o.fz = Math.cos(heading);
  o.sx = Math.cos(heading);
  o.sz = -Math.sin(heading);
  o.x = x + o.fx * shape.off;
  o.z = z + o.fz * shape.off;
  o.halfL = shape.halfL + grow;
  o.halfW = shape.halfW + grow;
  return o;
}

export const obbOf = (shape, x, z, heading, grow = 0) => fillObb(makeObb(), shape, x, z, heading, grow);

/**
 * Lingkaran (cx, cz, r) melawan kotak berarah. Tidak menyentuh = null; menyentuh = { depth, nx, nz }:
 * nx, nz = arah dorong lingkaran keluar dari kotak (satuan), depth = seberapa dalam.
 */
export function circleVsObb(cx, cz, r, o) {
  const dx = cx - o.x;
  const dz = cz - o.z;
  const lf = dx * o.fx + dz * o.fz;
  const ls = dx * o.sx + dz * o.sz;
  const pf = lf - clamp(lf, -o.halfL, o.halfL);
  const ps = ls - clamp(ls, -o.halfW, o.halfW);
  const d2 = pf * pf + ps * ps;
  if (d2 >= r * r) return null;
  let nf;
  let ns;
  let depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nf = pf / d;
    ns = ps / d;
    depth = r - d;
  } else {
    // pusat lingkaran di dalam kotak: dorong lewat sisi terdekat
    const overF = o.halfL - Math.abs(lf);
    const overS = o.halfW - Math.abs(ls);
    if (overF < overS) {
      nf = lf >= 0 ? 1 : -1;
      ns = 0;
      depth = r + overF;
    } else {
      nf = 0;
      ns = ls >= 0 ? 1 : -1;
      depth = r + overS;
    }
  }
  return { depth, nx: nf * o.fx + ns * o.sx, nz: nf * o.fz + ns * o.sz };
}

/** Penghalang bagi kendaraan lalu lintas: mobil pemain (kotak sebesar mobilnya) atau pejalan kaki (kotak kecil). */
export function carObstacle(car) {
  const C = car.spec ?? {};
  return { x: car.x, z: car.z, fx: Math.sin(car.heading), fz: Math.cos(car.heading), sx: Math.cos(car.heading), sz: -Math.sin(car.heading), halfL: (C.length ?? 4.3) / 2, halfW: (C.width ?? 1.82) / 2 };
}
export const walkerObstacle = (p, r = 0.4) => ({ x: p.x, z: p.z, fx: 0, fz: 1, sx: 1, sz: 0, halfL: r, halfW: r });

// ---------------------------------------------------------------- tabrakan dengan pemain
/**
 * Mobil pemain (vehicle.js: x, z, heading, speed, spec dengan circleRadius dan circleOffset) melawan semua badan kendaraan.
 * Mobil pemain DIGESER keluar dari tiap badan yang ditembus. Mengembalikan daftar { body, strength (laju mendekat, m/s), nx, nz, depth, side }.
 */
export function collideDrivenCar(car, bodies) {
  const C = car.spec ?? {};
  const r = C.circleRadius ?? 1.05;
  const off = C.circleOffset ?? 1.05;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const hits = [];
  for (const b of bodies) {
    const o = b.obb;
    const reach = Math.hypot(o.halfL, o.halfW) + off + r;
    if (Math.abs(car.x - o.x) > reach || Math.abs(car.z - o.z) > reach) continue;
    let depth = 0;
    let nx = 0;
    let nz = 0;
    for (const s of [off, -off]) {
      const c = circleVsObb(car.x + fx * s, car.z + fz * s, r, o);
      if (c && c.depth > depth) ({ depth, nx, nz } = c);
    }
    if (depth <= 0) continue;
    car.x += nx * depth;
    car.z += nz * depth;
    const closing = -((car.speed * fx - b.vx) * nx + (car.speed * fz - b.vz) * nz);
    hits.push({ body: b, strength: Math.max(0, closing), nx, nz, depth, side: Math.sign(fx * nz - fz * nx) || 1 });
  }
  return hits;
}

/** Akibat tabrakan pada mobil pemain: laju berkurang menurut massa kendaraan yang ditabrak. onBump(hit) dipanggil per tabrakan nyata. Mengembalikan kekuatan terbesar (untuk car.hit). */
export function resolveCarHits(car, hits, onBump = () => {}) {
  let strength = 0;
  for (const h of hits) {
    if (h.strength < MIN_IMPACT) continue;
    car.speed *= 1 - h.body.shape.mass * 0.85;
    onBump(h);
    strength = Math.max(strength, h.strength);
  }
  return strength;
}

/** Pejalan kaki (p: x, z) didorong keluar dari badan kendaraan. Mengembalikan daftar { body, strength (laju kendaraan, m/s), nx, nz }. */
export function collideWalker(p, bodies, r = 0.4) {
  const hits = [];
  for (const b of bodies) {
    const o = b.obb;
    const reach = Math.hypot(o.halfL, o.halfW) + r;
    if (Math.abs(p.x - o.x) > reach || Math.abs(p.z - o.z) > reach) continue;
    const c = circleVsObb(p.x, p.z, r, o);
    if (!c) continue;
    p.x += c.nx * c.depth;
    p.z += c.nz * c.depth;
    hits.push({ body: b, strength: Math.hypot(b.vx, b.vz), nx: c.nx, nz: c.nz });
  }
  return hits;
}

// ---------------------------------------------------------------- simulasi
/**
 * specs = [{ id, kind, lane, ccw, speed, u0, color }] (mixedTrafficSpecs); laneAt(lane, ccw) = jalur { length, at(u) -> { x, z, heading } };
 * hitbox = VEHICLE_HITBOX (hotel-life-data.js).
 * Mengembalikan { vehicles, step(dt, obstacles), bump(v, strength, side) }. Tiap kendaraan: id, kind, x, z, heading, roll (rad, motor roboh), v (m/s), vx, vz, obb, shape.
 */
export function createTrafficSim(specs, laneAt, hitbox) {
  const shapes = shapesFrom(hitbox);
  const paths = new Map();
  const pathOf = (lane, ccw) => {
    const key = `${lane}${ccw ? 'l' : 'r'}`;
    let p = paths.get(key);
    if (!p) {
      p = laneAt(lane, ccw);
      paths.set(key, p);
    }
    return p;
  };
  const place = (v) => {
    const p = v.path.at(v.u);
    v.x = p.x;
    v.z = p.z;
    v.base = p.heading;
    v.heading = p.heading + v.kick;
    v.roll = v.fall * 1.45 * v.fallSide;
    v.vx = Math.sin(v.heading) * v.v;
    v.vz = Math.cos(v.heading) * v.v;
    fillObb(v.obb, v.shape, v.x, v.z, v.heading);
  };
  const vehicles = [];
  const groups = new Map();
  for (const s of specs) {
    const path = pathOf(s.lane, s.ccw);
    const v = {
      id: s.id, kind: s.kind, lane: s.lane, ccw: s.ccw, color: s.color, cruise: s.speed, path, shape: shapes[s.kind] ?? shapes.car,
      u: mod(s.u0, path.length), v: s.speed, stun: 0, bumpCool: 0, kick: 0, fall: 0, fallT: 0, fallSide: 1, blocked: 0, honkCool: 0,
      x: 0, z: 0, base: 0, heading: 0, roll: 0, vx: 0, vz: 0, obb: makeObb(),
    };
    place(v);
    vehicles.push(v);
    const key = `${s.lane}${s.ccw ? 'l' : 'r'}`;
    if (!groups.has(key)) groups.set(key, { path, list: [] });
    groups.get(key).list.push(v);
  }

  /** Kendaraan ditabrak: berhenti sebentar, miring ke arah dorongan, motor roboh. false bila masih dalam jeda tabrakan sebelumnya. */
  function bump(v, strength, side = 1) {
    const s = Math.max(0, strength);
    v.stun = Math.max(v.stun, clamp(STUN.base + s * STUN.perMs, STUN.base, STUN.max));
    if (v.bumpCool > 0) return false;
    v.bumpCool = BUMP_COOLDOWN;
    v.v *= 0.35;
    v.kick = clamp(side * s * 0.035, -0.5, 0.5);
    if (v.kind === 'motor' && s > 3) {
      v.fallT = STUN.fall;
      v.fallSide = side >= 0 ? 1 : -1;
      v.stun = Math.max(v.stun, STUN.fall);
    }
    return true;
  }

  /** Satu langkah. obstacles = [{ x, z, fx, fz, sx, sz, halfL, halfW }] (carObstacle / walkerObstacle). Mengembalikan peristiwa { type: 'honk', id, kind, x, z }. */
  function step(dt, obstacles = []) {
    const events = [];
    const h = clamp(dt, 0, 0.1);
    if (h === 0) return events;
    for (const g of groups.values()) {
      const L = g.path.length;
      const arr = g.list;
      arr.sort((a, b) => a.u - b.u);
      const n = arr.length;
      for (let i = 0; i < n; i++) {
        const v = arr[i];
        let target = v.cruise;
        if (n > 1) {
          const lead = arr[(i + 1) % n];
          target = Math.min(target, safeSpeed(mod(lead.u - v.u, L) - lead.shape.halfL - v.shape.halfL));
        }
        let blockedNow = false;
        if (obstacles.length) {
          const fx = Math.sin(v.base);
          const fz = Math.cos(v.base);
          const sx = Math.cos(v.base);
          const sz = -Math.sin(v.base);
          for (const ob of obstacles) {
            const dx = ob.x - v.x;
            const dz = ob.z - v.z;
            const lf = dx * fx + dz * fz;
            if (lf > 90) continue;
            const extF = Math.abs(fx * ob.fx + fz * ob.fz) * ob.halfL + Math.abs(fx * ob.sx + fz * ob.sz) * ob.halfW;
            if (lf < -(extF + v.shape.halfL)) continue; // seluruhnya di belakang
            const extS = Math.abs(sx * ob.fx + sz * ob.fz) * ob.halfL + Math.abs(sx * ob.sx + sz * ob.sz) * ob.halfW;
            if (Math.abs(dx * sx + dz * sz) > v.shape.halfW + extS + 0.5) continue; // di luar lajur kendaraan ini
            const safe = safeSpeed(lf - extF - v.shape.halfL);
            if (safe < target) target = safe;
            if (safe < 0.5) blockedNow = true;
          }
        }
        v.blocked = blockedNow ? v.blocked + h : Math.max(0, v.blocked - 2 * h);
        v.honkCool = Math.max(0, v.honkCool - h);
        if (v.blocked > HONK_AFTER && v.honkCool === 0) {
          v.honkCool = HONK_EVERY;
          v.blocked = 0.4;
          events.push({ type: 'honk', id: v.id, kind: v.kind, x: v.x, z: v.z });
        }
        let decel = BRAKE;
        if (v.stun > 0) {
          v.stun -= h;
          target = 0;
          decel = STOP_DECEL;
        }
        v.bumpCool = Math.max(0, v.bumpCool - h);
        v.v += clamp(target - v.v, -decel * h, (ACCEL[v.kind] ?? ACCEL.car) * h);
        v.u = mod(v.u + v.v * h, L);
        v.kick *= Math.exp(-2.4 * h);
        if (Math.abs(v.kick) < 1e-3) v.kick = 0;
        if (v.fallT > 0) v.fallT -= h;
        const fallTarget = v.fallT > 0.8 ? 1 : 0;
        v.fall += (fallTarget - v.fall) * (1 - Math.exp(-7 * h));
        if (fallTarget === 0 && v.fall < 0.002) v.fall = 0;
        place(v);
      }
    }
    return events;
  }

  return { vehicles, step, bump };
}
