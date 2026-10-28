// Suara badai (WebAudio, disintesis tanpa berkas): desis hujan di udara terbuka, ketukan hujan di atap saat teduh (di dalam ruangan dan kabin mobil),
// dan guntur bergemuruh. Tingkatnya dihitung murni di storm-drama.js (rainAudio, thunderVolume). Mesin audio baru dibuat saat pemain pertama kali
// menyentuh layar atau menekan tombol (aturan autoplay peramban). Guntur di dalam ruangan lebih pelan dan lebih berat. ?suara=0 mematikannya.

import { rainAudio } from './storm-drama.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MAX = Object.freeze({ hiss: 0.14, roof: 0.1, thunder: 0.55 });

export function createStormSound({ search = '' } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const off = !AC || new URLSearchParams(search).get('suara') === '0';
  if (off) return { update() {}, thunder() {}, info: () => ({ on: false }), dispose() {} };

  let ctx = null;
  let bus = null;
  let noise = null;
  let last = { hiss: 0, roof: 0 };

  const gain = (v = 0) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const noiseBuffer = () => {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };
  const loop = () => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start();
    return src;
  };

  function build() {
    noise = noiseBuffer();
    const master = gain(0.9);
    master.connect(ctx.destination);
    bus = { hiss: gain(), roof: gain(), master };
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400;
    bp.Q.value = 0.5;
    loop().connect(hp);
    hp.connect(bp);
    bp.connect(bus.hiss);
    bus.hiss.connect(master);
    const roof = ctx.createBiquadFilter();
    roof.type = 'bandpass';
    roof.frequency.value = 650;
    roof.Q.value = 0.8;
    loop().connect(roof);
    roof.connect(bus.roof);
    bus.roof.connect(master);
  }

  const start = () => {
    if (ctx) return;
    try {
      ctx = new AC();
      build();
      ctx.resume?.();
    } catch {
      ctx = null;
      bus = null;
    }
  };
  addEventListener('pointerdown', start, { once: true });
  addEventListener('keydown', start, { once: true });

  return {
    /** level = tingkat hujan 0..1, shelter = 0 (terbuka) .. 1 (ruangan/kabin), cabin = kamera di kabin mobil. */
    update({ level = 0, shelter = 0, cabin = false } = {}) {
      if (!ctx || !bus) return;
      last = rainAudio({ level, shelter, cabin });
      bus.hiss.gain.setTargetAtTime(last.hiss * MAX.hiss, ctx.currentTime, 0.5);
      bus.roof.gain.setTargetAtTime(last.roof * MAX.roof, ctx.currentTime, 0.5);
    },
    /** Satu guntur: volume 0..1 (storm-drama.thunderVolume), shelter meredam dan memberatkan. */
    thunder(volume = 0.6, shelter = 0) {
      if (!ctx || !bus) return;
      const v = clamp(volume, 0, 1);
      const m = clamp(shelter, 0, 1);
      const t0 = ctx.currentTime + 0.02;
      const dur = 2.4 + v * 3.6;
      const peak = Math.max(0.0002, (0.5 + 0.5 * v) * (1 - 0.4 * m) * MAX.thunder);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(520 - 300 * m, t0);
      lp.frequency.exponentialRampToValueAtTime(70, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.06);
      // gemuruh bergelombang: naik turun beberapa kali (waktu selalu maju, jadi urutan otomasi aman)
      let t = t0 + 0.3;
      const bumps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bumps; i++) {
        t += 0.35 + Math.random() * 0.5;
        g.gain.exponentialRampToValueAtTime(peak * (0.4 + 0.45 * Math.random()), t);
        t += 0.35;
        g.gain.exponentialRampToValueAtTime(peak * (0.12 + 0.2 * Math.random()), t);
      }
      const end = Math.max(t + 0.6, t0 + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      src.connect(lp);
      lp.connect(g);
      g.connect(bus.master);
      src.start(t0);
      src.stop(end + 0.1);
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(58, t0);
      sub.frequency.exponentialRampToValueAtTime(34, t0 + dur);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.exponentialRampToValueAtTime(peak * 0.7, t0 + 0.12);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      sub.connect(sg);
      sg.connect(bus.master);
      sub.start(t0);
      sub.stop(t0 + dur + 0.1);
    },
    info: () => ({ on: !!ctx, levels: last }),
    dispose() {
      removeEventListener('pointerdown', start);
      removeEventListener('keydown', start);
      try {
        ctx?.close?.();
      } catch {
        /* sudah tertutup */
      }
      ctx = null;
      bus = null;
    },
  };
}
