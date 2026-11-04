// Suara Bioskop 5D (WebAudio, disintesis dari derau tanpa berkas audio): gemuruh, angin, bisikan dari belakang (PannerNode HRTF), dan
// sentakan singkat saat kilatan. Saat air melewati kepala, seluruh suara diredam (lowpass). Mesin audio baru dibuat saat pemain pertama kali
// menyentuh layar atau menekan tombol (aturan autoplay peramban) dan dijeda saat tab disembunyikan. ?suara=0 atau ?bioskop=0 mematikannya.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Mengembalikan { update({ rumble, wind, whisper, underwater, active }), sting(), info(), dispose() }. */
export function createCinemaSound({ search = '' } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const params = new URLSearchParams(search);
  if (!AC || params.get('suara') === '0' || params.get('bioskop') === '0') return { update() {}, sting() {}, info: () => ({ on: false }), dispose() {} };

  let ctx = null;
  let g = null; // simpul-simpul yang diatur tiap frame
  let dead = false;
  let last = { rumble: 0, wind: 0, whisper: 0, underwater: false, active: false };
  const events = ['pointerdown', 'keydown', 'touchstart'];

  function noise(brown) {
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b = (b + white * 0.12) * 0.985;
      data[i] = brown ? white * 0.4 + b * 3 : white;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }
  const gain = (v = 0) => {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  };
  const filter = (type, freq, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };

  function build() {
    const muffle = filter('lowpass', 18000); // air di atas kepala: semua suara teredam
    muffle.connect(ctx.destination);
    const master = gain(0);
    master.connect(muffle);

    const rumble = gain(0); // gemuruh: derau cokelat, hanya frekuensi rendah
    noise(true).connect(filter('lowpass', 170)).connect(rumble);
    rumble.connect(master);

    const wind = gain(0); // angin: derau putih pita tengah
    noise(false).connect(filter('bandpass', 700, 0.6)).connect(wind);
    wind.connect(master);

    // bisikan: derau pita sempit yang naik-turun seperti ucapan, ditempatkan di belakang pendengar (z positif = belakang)
    const whisper = gain(0);
    const talk = gain(0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = gain(0.5);
    lfo.connect(depth);
    depth.connect(talk.gain);
    lfo.start();
    noise(false).connect(filter('bandpass', 2600, 3)).connect(talk);
    talk.connect(whisper);
    let out = whisper;
    if (ctx.createPanner) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      if (panner.positionX) {
        panner.positionX.value = -0.8;
        panner.positionY.value = 0;
        panner.positionZ.value = 1.6;
      } else panner.setPosition?.(-0.8, 0, 1.6);
      whisper.connect(panner);
      out = panner;
    }
    out.connect(master);

    const sting = gain(0); // sentakan singkat saat kilatan
    noise(false).connect(filter('lowpass', 2400)).connect(sting);
    sting.connect(master);
    g = { master, rumble, wind, whisper, muffle, sting };
    apply();
  }

  function apply() {
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    const set = (param, v, k = 0.12) => param.setTargetAtTime(v, t, k);
    set(g.master.gain, last.active ? 0.9 : 0, 0.25);
    set(g.rumble.gain, clamp(last.rumble, 0, 1) * 1.6);
    set(g.wind.gain, clamp(last.wind, 0, 1) * 0.5);
    set(g.whisper.gain, clamp(last.whisper, 0, 1) * 1.2);
    set(g.muffle.frequency, last.underwater ? 420 : 18000, 0.2);
  }

  function unlock() {
    if (dead) return;
    if (!ctx) {
      try {
        ctx = new AC();
        build();
      } catch {
        dead = true;
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  const onVisibility = () => {
    if (!ctx) return;
    if (globalThis.document?.hidden) ctx.suspend?.().catch?.(() => {});
    else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  for (const e of events) globalThis.addEventListener?.(e, unlock, { passive: true });
  globalThis.document?.addEventListener?.('visibilitychange', onVisibility);

  return {
    update({ rumble = 0, wind = 0, whisper = 0, underwater = false, active = false } = {}) {
      last = { rumble, wind, whisper, underwater, active };
      apply();
    },
    sting() {
      if (!ctx || !g) return;
      const t = ctx.currentTime;
      g.sting.gain.cancelScheduledValues(t);
      g.sting.gain.setValueAtTime(1.1, t);
      g.sting.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    },
    info: () => ({ on: !dead, started: !!ctx, ...last }),
    dispose() {
      dead = true;
      for (const e of events) globalThis.removeEventListener?.(e, unlock);
      globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
      try { ctx?.close?.(); } catch { /* sudah ditutup */ }
      ctx = null;
      g = null;
    },
  };
}
