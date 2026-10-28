// Getaran HP untuk badai (efek 4D, navigator.vibrate): guntur menggetarkan HP, makin keras makin lama dan berlapis. Murni + pembungkus kecil supaya diuji tanpa peramban.
// Dimatikan oleh ?getar=0, pengaturan "kurangi gerakan", atau tombol 4D (diatur rain-boot.js lewat `enabled`). iPhone/Safari tidak punya navigator.vibrate: tidak ada efek.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const THUNDER_COOLDOWN = 1.2; // detik antar getaran guntur

/** Pola getaran (ms hidup, mati, hidup, ...) untuk guntur sekeras `volume` 0..1; di dalam ruangan (shelter 1) teredam. [] = tidak bergetar. */
export function thunderPattern(volume, shelter = 0) {
  const v = clamp(Number(volume) || 0, 0, 1) * (1 - 0.3 * clamp(Number(shelter) || 0, 0, 1));
  if (v >= 0.7) return [90, 40, 140, 50, 220];
  if (v >= 0.4) return [60, 40, 120];
  if (v >= 0.12) return [35, 30, 60];
  return [];
}

export function createWeatherHaptics({ vibrate = (p) => globalThis.navigator?.vibrate?.(p), enabled = () => true, now = () => performance.now() / 1000 } = {}) {
  let next = -Infinity;
  return {
    /** Guntur berbunyi: getarkan HP. Mengembalikan pola yang dipakai ([] = tidak bergetar). */
    thunder(volume, shelter = 0) {
      if (!enabled()) return [];
      const pattern = thunderPattern(volume, shelter);
      if (!pattern.length) return [];
      const t = now();
      if (t < next) return [];
      next = t + THUNDER_COOLDOWN;
      try { vibrate(pattern); } catch { /* getaran gagal: abaikan */ }
      return pattern;
    },
  };
}
