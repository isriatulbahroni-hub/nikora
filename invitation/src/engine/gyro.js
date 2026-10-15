const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Orientasi perangkat -> kemiringan kamera. base = bacaan awal (posisi pegang netral). */
export function tiltFromOrientation(e, base = { beta: 45, gamma: 0 }, { range = 28, yaw = 0.4, pitch = 0.22 } = {}) {
  const beta = e && e.beta, gamma = e && e.gamma;
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { yaw: 0, pitch: 0 };
  return { yaw: clamp((gamma - base.gamma) / range, -1, 1) * yaw, pitch: clamp((beta - base.beta) / range, -1, 1) * pitch };
}

/**
 * Giroskop HP untuk efek paralaks. iOS meminta izin dan harus dipanggil dari gestur pengguna (mis. sentuhan segel).
 * start() mengembalikan false bila tidak didukung atau ditolak, tanpa melempar galat.
 */
export function createGyro({ onTilt, win = typeof window !== 'undefined' ? window : null }) {
  let base = null, handler = null, on = false;
  return {
    get active() { return on; },
    async start() {
      if (on) return true;
      if (!win || !win.DeviceOrientationEvent) return false;
      const DOE = win.DeviceOrientationEvent;
      if (typeof DOE.requestPermission === 'function') {
        try { if ((await DOE.requestPermission()) !== 'granted') return false; } catch { return false; }
      }
      handler = (e) => {
        if (e.beta == null || e.gamma == null) return;
        if (!base) base = { beta: e.beta, gamma: e.gamma };
        onTilt(tiltFromOrientation(e, base));
      };
      win.addEventListener('deviceorientation', handler);
      on = true;
      return true;
    },
    stop() { if (handler && win) win.removeEventListener('deviceorientation', handler); handler = null; base = null; on = false; },
  };
}
