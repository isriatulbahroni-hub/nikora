// Cermin Gerak: kemiringan HP (kiri/kanan) menjadi gestur avatar. Opt-in (tombol), dan hanya di perangkat yang punya sensor.
// Kiri sedang = membungkuk hormat, kanan sedang = melambai, miring sangat jauh (kiri/kanan) = berputar.
export const MIRROR = Object.freeze({ enter: 24, hard: 58, holdMs: 280, cooldownMs: 2200, settle: 9, maxJump: 70 });

/** Sudut miring kiri/kanan dari event orientasi, memperhitungkan layar landscape. Positif = miring ke kanan. */
export function rollFrom({ gamma = 0, beta = 0 } = {}, screenAngle = 0) {
  const a = ((Math.round(screenAngle) % 360) + 360) % 360;
  if (a === 90) return -beta;
  if (a === 270) return beta;
  return gamma;
}

export function classifyTilt(delta) {
  const d = Number.isFinite(delta) ? delta : 0;
  if (Math.abs(d) >= MIRROR.hard) return 'spin';
  if (d <= -MIRROR.enter) return 'bow';
  if (d >= MIRROR.enter) return 'wave';
  return null;
}

/**
 * Mesin status: baseline (pose HP netral saat dinyalakan) + zona tahan + jeda. Murni dan dapat diuji.
 * feed(roll, nowMs) -> nama gestur atau null. Gestur hanya keluar bila zona yang sama bertahan holdMs,
 * lalu jeda cooldownMs. Lonjakan sudut tak wajar (HP terguncang) diabaikan.
 */
export function createMirrorMachine() {
  let baseline = null;
  let zone = null;
  let zoneSince = 0;
  let cooldownUntil = 0;
  let last = null;
  let needNeutral = false; // setelah memicu, HP harus kembali ke netral dulu (menahan miring tidak memicu berulang)
  return {
    reset() { baseline = null; zone = null; last = null; needNeutral = false; },
    get baseline() { return baseline; },
    feed(roll, nowMs) {
      if (!Number.isFinite(roll) || !Number.isFinite(nowMs)) return null;
      if (baseline === null) { baseline = roll; last = roll; return null; }
      if (Math.abs(roll - last) > MIRROR.maxJump) { last = roll; return null; } // guncangan mendadak
      last = roll;
      const delta = roll - baseline;
      const now = classifyTilt(delta);
      if (now === null) {
        // di zona netral baseline bergeser pelan mengikuti cara memegang HP
        if (Math.abs(delta) < MIRROR.settle) baseline += delta * 0.02;
        zone = null;
        needNeutral = false;
        return null;
      }
      if (needNeutral) return null;
      // zona berubah (mis. wave -> spin) mengulang penghitungan tahan
      const side = Math.sign(delta);
      const key = `${now}${side}`;
      if (key !== zone) { zone = key; zoneSince = nowMs; return null; }
      if (nowMs - zoneSince >= MIRROR.holdMs && nowMs >= cooldownUntil) {
        cooldownUntil = nowMs + MIRROR.cooldownMs;
        zone = null;
        needNeutral = true;
        return now;
      }
      return null;
    },
  };
}

export function sensorAvailable(win = typeof window !== 'undefined' ? window : undefined) {
  return Boolean(win && 'DeviceOrientationEvent' in win);
}

/** iOS meminta izin lewat gestur pengguna; Android/Chrome langsung boleh (butuh HTTPS). */
export async function requestSensorPermission(win = typeof window !== 'undefined' ? window : undefined) {
  if (!sensorAvailable(win)) return false;
  const Ctor = win.DeviceOrientationEvent;
  if (typeof Ctor.requestPermission === 'function') {
    try {
      return (await Ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/** Pasang pendengar sensor. Mengembalikan fungsi untuk melepas. */
export function startMirror({ win = window, onGesture, clock = () => performance.now() }) {
  const machine = createMirrorMachine();
  const handler = (event) => {
    if (event.gamma == null && event.beta == null) return; // desktop mengirim event kosong
    const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    const gesture = machine.feed(rollFrom(event, angle), clock());
    if (gesture) onGesture(gesture);
  };
  win.addEventListener('deviceorientation', handler);
  return () => { win.removeEventListener('deviceorientation', handler); machine.reset(); };
}
