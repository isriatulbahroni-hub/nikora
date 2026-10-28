// Katalog model mobil mewah (murni data, tanpa THREE): ukuran, performa, kursi, suara mesin, gaya pintu.
// Desain terinspirasi empat mobil referensi pemilik (coupe mewah biru, roadster hitam, hypercar perak-merah, SUV mewah merah).
// Tanpa logo, lambang, atau nama merek asli: semua bentuk dibuat sendiri secara prosedural (lihat luxury-cars.js).
//
// Kerangka mobil: depan = +z; kursi: fwd (+ ke depan), side (+ ke kanan mobil). Kursi 0 = pengemudi (kanan depan, setir kanan).

const freeze = (o) => Object.freeze(o);
const gears = (...speeds) => freeze(speeds); // batas atas kecepatan (m/s) tiap gigi maju

export const CAR_MODELS = freeze({
  royale: freeze({
    id: 'royale', name: 'Royale Sweep', kind: 'coupe',
    length: 5.55, width: 2.0, height: 1.5, wheelBase: 3.5, wheelRadius: 0.38, tireWidth: 0.27,
    maxSpeed: 31, reverseMax: 5, accel: 6.6, brake: 17, maxSteer: 0.48, steerRate: 3.0,
    circleRadius: 1.05, circleOffset: 1.75,
    seats: freeze([{ fwd: 0.35, side: 0.5 }, { fwd: 0.35, side: -0.5 }]), seatLift: -0.05,
    paint: 0x151f46, accent: 0xd8d4c8, interior: 0xd9c3a0,
    engine: freeze({ cylinders: 12, idleRpm: 650, maxRpm: 5200, gears: gears(7, 12, 18, 25, 31), timbre: 'smooth' }),
    doors: freeze({ style: 'coach', open: 1.15 }),
  }),
  noir: freeze({
    id: 'noir', name: 'Noir Aero', kind: 'roadster',
    length: 4.62, width: 2.04, height: 1.19, wheelBase: 2.75, wheelRadius: 0.36, tireWidth: 0.3,
    maxSpeed: 37, reverseMax: 5, accel: 10.5, brake: 21, maxSteer: 0.5, steerRate: 3.6,
    circleRadius: 1.0, circleOffset: 1.3,
    seats: freeze([{ fwd: 0.2, side: 0.5 }, { fwd: 0.2, side: -0.5 }]), seatLift: -0.2,
    paint: 0x0b0c10, accent: 0xe0a800, interior: 0x15151a,
    engine: freeze({ cylinders: 16, idleRpm: 700, maxRpm: 7000, gears: gears(8, 14, 21, 29, 37), timbre: 'deep', turbo: true }),
    doors: freeze({ style: 'swing', open: 1.0 }),
  }),
  argent: freeze({
    id: 'argent', name: 'Argent Fury', kind: 'hypercar',
    length: 4.85, width: 2.06, height: 1.16, wheelBase: 2.9, wheelRadius: 0.36, tireWidth: 0.31,
    maxSpeed: 39, reverseMax: 5, accel: 12, brake: 22, maxSteer: 0.5, steerRate: 3.8,
    circleRadius: 1.0, circleOffset: 1.4,
    seats: freeze([{ fwd: 0.1, side: 0.5 }, { fwd: 0.1, side: -0.5 }]), seatLift: -0.36,
    paint: 0x8d9298, accent: 0xc01822, interior: 0x101012,
    engine: freeze({ cylinders: 12, idleRpm: 900, maxRpm: 8400, gears: gears(8, 15, 22, 30, 39), timbre: 'scream', turbo: false }),
    doors: freeze({ style: 'scissor', open: 1.05 }),
  }),
  rubis: freeze({
    id: 'rubis', name: 'Rubis Grand', kind: 'suv',
    length: 5.34, width: 2.0, height: 1.83, wheelBase: 3.3, wheelRadius: 0.44, tireWidth: 0.31,
    maxSpeed: 28, reverseMax: 5, accel: 6.0, brake: 16, maxSteer: 0.5, steerRate: 3.0,
    circleRadius: 1.05, circleOffset: 1.65,
    seats: freeze([{ fwd: 0.75, side: 0.5 }, { fwd: 0.75, side: -0.5 }, { fwd: -0.75, side: 0.5 }, { fwd: -0.75, side: -0.5 }]), seatLift: 0.1,
    paint: 0x7b0e17, accent: 0xc8ccd2, interior: 0xe6d8bf,
    engine: freeze({ cylinders: 12, idleRpm: 600, maxRpm: 4800, gears: gears(6, 11, 16, 22, 28), timbre: 'smooth' }),
    doors: freeze({ style: 'coach', open: 1.15 }),
  }),
});

