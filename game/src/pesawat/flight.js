// Fisika penerbangan NIKORA Flight (murni: tanpa THREE dan tanpa DOM, supaya bisa diuji di Node).
// Satuan SI. Sumbu dunia sama dengan THREE: x timur, y atas, z selatan (utara = -z).
// Sumbu badan pesawat: depan = -z, atas = +y, kanan = +x. Sikap disimpan sebagai quaternion, jadi pesawat bisa
// loop, terbalik, dan berputar tanpa gimbal lock.
//
// Lima dimensi simulator:
//   1-3 ruang  : posisi dan sikap 3 sumbu, angin, ketinggian (kerapatan udara menurunkan gaya angkat dan tenaga mesin)
//   4   waktu  : jam dunia (siang/malam/senja), cuaca yang berubah sendiri, bahan bakar yang habis seiring waktu
//   5   indra  : beban-G, guncangan turbulensi, getar stall, hentakan mendarat (dihitung di sini, ditampilkan index.js)

export const G = 9.81;
export const RHO0 = 1.225; // kerapatan udara di permukaan laut (kg/m3)
export const KNOT = 1.943844; // m/s -> knot
export const FOOT = 3.28084; // m -> kaki
export const knots = (ms) => ms * KNOT;
export const feet = (m) => m * FOOT;

// ---------------------------------------------------------------- matematika vektor dan quaternion
export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : vec(); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

export const AXIS = Object.freeze({
  fwd: vec(0, 0, -1), up: vec(0, 1, 0), right: vec(1, 0, 0), negZ: vec(0, 0, -1),
});

