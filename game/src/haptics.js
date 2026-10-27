// Getaran HP saat mobil menabrak (navigator.vibrate). Fungsi murni + pembungkus kecil supaya bisa diuji tanpa peramban.
// Benturan di bawah ambang diabaikan (sama dengan toast "Tabrakan!" di car-ride.js); makin keras makin lama getarannya.
// Jeda antar getaran mencegah HP menderu terus saat mobil menempel ke dinding. iPhone/Safari tidak punya navigator.vibrate: otomatis tidak ada efek.

export const CRASH_MIN_HIT = 6; // kekuatan benturan (m/s) minimal untuk bergetar
export const CRASH_COOLDOWN = 0.7; // detik

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Lama getaran (ms) untuk kekuatan benturan `hit`: 0 bila di bawah ambang, 35 ms sampai 260 ms. */
export function crashDuration(hit) {
  if (!(hit > CRASH_MIN_HIT)) return 0;
  return Math.round(clamp(35 + (hit - CRASH_MIN_HIT) * 9, 35, 260));
}

/** Pembuat pemicu getaran. `vibrate` bawaan navigator.vibrate (boleh tidak ada). now = detik jam game. Mengembalikan ms yang dipakai (0 = tidak bergetar). */
export function createCrashHaptics({ vibrate = (ms) => globalThis.navigator?.vibrate?.(ms) } = {}) {
  let next = -Infinity;
  return (hit, now) => {
    const ms = crashDuration(hit);
    if (ms === 0 || now < next) return 0;
    next = now + CRASH_COOLDOWN;
    try { vibrate(ms); } catch { /* getaran gagal: abaikan */ }
    return ms;
  };
}
