// Suara sekitar hotel (WebAudio, disintesis tanpa berkas): angin, dengung lalu lintas jauh, kicau burung di siang hari, jangkrik di malam hari.
// Tingkat suara dihitung murni di ambienceLevels (diuji di hotel-ambience.test.js); mesin audio baru dibuat saat pemain pertama kali menyentuh
// layar atau menekan tombol (aturan autoplay peramban). Pelan dan meredup di dalam ruangan dan di kabin mobil. ?suara=0 mematikannya.
// Yang SUDAH ada dan tidak diulang: suara mesin, klakson, dan pintu mobil (car-audio.js), suara lift, air, dan masjid di halaman masing-masing.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Tingkat tiap lapisan suara 0..1. night 0..1 (nightLevel), rain 0..1, indoor 0..1 (indoorK), cabin = kamera di dalam kabin mobil. */
export function ambienceLevels({ night = 0, rain = 0, indoor = 0, cabin = false } = {}) {
  const n = clamp(night, 0, 1);
  const r = clamp(rain, 0, 1);
  const i = clamp(indoor, 0, 1);
  const base = (1 - 0.8 * i) * (cabin ? 0.55 : 1);
  return {
    wind: (0.25 + 0.55 * r) * base,
    traffic: (0.5 + 0.5 * (1 - n)) * base,
    birds: (1 - smooth(0.15, 0.6, n)) * (1 - clamp(r * 2.2, 0, 1)) * base,
    crickets: smooth(0.35, 0.8, n) * (1 - clamp(r * 1.6, 0, 1)) * base,
  };
}

const MAX = Object.freeze({ wind: 0.05, traffic: 0.035, crickets: 0.03, birds: 0.05 });

/**
 * Mengembalikan { update({ time, night, rain, indoor, cabin }), info(), dispose() }. Tanpa WebAudio atau dengan ?suara=0 semuanya tidak berbuat apa-apa.
 * time = detik jam game (menjadwalkan kicau).
 */
export function createHotelAmbience({ search = '' } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const off = !AC || new URLSearchParams(search).get('suara') === '0';
  if (off) return { update() {}, info: () => ({ on: false }), dispose() {} };

  let ctx = null;
  let bus = null; // gain per lapisan
  let nextChirp = 0;
  let last = { wind: 0, traffic: 0, birds: 0, crickets: 0 };

  const noiseSource = () => {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  };
  const gain = (value = 0) => {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  };

  function build() {
    const master = gain(0.9);
    master.connect(ctx.destination);
    bus = { wind: gain(), traffic: gain(), crickets: gain(), birds: gain() };
    for (const g of Object.values(bus)) g.connect(master);
    const wind = ctx.createBiquadFilter();
    wind.type = 'lowpass';
    wind.frequency.value = 700;
    noiseSource().connect(wind);
    wind.connect(bus.wind);
    const hum = ctx.createBiquadFilter();
    hum.type = 'lowpass';
    hum.frequency.value = 180;
    noiseSource().connect(hum);
    hum.connect(bus.traffic);
    const cricket = ctx.createOscillator();
    cricket.frequency.value = 4300;
    const am = gain(0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const depth = gain(0.5);
    lfo.connect(depth);
    depth.connect(am.gain);
    cricket.connect(am);
    am.connect(bus.crickets);
    cricket.start();
    lfo.start();
  }

  function chirp(t0, f0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.45, t0 + 0.07);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o.connect(g);
    g.connect(bus.birds);
    o.start(t0);
    o.stop(t0 + 0.1);
  }

  const start = () => {
    if (ctx) return;
    try {
      ctx = new AC();
      build();
      ctx.resume?.();
    } catch {
      ctx = null;
    }
  };
  addEventListener('pointerdown', start, { once: true });
  addEventListener('keydown', start, { once: true });

  return {
    update({ time = 0, night = 0, rain = 0, indoor = 0, cabin = false } = {}) {
      if (!ctx || !bus) return;
      last = ambienceLevels({ night, rain, indoor, cabin });
      for (const k of Object.keys(bus)) bus[k].gain.setTargetAtTime(last[k] * MAX[k], ctx.currentTime, 0.8);
      if (last.birds > 0.05 && time >= nextChirp) {
        const f0 = 2300 + Math.random() * 1500;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) chirp(ctx.currentTime + 0.02 + i * 0.13, f0 * (1 + 0.06 * i));
        nextChirp = time + (1.5 + Math.random() * 5) / (0.3 + last.birds);
      }
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
    },
  };
}
