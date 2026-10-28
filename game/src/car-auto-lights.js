// Lampu depan otomatis (efek 4D mobil): menyala saat langit mulai gelap atau hujan turun, padam saat terang lagi.
// Fungsi murni + pembungkus kecil, diuji tanpa peramban (car-auto-lights.test.js). Dipasang di car-ride.js.
// Yang SUDAH ada dan tidak diulang di sini: langit siang-malam (day-night.js, hotel-sky.js), hujan acak (drive-weather.js, rain-boot.js),
// dan tombol lampu manual (car-state.js). Modul ini hanya memutuskan kapan lampu menyala sendiri.

// Fase langit: -1 siang penuh, 0 senja keemasan, +1 malam penuh (day-night.js). Dua ambang berbeda (histeresis) supaya lampu tidak berkedip di batas.
export const NIGHT_ON = -0.15; // mulai gelap (sore): lampu menyala
export const NIGHT_OFF = -0.45; // sudah cukup terang (pagi): lampu padam
export const RAIN_ON = 0.3; // intensitas hujan (drive-weather.js, 0..1) yang menyalakan lampu
export const RAIN_OFF = 0.12; // hujan reda: lampu boleh padam

/** Pembuat keputusan lampu untuk satu mobil. Memanggil (phase, rain) mengembalikan true bila lampu harus menyala. */
export function createAutoLights() {
  let on = false;
  return (phase, rain = 0) => {
    const dark = on ? phase > NIGHT_OFF : phase > NIGHT_ON;
    const wet = on ? rain > RAIN_OFF : rain > RAIN_ON;
    on = dark || wet;
    return on;
  };
}

/**
 * Fase langit dan hujan dari halaman hotel (window.__hotel.sky() dan window.__weather, sama seperti rain-boot.js membaca window.__hotel).
 * Mengembalikan null bila halaman tidak punya langit itu (vila): lampu otomatis tidak aktif dan perilaku lama tetap.
 * Untuk halaman lain, kirim opsi `env` ke createCarRide.
 */
export function envFromGlobals(g = globalThis) {
  try {
    const phase = g.__hotel?.sky?.()?.phase;
    if (!Number.isFinite(phase)) return null;
    const rain = g.__weather?.intensity?.();
    return { phase, rain: Number.isFinite(rain) ? rain : 0 };
  } catch {
    return null;
  }
}
