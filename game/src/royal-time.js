// Siklus langit Istana Cinta: nilai malam 0 (senja keemasan) .. 1 (malam bertabur bintang), murni dan bisa diuji.
export const CYCLE_MS = 20 * 60 * 1000;

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * mode 'sunset' = selalu senja, 'night' = selalu malam, 'auto' = siklus bersama berbasis jam dinding
 * (semua klien melihat langit yang sama tanpa saling kirim pesan): senja → peralihan → malam → peralihan.
 */
export function nightAt(mode, now, epoch = 0, cycle = CYCLE_MS) {
  if (mode === 'sunset') return 0;
  if (mode === 'night') return 1;
  const u = ((((now - epoch) % cycle) + cycle) % cycle) / cycle;
  if (u < 0.42) return 0;
  if (u < 0.58) return smooth((u - 0.42) / 0.16);
  if (u < 0.92) return 1;
  return 1 - smooth((u - 0.92) / 0.08);
}

/** Mendekatkan nilai `cur` ke `target` paling banyak `rate` per detik (peralihan langit yang halus). */
export const approach = (cur, target, dt, rate = 0.25) => cur + Math.max(-dt * rate, Math.min(dt * rate, target - cur));
