// Getaran HP saat mobil menabrak (navigator.vibrate). Fungsi murni + pembungkus kecil supaya bisa diuji tanpa peramban.
// Benturan di bawah ambang diabaikan (sama dengan toast "Tabrakan!" di car-ride.js); makin keras makin lama getarannya.
// Jeda antar getaran mencegah HP menderu terus saat mobil menempel ke dinding. iPhone/Safari tidak punya navigator.vibrate: otomatis tidak ada efek.
// Di bawah ada getaran mesin dan sentakan pindah gigi (efek 4D mobil), diuji di haptics-engine.test.js.

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

// ---------- getaran mesin dan pindah gigi (efek 4D) ----------
export const ENGINE_GAP_IDLE = 0.34; // detik antar denyut saat idle
export const ENGINE_GAP_REDLINE = 0.11; // detik antar denyut di RPM tertinggi
export const SHIFT_MS = 22; // sentakan saat pindah gigi maju
export const SHIFT_COOLDOWN = 0.25; // detik

/** Denyut mesin untuk RPM 0..1: jeda (detik) dan lama (ms). Makin tinggi makin rapat dan makin kuat. */
export function engineBeat(rpmFrac) {
  const f = clamp(Number.isFinite(rpmFrac) ? rpmFrac : 0, 0, 1);
  return { gap: ENGINE_GAP_IDLE + (ENGINE_GAP_REDLINE - ENGINE_GAP_IDLE) * f, ms: Math.round(6 + 10 * f) };
}

const isForwardGear = (g) => /^\d+$/.test(String(g ?? ''));

/** ?getar=0 mematikan getaran mesin; pengaturan "kurangi gerakan" di sistem juga mematikannya. Getaran tabrakan tidak terpengaruh. */
export function engineHapticsEnabled(search = '', reducedMotion = false) {
  if (reducedMotion) return false;
  return new URLSearchParams(search).get('getar') !== '0';
}

/**
 * Pembuat getaran mesin. Dipanggil tiap frame: (now detik jam game, { on: mesin menyala, rpmFrac: 0..1, gear: 'N' | 'R' | '1'..'n' }).
 * Mengembalikan ms yang dipakai (0 = tidak bergetar). Pindah gigi maju (angka ke angka) memberi satu sentakan.
 */
export function createEngineHaptics({ vibrate = (ms) => globalThis.navigator?.vibrate?.(ms), enabled = true } = {}) {
  let next = -Infinity;
  let shiftNext = -Infinity;
  let lastGear = null;
  return (now, { on = false, rpmFrac = 0, gear = null } = {}) => {
    const prev = lastGear;
    lastGear = gear;
    if (!enabled || !on) return 0;
    const beat = engineBeat(rpmFrac);
    let ms = 0;
    if (isForwardGear(prev) && isForwardGear(gear) && prev !== gear && now >= shiftNext) {
      ms = SHIFT_MS;
      shiftNext = now + SHIFT_COOLDOWN;
      next = now + beat.gap;
    } else if (now >= next) {
      ms = beat.ms;
      next = now + beat.gap;
    }
    if (ms === 0) return 0;
    try { vibrate(ms); } catch { /* getaran gagal: abaikan */ }
    return ms;
  };
}
