// Model ban sederhana (murni data + matematika, tanpa THREE): grip menurut suhu dan permukaan, batas percepatan menikung,
// lingkaran gesek (gas/rem mengurangi grip samping), selip, dan pemanasan ban.
// Ide: fisika ban bersuhu dari LibreCorsa (KhazP/librecorsa, MIT) — ditulis ulang dan disederhanakan untuk HP, bukan salinan kode.
// Semua angka dalam satuan SI (m/s, m/s^2, derajat C).

export const G = 9.81;

export const TYRE = Object.freeze({
  mu: 1.4,           // grip puncak (kali g) pada suhu ideal di aspal (dulu 1,15: tikungan jalan raya terlalu licin)
  ambient: 28,       // suhu udara/ban dingin (C)
  optTemp: 85,       // suhu ban dengan grip terbaik
  tempWidth: 60,     // lebar lonceng grip terhadap suhu
  coldGrip: 0.9,     // faktor grip terendah (ban sangat dingin/terlalu panas); dulu 0,78
  maxTemp: 140,
  heatPerSlip: 90,   // pemanasan (C/dtk) pada selip penuh
  heatRolling: 0.35, // pemanasan gelinding (C/dtk) per m/s
  coolBase: 0.012,   // laju pendinginan dasar (1/dtk)
  coolSpeed: 0.0016, // tambahan pendinginan oleh angin (1/dtk per m/s)
});

/** Kali grip permukaan; selaras dengan jenis permukaan hotel-layout (road / compound / ground). */
export const SURFACE_MU = Object.freeze({ road: 1, compound: 0.9, ground: 0.75 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Faktor grip 0..1 menurut suhu ban: lonceng di sekitar suhu ideal. */
export function gripFactor(temp, t = TYRE) {
  const x = (temp - t.optTemp) / t.tempWidth;
  return t.coldGrip + (1 - t.coldGrip) * Math.exp(-x * x);
}

/** Batas percepatan total (m/s^2) = mu * g * suhu * permukaan * bawaan model. */
export function gripLimit(temp, surface = 'road', modelGrip = 1, t = TYRE) {
  return t.mu * G * gripFactor(temp, t) * (SURFACE_MU[surface] ?? SURFACE_MU.ground) * modelGrip;
}

/**
 * Batas yaw rate (rad/dtk) agar percepatan samping tidak melebihi grip yang tersisa setelah gas/rem (lingkaran gesek).
 * Mengembalikan { yawRate, slip } — slip 0..1 = seberapa jauh permintaan melewati batas (0 = menempel, 1 = hilang total).
 */
export function limitYaw({ speed, wantedYaw, aLong = 0, limit }) {
  const v = Math.abs(speed);
  if (v < 0.5) return { yawRate: wantedYaw, slip: 0 };
  const aLat = v * Math.abs(wantedYaw);
  const lat = Math.sqrt(Math.max(0, limit * limit - aLong * aLong));
  if (aLat <= lat) return { yawRate: wantedYaw, slip: 0 };
  const yawRate = Math.sign(wantedYaw) * (lat / v);
  return { yawRate, slip: clamp((aLat - lat) / Math.max(aLat, 1e-6), 0, 1) };
}

/** Selip memanjang (roda berputar/terkunci) saat gas/rem melebihi grip. 0..1. */
export function longSlip(aLong, limit) {
  const a = Math.abs(aLong);
  return a <= limit ? 0 : clamp((a - limit) / Math.max(a, 1e-6), 0, 1);
}

/** Perbarui suhu ban satu langkah: panas dari selip dan gelinding, dingin oleh udara/angin. */
export function stepTyreTemp(temp, { slip, speed, dt }, t = TYRE) {
  const heat = t.heatPerSlip * slip + t.heatRolling * Math.abs(speed) * 0.2;
  const cool = (t.coolBase + t.coolSpeed * Math.abs(speed)) * (temp - t.ambient);
  return clamp(temp + (heat - cool) * dt, t.ambient, t.maxTemp);
}
