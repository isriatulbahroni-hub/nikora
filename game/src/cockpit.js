// Kokpit mobil (murni data + matematika, tanpa THREE): posisi mata pengemudi, setir, spidometer, spion, tangan di setir.
// Kerangka mobil sama dengan luxury-cars.js: x + = kiri mobil, y atas, z + = depan. Kursi 0 = pengemudi kanan (x negatif).
// Tampilan 3D-nya ada di cockpit-view.js. Gagasan tampilan dari dalam kabin: kamera di kepala pengemudi, tangan di setir, spion hidup.

/** Dasbor tiap model (tinggi tengah, tebal, posisi z): satu sumber untuk luxury-cars.js dan kokpit. */
export const DASH = Object.freeze({
  royale: Object.freeze({ y: 0.92, h: 0.3, z: 0.82 }),
  noir: Object.freeze({ y: 0.74, h: 0.26, z: 0.8 }),
  argent: Object.freeze({ y: 0.62, h: 0.22, z: 0.86 }),
  rubis: Object.freeze({ y: 1.0, h: 0.34, z: 1.0 }),
});

export const WHEEL_LOCK = 1.9; // putaran setir (rad) dari tengah ke kunci penuh = sekitar 109 derajat
export const SEAT_TOP = 0.665; // permukaan dudukan (selaras cabinInterior di luxury-cars.js)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Sudut putar setir (rad, + = searah jarum jam dilihat pengemudi) dari sudut roda depan. Belok kiri (steer +) memutar setir berlawanan jarum jam. */
export const wheelAngle = (steer, maxSteer = 0.5) => 0 - clamp(steer / Math.max(1e-6, maxSteer), -1, 1) * WHEEL_LOCK;

/** Tata letak kokpit sebuah model dalam kerangka mobil. model = entri CAR_MODELS (atau spec fisika dengan id, seats, width, length). */
export function cockpitSpec(model) {
  const s = model.seats[0];
  const top = SEAT_TOP + (model.seatLift ?? 0);
  const d = DASH[model.id] ?? { y: top + 0.25, h: 0.3, z: s.fwd + 0.5 };
  const x = -s.side;
  const eye = { x, y: top + 0.66, z: s.fwd - 0.1 };
  const dashTop = d.y + d.h / 2;
  const wheel = { x, y: Math.min(eye.y - 0.1, Math.max(top + 0.36, dashTop + 0.12)), z: s.fwd + 0.62, r: 0.17, tilt: -0.35 }; // setir di atas dasbor supaya terlihat dari kursi

  const cluster = { x, y: Math.max(wheel.y + 0.2, dashTop + 0.11), z: Math.max(d.z, wheel.z) + 0.03, w: 0.34, h: 0.17 };
  const half = model.width / 2;
  const mirror = { x: eye.x * 0.4, y: eye.y + 0.12, z: s.fwd + 0.75, w: 0.3, h: 0.1 }; // spion tengah condong ke arah pengemudi supaya masuk bidang pandang
  const sides = [-1, 1].map((k) => ({ x: k * (half - 0.08), y: dashTop + 0.08, z: s.fwd + 0.5, w: 0.15, h: 0.1, side: k }));
  const elbow = (k) => ({ x: x + k * 0.26, y: wheel.y - 0.3, z: wheel.z - 0.42 }); // siku tepat di bawah dan di belakang setir: lengan pendek seperti sudut pandang orang pertama
  return { eye, wheel, cluster, mirror, sides, elbows: { left: elbow(1), right: elbow(-1) }, dash: d };
}

/**
 * Titik tangan di bingkai setir (x kiri, y atas, sebelum kemiringan setir) untuk putaran setir rotZ (rad, nilai wheelAngle).
 * Tangan kiri di jam 10 dan kanan di jam 2 saat lurus; keduanya ikut berputar bersama setir.
 */
export function handPositions(r, rotZ, lift = 0.35) {
  const at = (a) => ({ x: Math.cos(a + rotZ) * r, y: Math.sin(a + rotZ) * r });
  return { left: at(lift), right: at(Math.PI - lift) };
}

/** Posisi dunia dari titik lokal mobil. car = { x, z, heading }. */
export function localToWorld(car, p) {
  const sin = Math.sin(car.heading);
  const cos = Math.cos(car.heading);
  return { x: car.x + sin * p.z + cos * p.x, y: p.y, z: car.z + cos * p.z - sin * p.x };
}

/** Mata dan arah pandang kamera kokpit. look = tambahan yaw (rad, + = kiri) mis. mengintip ke arah belokan. */
export function eyeWorld(car, spec, look = 0) {
  const p = localToWorld(car, spec.eye);
  return { x: p.x, y: p.y, z: p.z, yaw: car.heading + look, pitch: 0 };
}

/** FOV kamera kokpit: makin cepat makin lebar sedikit. */
export const cockpitFov = (speed, maxSpeed, aspect = 1.8) => clamp(66 + 8 * clamp(Math.abs(speed) / Math.max(1, maxSpeed), 0, 1) + (aspect < 1 ? 14 : 0), 60, 92);

/** Sudut jarum (rad) pada jam 240 derajat: frac 0..1 -> dari -210 ke +30 derajat (searah jarum jam). */
export const dialAngle = (frac) => (-210 + 240 * clamp(frac, 0, 1)) * (Math.PI / 180);

/** Gas/rem dari pedal layar digabung joystick: pedal gas menang bila ditekan; pedal rem memberi brake dan menahan gas. */
export function mergeControls(base, pedals) {
  if (!pedals || (!pedals.gas && !pedals.brake)) return base;
  const gas = clamp(pedals.gas ?? 0, 0, 1);
  return { ...base, throttle: pedals.brake ? 0 : gas || base.throttle, brake: Boolean(pedals.brake) };
}

/** Data jam spidometer dari mobil yang dikemudikan. */
export function clusterState(car, hud) {
  const rpmFrac = hud ? clamp(hud.rpm / hud.rpmMax, 0, 1) : 0;
  return { kmh: Math.round(Math.abs(car.speed) * 3.6), rpmFrac, gear: hud ? hud.gear : 'N', maxKmh: Math.round(car.spec.maxSpeed * 3.6) };
}
