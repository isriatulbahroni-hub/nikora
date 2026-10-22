// Suara mobil (WebAudio sintetis, tanpa berkas audio): mesin mobil yang dikemudikan, klakson, bunyi pintu.
// Mesin pemain lain tidak disuarakan (hemat CPU HP); klakson dan pintu mobil mereka terdengar menurut jarak.
import { firingHz, rpmFor } from './car-models.js';

const TIMBRE = { smooth: { cutoff: 700, grit: 0.25 }, deep: { cutoff: 900, grit: 0.45 }, scream: { cutoff: 1800, grit: 0.7 } };
export const hearGain = (distance, range = 45) => Math.max(0, 1 - distance / range) ** 2;

/** Frekuensi dasar suara mesin (Hz) dan bukaan filter untuk sebuah mobil bermodel pada keadaan tertentu. Murni, diuji. */
export function engineSound(model, speed, throttle, engineOn = true) {
  const rpm = rpmFor(model, speed, throttle, engineOn);
  const t = TIMBRE[model.engine.timbre] ?? TIMBRE.smooth;
  const hz = Math.min(520, Math.max(22, firingHz(model, rpm) * 0.5));
  const load = 0.35 + 0.65 * Math.max(0, throttle);
  return { rpm, hz, cutoff: t.cutoff * (0.5 + rpm / model.engine.maxRpm) * (0.6 + 0.4 * load), gain: engineOn ? 0.05 + 0.09 * load : 0, grit: t.grit };
}

/** Decit ban: gain dan frekuensi filter dari selip (0..1) dan laju (m/s). Murni, diuji. Di bawah ambang selip = hening. */
export function tyreSound(slip, speed) {
  const s = Math.max(0, slip - 0.04) / 0.96;
  const v = Math.min(1, Math.abs(speed) / 30);
  return { gain: s > 0 ? Math.min(0.14, 0.14 * s ** 0.8 * (0.35 + 0.65 * v)) : 0, freq: 700 + 1100 * v + 500 * s };
}

export function createCarAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext ?? window.webkitAudioContext : null;
  let ctx = null;
  let master = null;
  let eng = null;
  let horn = null;
  let squeal = null;
  const ensure = () => {
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
      } catch {
        ctx = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  const tone = (type, freq, to) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    o.connect(to);
    return o;
  };

  function startEngine() {
    if (eng || !ensure()) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain);
    gain.connect(master);
    eng = { filter, gain, saw: tone('sawtooth', 60, filter), sub: tone('square', 30, filter), grit: tone('sawtooth', 61, filter) };
  }

  function startSqueal() {
    if (squeal || !ensure()) return;
    const n = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    squeal = { src, filter, gain };
  }

  return {
    /** Dipanggil tiap frame saat mengemudi (car = Vehicle). Mobil null = mesin berhenti. */
    engine(car) {
      if (!car) {
        if (eng) {
          const t = ctx.currentTime;
          eng.gain.gain.setTargetAtTime(0, t, 0.08);
          const dead = eng;
          eng = null;
          if (squeal) { const q = squeal; squeal = null; q.gain.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { try { q.src.stop(); } catch { /* sudah berhenti */ } q.gain.disconnect(); }, 300); }
          setTimeout(() => { for (const o of [dead.saw, dead.sub, dead.grit]) { try { o.stop(); } catch { /* sudah berhenti */ } } dead.gain.disconnect(); }, 400);
        }
        return;
      }
      startEngine();
      if (!eng) return;
      const s = engineSound(car.spec, car.speed, car.throttle ?? 0, car.engine);
      const t = ctx.currentTime;
      eng.saw.frequency.setTargetAtTime(s.hz, t, 0.04);
      eng.sub.frequency.setTargetAtTime(s.hz / 2, t, 0.04);
      eng.grit.frequency.setTargetAtTime(s.hz * (1 + 0.012 * s.grit * 4), t, 0.04);
      eng.filter.frequency.setTargetAtTime(s.cutoff, t, 0.05);
      eng.gain.gain.setTargetAtTime(s.gain, t, 0.05);
      const q = tyreSound(car.slip ?? 0, car.speed);
      if (q.gain > 0) startSqueal();
      if (squeal) {
        squeal.filter.frequency.setTargetAtTime(q.freq, t, 0.05);
        squeal.gain.gain.setTargetAtTime(q.gain, t, 0.04);
      }
    },
    /** Klakson dua nada; on=true mulai (pemain lokal, ditahan), on=false berhenti. */
    horn(on, gain = 0.16) {
      if (on && !horn && ensure()) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.02);
        g.connect(master);
        horn = { g, a: tone('square', 415, g), b: tone('square', 523, g) };
      } else if (!on && horn) {
        const h = horn;
        horn = null;
        h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        setTimeout(() => { try { h.a.stop(); h.b.stop(); } catch { /* sudah berhenti */ } h.g.disconnect(); }, 200);
      }
    },
    /** Klakson pendek mobil lain menurut jarak (m). */
    honkAt(distance) {
      const g = hearGain(distance, 70) * 0.16;
      if (g < 0.003 || !ensure()) return;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(g, ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.35, 0.03);
      gain.connect(master);
      const a = tone('square', 415, gain);
      const b = tone('square', 523, gain);
      setTimeout(() => { try { a.stop(); b.stop(); } catch { /* sudah berhenti */ } gain.disconnect(); }, 600);
    },
    /** Bunyi pintu tertutup/terbuka: dentuman pendek. */
    door(distance = 0) {
      const g = hearGain(distance, 30) * 0.5;
      if (g < 0.01 || !ensure()) return;
      const n = Math.floor(ctx.sampleRate * 0.14);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = g;
      src.connect(f);
      f.connect(gain);
      gain.connect(master);
      src.start();
    },
    unlock: () => { ensure(); },
    dispose() {
      this.engine(null);
      this.horn(false);
    },
  };
}
