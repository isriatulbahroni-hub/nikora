/**
 * Penakar tekan-tahan untuk segel lilin. Naik selama ditekan, turun pelan saat dilepas,
 * dan "terkunci" begitu penuh. Hanya mengukur DURASI sentuhan; tidak membaca sidik jari atau data biometrik apa pun.
 */
export function createHoldMeter({ holdSeconds = 1.8, release = 1.6 } = {}) {
  let v = 0, latched = false;
  return {
    get value() { return v; },
    get done() { return latched; },
    update(dt, pressed) {
      if (latched) return 1;
      v = pressed ? Math.min(1, v + dt / holdSeconds) : Math.max(0, v - (dt * release) / holdSeconds);
      if (v >= 1) latched = true;
      return v;
    },
    reset() { v = 0; latched = false; },
  };
}
