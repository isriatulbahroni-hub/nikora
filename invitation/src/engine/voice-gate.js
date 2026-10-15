const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/**
 * Gerbang suara opsional. Menerima nilai RMS mikrofon per bingkai dan memutuskan apakah ada orang yang berbicara.
 * Ini deteksi AKTIVITAS suara saja: tidak mengenali nama atau identitas, dan tidak menyimpan audio apa pun.
 *  - 0..calibrate detik: mengukur kebisingan latar sebagai ambang.
 *  - sesudahnya: bicara yang terkumpul >= need detik -> 'ok'. Letupan singkat tidak dihitung (decay).
 */
export function createVoiceGate({ calibrate = 0.5, need = 0.7, minRms = 0.02, margin = 2.6, decay = 0.5 } = {}) {
  let t = 0, sum = 0, n = 0, floor = 0, threshold = minRms, voiced = 0, state = 'calibrating';
  const snap = (rms) => ({ state, voiced, threshold, level: clamp(rms / (threshold * 2.2)) });
  return {
    feed(rms, dt) {
      if (state === 'ok') return snap(rms);
      t += dt;
      if (t <= calibrate) {
        sum += rms; n++; floor = sum / n; threshold = Math.max(minRms, floor * margin); state = 'calibrating';
      } else {
        state = 'listening';
        if (rms > threshold) voiced += dt; else voiced = Math.max(0, voiced - dt * decay);
        if (voiced >= need) state = 'ok';
      }
      return snap(rms);
    },
  };
}

/** RMS dari sampel domain waktu (-1..1). */
export function rmsOf(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return samples.length ? Math.sqrt(s / samples.length) : 0;
}