// Model yang tubuhnya berasal dari berkas 3D (GLB) buatan sendiri, bukan dari kode (luxury-cars.js). Sengaja dipisah dari CAR_MODELS:
// armada hotel yang berselang-seling (HOTEL_MODEL_ORDER) dan semua tes katalog prosedural tetap berlaku untuk empat model di atas.
// NIKORA W16: performa mengikuti kelas hypercar 16 silinder empat-turbo: kecepatan puncak 420 km/j (dibatasi), 0-100 km/j sekitar 2,4 detik,
// pengereman 100-0 km/j sekitar 31 m (12,5 m/s^2), mesin 16 silinder 700-6700 rpm, tujuh gigi.
// accelFade = berapa bagian percepatan hilang di kecepatan puncak (tenaga makin sulit menambah laju), dragK = hambatan udara saat gas
// dilepas (m/s^2 per (m/s)^2), grip = pengali cengkeraman ban.
// Suara mesin: watak 'w16' (geraman tebal, dua nada turbo, blow-off panjang, letupan knalpot saat gas dilepas). Dulu 'deep', sehingga
// mobil bergaya Bugatti yang dikendarai pemain di hotel masih bersuara lama; Bugatti Chiron di bawah mewarisi watak yang sama.
const NIKORA_W16 = freeze({
  id: 'nikora', name: 'NIKORA W16', kind: 'hypercar',
  length: 4.55, width: 2.04, height: 1.21, wheelBase: 2.71, wheelRadius: 0.37, tireWidth: 0.32,
  maxSpeed: 116.7, reverseMax: 6, accel: 11.6, accelFade: 0.9, dragK: 0.0003, brake: 12.5, maxSteer: 0.5, steerRate: 3.8, grip: 1.25,
  circleRadius: 1.0, circleOffset: 1.3,
  seats: freeze([{ fwd: 0.1, side: 0.5 }, { fwd: 0.1, side: -0.5 }]), seatLift: -0.36,
  paint: 0x0a1a3a, accent: 0x0b0c10, interior: 0x15151a,
  engine: freeze({ cylinders: 16, idleRpm: 700, maxRpm: 6700, gears: gears(21.7, 36.1, 50, 66.7, 83.3, 100, 116.7), timbre: 'w16', turbo: true }),
  doors: freeze({ style: 'swing', open: 1.0 }),
  // file = relatif terhadap folder publik; yaw = putaran tambahan (0 atau Math.PI) bila moncong model di berkas menghadap ke belakang
  glb: freeze({ file: 'models/mobil-hotel.glb', yaw: 0 }),
});

// Bugatti Chiron: model GLB buatan sendiri dari Blender (game/blender/nikora_bugatti_chiron.blend). Performa dicocokkan dengan data pabrik
// Chiron (0-100 km/j 2,4 s; 0-200 km/j 6,5 s; 0-300 km/j 13,6 s; kecepatan puncak 420 km/j dibatasi elektronik; 100-0 km/j sekitar 31,3 m;
// massa 1995 kg; mesin W16 quad-turbo 1479 hp). Tenaga yang sampai ke jalan (powerW) diset lebih rendah dari tenaga pabrik (1103 kW) supaya
// 0-200 dan 0-300 km/j sesuai: rugi transmisi dan pindah gigi tidak dimodelkan. Bila moncong di berkas menghadap ke belakang, ubah yaw menjadi Math.PI.
// Mesin (putaran, gigi, turbo, dan watak suara 'w16') diwarisi dari NIKORA W16.
const BUGATTI_CHIRON = freeze({
  ...NIKORA_W16,
  id: 'bugatti', name: 'Bugatti Chiron',
  mass: 1995, // kg
  powerW: 650000, // tenaga yang sampai ke jalan (W); pabrik 1103 kW
  dragK: 0.0002, // hambatan udara (m/s^2 per (m/s)^2)
  accel: 11.6, // batas percepatan awal (m/s^2)
  accelFade: 0, // dimatikan: percepatan dibatasi daya, bukan pengurangan linear
  maxSpeed: 116.7, // 420 km/j
  brake: 12.5, // 100-0 km/j sekitar 31 m
  paint: 0x0b2a5c,
  glb: freeze({ file: 'models/mobil-bugatti-chiron.glb', yaw: 0 }),
});

export const GLB_MODELS = freeze({ nikora: NIKORA_W16, bugatti: BUGATTI_CHIRON });

export const MODEL_IDS = freeze(Object.keys(CAR_MODELS));
export const modelOf = (id) => CAR_MODELS[id] ?? GLB_MODELS[id] ?? null;

/** Urutan model armada hotel: 8 mobil = tiap model dua kali, berselang-seling supaya parkir terlihat beragam. */
export const HOTEL_MODEL_ORDER = freeze(['royale', 'noir', 'argent', 'rubis']);
export const hotelModelFor = (k) => HOTEL_MODEL_ORDER[k % HOTEL_MODEL_ORDER.length];

// ---------------------------------------------------------------- mesin (RPM, gigi) — murni, diuji
/** Gigi 1..n untuk kecepatan |v| (m/s). 0 = diam/netral. */
export function gearFor(model, speed) {
  const v = Math.abs(speed);
  if (v < 0.25) return 0;
  const g = model.engine.gears;
  for (let i = 0; i < g.length; i++) if (v <= g[i]) return i + 1;
  return g.length;
}

/** RPM mesin: naik dalam tiap gigi, turun saat pindah gigi; throttle menaikkan RPM saat diam/menahan. */
export function rpmFor(model, speed, throttle = 0, engineOn = true) {
  const { idleRpm, maxRpm, gears: g } = model.engine;
  if (!engineOn) return 0;
  const v = Math.abs(speed);
  const gear = gearFor(model, v);
  if (gear === 0) return idleRpm + (maxRpm - idleRpm) * 0.28 * Math.max(0, throttle);
  const lo = gear === 1 ? 0 : g[gear - 2] * 0.62; // setelah pindah gigi RPM jatuh ke ~62% batas gigi sebelumnya
  const hi = g[gear - 1];
  const t = Math.min(1, Math.max(0, (v - lo) / Math.max(0.001, hi - lo)));
  const base = idleRpm + (maxRpm * 0.96 - idleRpm) * (gear === 1 ? Math.min(1, v / hi) : 0.38 + 0.62 * t);
  return Math.min(maxRpm, base + 160 * Math.max(0, throttle));
}

/** Frekuensi pembakaran (Hz) mesin 4-tak: rpm/60 * silinder/2. */
export const firingHz = (model, rpm) => (rpm / 60) * (model.engine.cylinders / 2);
