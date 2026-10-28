// Teduh dari hujan: seberapa terlindung pemain dari langit? Dihitung hotel-main.js (indoorK = di dalam ruangan beratap, cabin = kamera
// di dalam kabin mobil) lalu diteruskan lewat hotel-ambience.js tiap frame ke sini, supaya rain-boot.js (hujan, kilat, gelap) tahu kapan
// tidak boleh menggambar hujan di layar. Disimpan di globalThis agar tetap satu walau modul dimuat dari dua pintu masuk halaman.
// Bila datanya basi (>1 dtk, mis. suara sekitar mati karena galat) pembaca memakai cadangan yang dihitung dari window.__hotel.

const KEY = '__nikoraShelter';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Dipanggil tiap frame oleh hotel-ambience.js: indoor 0..1 (indoorK), cabin = kamera di kabin mobil. */
export function publishShelter({ indoor = 0, cabin = false } = {}, now = Date.now()) {
  globalThis[KEY] = { indoor: clamp(Number(indoor) || 0, 0, 1), cabin: !!cabin, at: now };
}

/**
 * Keadaan teduh sekarang: { indoor, cabin, k, fresh }. k = 0 (langit terbuka) .. 1 (di dalam ruangan atau kabin mobil).
 * fallback() => { indoor, cabin } dipakai bila belum ada data segar.
 */
export function readShelter({ now = Date.now(), maxAge = 1000, fallback } = {}) {
  const s = globalThis[KEY];
  if (s && now - s.at <= maxAge) return { indoor: s.indoor, cabin: s.cabin, k: Math.max(s.indoor, s.cabin ? 1 : 0), fresh: true };
  let f = null;
  try {
    f = fallback?.() ?? null;
  } catch {
    f = null;
  }
  const indoor = clamp(Number(f?.indoor) || 0, 0, 1);
  const cabin = !!f?.cabin;
  return { indoor, cabin, k: Math.max(indoor, cabin ? 1 : 0), fresh: false };
}

/** Cadangan dari window.__hotel (pengujian hotel-main.js): lantai atas atau ruangan beratap = teduh; kamera kabin saat mengemudi = teduh. */
export function hotelFallback(hotel = globalThis.window?.__hotel) {
  try {
    const st = hotel?.state?.();
    const place = st?.place;
    const indoor = (st?.level ?? 0) > 0 || (!!place?.indoor && !!place?.inside);
    const cabin = !!hotel?.cockpit?.() && !!hotel?.driving?.();
    return { indoor: indoor ? 1 : 0, cabin };
  } catch {
    return { indoor: 0, cabin: false };
  }
}
