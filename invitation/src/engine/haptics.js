export const HAPTIC = { tick: 8, complete: [30, 40, 70], tear: [18, 24, 18, 24, 34] };

/** Getar perangkat bila didukung; aman dipanggil di mana saja (mengembalikan true bila getar dijalankan). */
export function buzz(pattern, nav = typeof navigator !== 'undefined' ? navigator : null) {
  try { return !!(nav && typeof nav.vibrate === 'function' && nav.vibrate(pattern)); } catch { return false; }
}