export const qIdentity = () => ({ x: 0, y: 0, z: 0, w: 1 });
export function qMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
export function qAxisAngle(axis, angle) {
  const h = angle / 2;
  const s = Math.sin(h);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) };
}
export function qNormalize(q) {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}
/** Putar vektor v dengan quaternion q (badan -> dunia). */
export function qRotate(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Arah hadap (derajat 0..360, 0 = utara, 90 = timur), pitch (rad, + = hidung naik), roll (rad, + = sayap kanan turun). */
export function attitude(q) {
  const f = qRotate(q, AXIS.fwd);
  const u = qRotate(q, AXIS.up);
  const r = qRotate(q, AXIS.right);
  let heading = (Math.atan2(f.x, -f.z) * 180) / Math.PI;
  if (heading < 0) heading += 360;
  return { heading, pitch: Math.asin(clamp(f.y, -1, 1)), roll: Math.atan2(-r.y, u.y) };
}

// ---------------------------------------------------------------- pesawat (kelas ringan, mirip Cessna 172)
export const FLAP_ANGLES = Object.freeze([0, 10, 20, 30]);
export const SPEC = Object.freeze({
  emptyMass: 760, pilotMass: 90, fuelMax: 120, fuelStart: 70, // kg
  wingArea: 16.2, cl0: 0.3, clAlpha: 5.0, clMax: 1.6, clMin: -0.9,
  cd0: 0.028, k: 0.06, flapCl: 0.45, flapCd: 0.05, gearCd: 0.012,
  staticThrust: 2400, power: 96000, // N dan W (daya poros x efisiensi baling-baling)
  gearHeight: 1.1, bellyHeight: 0.55, // tinggi pusat massa di atas tanah (roda turun / naik)
  safeSink: 3.0, crashSink: 5.5, // laju turun saat menyentuh landasan (m/s)
  maxSpeed: 82, // di atas ini peringatan kecepatan berlebih (m/s)
});

// ---------------------------------------------------------------- cuaca dan derau
export const WEATHERS = Object.freeze({
  cerah: Object.freeze({ id: 'cerah', label: 'Cerah', wind: 3, turb: 0.05, fog: 0.00004, cloud: 0.15, rain: 0 }),
  berawan: Object.freeze({ id: 'berawan', label: 'Berawan', wind: 7, turb: 0.2, fog: 0.00008, cloud: 0.6, rain: 0 }),
  hujan: Object.freeze({ id: 'hujan', label: 'Hujan', wind: 11, turb: 0.45, fog: 0.00022, cloud: 0.9, rain: 1 }),
  badai: Object.freeze({ id: 'badai', label: 'Badai Petir', wind: 20, turb: 1, fog: 0.0004, cloud: 1, rain: 2 }),
});
export const WEATHER_ORDER = Object.freeze(['cerah', 'berawan', 'hujan', 'badai']);

/** Derau halus deterministik di kisaran -1..1 (jumlah tiga sinus), sama untuk semua pemain pada waktu yang sama. */
export const noise1 = (t) => (Math.sin(1.3 * t) + 0.6 * Math.sin(2.1 * t + 1.7) + 0.3 * Math.sin(3.7 * t + 4.2)) / 1.9;

/**
 * Lingkungan pada waktu t: kecepatan angin (vektor dunia), turbulensi, dan fungsi tanah/tabrakan opsional.
 * `weather` boleh objek WEATHERS atau campuran (angin dan turb sudah angka).
 */
export function makeEnv(weather, t, windDir = 0.8, extras = {}) {
  const w = typeof weather === 'string' ? WEATHERS[weather] : weather;
  const speed = w.wind * (1 + 0.35 * noise1(t * 0.35 + 5));
  return {
    wind: vec(Math.sin(windDir) * speed, 0, -Math.cos(windDir) * speed),
    turb: w.turb,
    t,
    ...extras,
  };
}

// ---------------------------------------------------------------- jam dunia
export const DEFAULT_TIME_RATE = 30; // 1 detik nyata = 30 detik dunia (satu hari = 48 menit)
export const advanceClock = (hour, dt, rate = DEFAULT_TIME_RATE) => (((hour + (dt * rate) / 3600) % 24) + 24) % 24;

/** Arah matahari (vektor satuan, y = tinggi). Terbit di timur jam 06:00, puncak jam 12:00, terbenam jam 18:00. */
export function sunDirection(hour) {
  const phi = ((hour - 6) / 24) * Math.PI * 2;
  return norm(vec(Math.cos(phi), Math.sin(phi), 0.25));
}
export const moonDirection = (hour) => mul(sunDirection(hour), -1);
/** 0 = malam penuh, 1 = siang penuh (peralihan lembut di sekitar ufuk). */
export const daylightAt = (hour) => clamp((sunDirection(hour).y + 0.1) / 0.4, 0, 1);

// ---------------------------------------------------------------- keadaan pesawat
export const massOf = (s) => SPEC.emptyMass + SPEC.pilotMass + s.fuel;

export function createFlight(opts = {}) {
  const heading = opts.heading ?? 0;
  const gear = opts.gear ?? 1;
  const clearance = lerp(SPEC.bellyHeight, SPEC.gearHeight, gear);
  const q = qAxisAngle(AXIS.up, -heading);
  const speed = opts.speed ?? 0;
  const f = qRotate(q, AXIS.fwd);
  const groundY = opts.groundY ?? 0;
  return {
    p: vec(opts.x ?? 0, opts.y ?? groundY + clearance, opts.z ?? 0),
    v: mul(f, speed),
    q,
    rates: { pitch: 0, roll: 0, yaw: 0 },
    fuel: opts.fuel ?? SPEC.fuelStart,
    engine: opts.engine ?? true,
    rpm: opts.engine === false ? 0 : 0.28,
    gear, flaps: opts.flaps ?? 0,
    onGround: opts.onGround ?? opts.y === undefined, crashed: false, crashReason: '',
    time: 0, airspeed: speed, groundSpeed: speed, alpha: 0, beta: 0, vs: 0, agl: 0, gLoad: 1,
    stalled: false, stallWarn: false, throttleEff: 0, lowFuelSent: false,
    events: [],
  };
}

export const DEFAULT_INPUT = Object.freeze({ pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0, flaps: 0, gear: true, assist: true, engine: true, trim: 0 });

/** Daya dorong (N) pada kecepatan v (m/s) dan kerapatan rho untuk pembukaan gas efektif 0..1. */
export function thrustAvailable(throttleEff, v, rho) {
  const dens = rho / RHO0;
  return throttleEff * Math.min(SPEC.staticThrust * dens, (SPEC.power * dens) / Math.max(v, 8));
}

const GROUND_TURN_RATE = 0.7;

/**
 * Maju satu langkah fisika (dt detik, sebaiknya <= 1/30). Mengubah `s` dan mengembalikannya.
 * `s.events` diisi peristiwa langkah ini: { type: 'touchdown'|'crash'|'stall'|'recover'|'lowfuel'|'fuelout', ... }.
 * input: pitch/roll/yaw -1..1 (pitch + = tarik, hidung naik), throttle 0..1, brake 0..1, flaps 0..3, gear boolean, assist, engine, trim.
 * env: { wind, turb, t, groundAt?(x,z), collide?(p) -> string|null }.
 */
export function step(s, input, env, dt) {
  s.events = [];
  if (s.crashed) { s.v = vec(); s.airspeed = 0; s.groundSpeed = 0; return s; }
  dt = clamp(dt, 0, 0.05);
  s.time += dt;

  // ---- sistem: roda, flap, mesin, bahan bakar
  s.gear = clamp(s.gear + Math.sign((input.gear ? 1 : 0) - s.gear) * Math.min(Math.abs((input.gear ? 1 : 0) - s.gear), 0.4 * dt), 0, 1);
  const flapTarget = clamp(Math.round(input.flaps ?? 0), 0, 3);
  s.flaps += Math.sign(flapTarget - s.flaps) * Math.min(Math.abs(flapTarget - s.flaps), 0.8 * dt);
  const throttle = clamp(input.throttle ?? 0, 0, 1);
  if (input.engine && s.fuel > 0) s.engine = true;
  if (!input.engine) s.engine = false;
  const windmill = Math.min(0.2, s.airspeed / 200);
  const rpmTarget = s.engine ? 0.28 + 0.72 * throttle : windmill;
  s.rpm += (rpmTarget - s.rpm) * Math.min(1, dt * 2.5);
  s.throttleEff = s.engine ? 0.04 + 0.96 * clamp((s.rpm - 0.28) / 0.72, 0, 1) : 0;
  if (s.engine) {
    s.fuel = Math.max(0, s.fuel - (0.0012 + 0.0075 * throttle) * dt);
    if (s.fuel <= 10 && !s.lowFuelSent) { s.lowFuelSent = true; s.events.push({ type: 'lowfuel', fuel: s.fuel }); }
    if (s.fuel <= 0) { s.engine = false; s.events.push({ type: 'fuelout' }); }
  }

  // ---- geometri dan udara
  const m = massOf(s);
  const f = qRotate(s.q, AXIS.fwd);
  const up = qRotate(s.q, AXIS.up);
  const right = qRotate(s.q, AXIS.right);
  const wind = env.wind ?? vec();
  const va = sub(s.v, wind);
  const V = len(va);
  s.airspeed = V;
  const rho = RHO0 * Math.exp(-Math.max(0, s.p.y) / 8500);
  const qd = 0.5 * rho * V * V;
  const vf = dot(va, f);
  const alpha = V > 3 ? Math.atan2(-dot(va, up), vf) : 0;
  const beta = V > 3 ? Math.atan2(dot(va, right), Math.max(Math.abs(vf), 1)) * Math.sign(vf || 1) : 0;
  s.alpha = alpha; s.beta = beta;

  // ---- gaya angkat dan hambat (dengan stall)
  const fl = s.flaps / 3;
  const clMax = SPEC.clMax + 0.35 * fl;
  const lin = SPEC.cl0 + SPEC.clAlpha * alpha + SPEC.flapCl * fl;
  const stallA = (clMax - SPEC.cl0 - SPEC.flapCl * fl) / SPEC.clAlpha;
  const stalledNow = V > 8 && (alpha > stallA || alpha < -(stallA + 0.15));
  let cl;
  if (alpha > stallA) cl = clMax * (1 - 0.45 * smooth((alpha - stallA) / 0.15));
  else cl = clamp(lin, SPEC.clMin, clMax);
  if (alpha < -(stallA + 0.15)) cl = SPEC.clMin * 0.6;
  let cd = SPEC.cd0 + SPEC.flapCd * fl * fl + SPEC.gearCd * s.gear + SPEC.k * cl * cl + Math.min(0.5, beta * beta * 0.25);
  if (stalledNow) cd += 1.0 * Math.sin(alpha) * Math.sin(alpha);
  if (stalledNow && !s.stalled) s.events.push({ type: 'stall' });
  if (!stalledNow && s.stalled) s.events.push({ type: 'recover' });
  s.stalled = stalledNow;
  s.stallWarn = V > 8 && !s.onGround && alpha > stallA * 0.85;

  const liftDir = V > 1 ? norm(cross(right, va)) : up;
  const lift = mul(liftDir, qd * SPEC.wingArea * cl);
  const drag = V > 1 ? mul(norm(va), -qd * SPEC.wingArea * cd) : vec();
  const thrust = mul(f, thrustAvailable(s.throttleEff, V, rho));
  const aero = add(add(lift, drag), thrust);
  let acc = mul(aero, 1 / m);
  acc.y -= G;

  // ---- turbulensi (indra): guncangan acak halus, makin kuat saat badai dan di udara bergerak
  const tFactor = (env.turb ?? 0) * Math.min(1, V / 25) * 3.2;
  const tt = env.t ?? s.time;
  const shake = vec(noise1(tt * 0.9 + 3) * 0.5, noise1(tt * 1.7 + 9), noise1(tt * 1.1 + 17) * 0.5);
  acc = add(acc, mul(shake, tFactor));
  s.gLoad = clamp(dot(add(mul(aero, 1 / m), mul(shake, tFactor)), up) / G, -6, 9);

  // ---- putaran sikap: laju sudut mengejar target; stabilitas aerodinamika menjaga hidung searah aliran udara
  const eff = Math.min(1, (V * V) / (32 * 32));
  const trimA = 0.045 + (input.trim ?? 0);
  const rollAngle = Math.atan2(-right.y, up.y);
  let pitchT = (input.pitch ?? 0) * 0.7 * eff + 2.0 * (trimA - alpha) * eff;
  let rollT = (input.roll ?? 0) * 1.6 * eff;
  let yawT = (input.yaw ?? 0) * 0.45 * eff + 1.5 * beta * eff;
  if (input.assist && !s.onGround && Math.abs(input.roll ?? 0) < 0.05 && Math.abs(rollAngle) < 1.2) rollT += -rollAngle * 1.1 * eff;
  if (stalledNow) { rollT += noise1(tt * 5) * 0.8; pitchT -= 0.5; } // hidung jatuh dan sayap menggelepar saat stall
  const gs0 = Math.hypot(s.v.x, s.v.z);
  if (s.onGround) { yawT = (input.yaw ?? 0) * GROUND_TURN_RATE * clamp(gs0 / 3, 0, 1); rollT = 0; }
  const k = Math.min(1, dt * 6);
  s.rates.pitch += (pitchT - s.rates.pitch) * k;
  s.rates.roll += (rollT - s.rates.roll) * k;
  s.rates.yaw += (yawT - s.rates.yaw) * k;
  let dq = qAxisAngle(AXIS.right, s.rates.pitch * dt);
  dq = qMul(dq, qAxisAngle(AXIS.negZ, s.rates.roll * dt));
  dq = qMul(dq, qAxisAngle(AXIS.up, -s.rates.yaw * dt));
  s.q = qNormalize(qMul(s.q, dq));

  // ---- integrasi gerak
  s.v = add(s.v, mul(acc, dt));
  s.p = add(s.p, mul(s.v, dt));

  // ---- tanah, roda, dan tabrakan
  const groundY = env.groundAt ? env.groundAt(s.p.x, s.p.z) : 0;
  const clearance = lerp(SPEC.bellyHeight, SPEC.gearHeight, s.gear);
  s.agl = s.p.y - groundY - clearance;
  if (s.agl <= 0) {
    const sink = -s.v.y;
    const speed = Math.hypot(s.v.x, s.v.z);
    if (!s.onGround) {
      if (s.gear < 0.9 && (sink > 1.5 || speed > 18)) return crash(s, 'Mendarat tanpa roda', groundY + clearance);
      if (sink > SPEC.crashSink) return crash(s, 'Menghantam landasan terlalu keras', groundY + clearance);
      s.events.push({ type: 'touchdown', sink: Math.max(0, sink), speed, quality: sink < 1 ? 'mulus' : sink < 2 ? 'baik' : sink < SPEC.safeSink ? 'agak keras' : 'keras' });
    }
    s.onGround = true;
    s.p.y = groundY + clearance;
    if (s.v.y < 0) s.v.y = 0;
    groundRoll(s, input, dt);
  } else if (s.agl > 0.05) {
    s.onGround = false;
  }
  s.vs = s.v.y;
  s.groundSpeed = Math.hypot(s.v.x, s.v.z);
  if (s.onGround) s.gLoad = 1;

  const hit = env.collide ? env.collide(s.p) : null;
  if (hit) return crash(s, hit, s.p.y);
  return s;
}

function crash(s, reason, y) {
  s.crashed = true;
  s.crashReason = reason;
  s.p.y = y;
  s.events.push({ type: 'crash', reason, speed: s.airspeed });
  s.v = vec();
  return s;
}

/** Gesekan roda, rem, dan merata sikap di landasan. */
function groundRoll(s, input, dt) {
  const f = qRotate(s.q, AXIS.fwd);
  const fh = norm(vec(f.x, 0, f.z));
  if (len(fh) < 1e-6) return;
  const rh = norm(cross(fh, AXIS.up));
  let vl = s.v.x * fh.x + s.v.z * fh.z;
  let vt = s.v.x * rh.x + s.v.z * rh.z;
  vt *= Math.exp(-dt * 8); // ban tidak tergelincir ke samping
  const decel = (0.03 + 0.55 * clamp(input.brake ?? 0, 0, 1)) * G * dt;
  vl = vl > 0 ? Math.max(0, vl - decel) : Math.min(0, vl + decel);
  s.v.x = fh.x * vl + rh.x * vt;
  s.v.z = fh.z * vl + rh.z * vt;
  // ratakan sayap: putar pada sumbu depan sehingga sumbu kanan kembali mendatar
  const r = qRotate(s.q, AXIS.right);
  const rt = norm(cross(f, AXIS.up));
  if (len(rt) > 1e-6) {
    const ang = Math.atan2(dot(f, cross(r, rt)), dot(r, rt));
    s.q = qNormalize(qMul(qAxisAngle(AXIS.negZ, -ang * Math.min(1, dt * 10)), s.q));
  }
  // hidung tidak boleh menembus tanah dan tidak boleh terlalu tinggi (roda belakang)
  const f2 = qRotate(s.q, AXIS.fwd);
  const pitch = Math.asin(clamp(f2.y, -1, 1));
  const maxPitch = 0.35;
  const fix = pitch < 0 ? -pitch : pitch > maxPitch ? -(pitch - maxPitch) : 0;
  if (fix !== 0) {
    const r2 = qRotate(s.q, AXIS.right);
    s.q = qNormalize(qMul(qAxisAngle(r2, fix), s.q));
  }
}

/** Tinggi di atas tanah, kecepatan vertikal, dsb. dalam satuan penerbangan (untuk HUD dan uji). */
export function instruments(s) {
  const a = attitude(s.q);
  return {
    kt: knots(s.airspeed), ft: feet(s.p.y), fpm: s.vs * FOOT * 60,
    heading: a.heading, pitchDeg: (a.pitch * 180) / Math.PI, rollDeg: (a.roll * 180) / Math.PI,
    g: s.gLoad, fuel: s.fuel, throttle: s.throttleEff,
  };
}
