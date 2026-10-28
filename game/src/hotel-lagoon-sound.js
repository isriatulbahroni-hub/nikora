// Suara air terjun Taman Lagoon (WebAudio, disintesis dari derau tanpa berkas audio): gemuruh air jatuh, desis percikan, dan debur kolam penampung.
// Volume, peredaman di dalam ruangan, dan panning stereo dihitung murni di hotel-lagoon-data.js (lagoonSoundLevel, soundPan; diuji di
// hotel-lagoon-data.test.js). Mesin audio baru dibuat saat pemain pertama kali menyentuh layar atau menekan tombol (aturan autoplay peramban),
// berhenti saat tab disembunyikan. ?suara=0 atau ?lagoon=0 mematikannya.
import { lagoonSoundLevel, soundPan } from './hotel-lagoon-data.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Mengembalikan { update({ x, z, fx, fz, active, indoor, cabin, rain }), info(), dispose() }.
 * (x, z) = posisi pendengar (kamera), (fx, fz) = arah pandang kamera di bidang datar, active = false di lantai atas / selama perjalanan.
 */
export function createLagoonSound({ search = '' } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const params = new URLSearchParams(search);
  const off = !AC || params.get('suara') === '0' || params.get('lagoon') === '0';
  if (off) return { update() {}, info: () => ({ on: false }), dispose() {} };

  let ctx = null;
  let master = null; // volume total (mengikuti jarak)
  let roarLow = null; // lowpass gemuruh: makin jauh makin tumpul
  let hiss = null; // gain desis percikan: hilang lebih dulu saat menjauh
  let panner = null;
  let dead = false;
  let last = { gain: 0, distance: Infinity, pan: 0 };
  const events = ['pointerdown', 'keydown', 'touchstart'];

  function noiseSource(brown) {
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b = (b + white * 0.12) * 0.985; // derau cokelat: gemuruh, bukan desis
      data[i] = brown ? white * 0.4 + b * 3 : white;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = 0;
    panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      master.connect(panner);
      panner.connect(ctx.destination);
    } else master.connect(ctx.destination);

    // gemuruh utama: derau cokelat disaring 90 Hz .. ~3 kHz
    const roar = ctx.createGain();
    roar.gain.value = 1;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    roarLow = ctx.createBiquadFilter();
    roarLow.type = 'lowpass';
    roarLow.frequency.value = 1200;
    noiseSource(true).connect(hp);
    hp.connect(roarLow);
    roarLow.connect(roar);
    roar.connect(master);

    // desis percikan: derau putih, pita sempit di sekitar 4 kHz
    hiss = ctx.createGain();
    hiss.gain.value = 0.2;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 4200;
    band.Q.value = 0.6;
    noiseSource(false).connect(band);
    band.connect(hiss);
    hiss.connect(master);

    // debur kolam penampung: gemuruh rendah yang naik-turun pelan
    const plunge = ctx.createGain();
    plunge.gain.value = 0.5;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 260;
    noiseSource(true).connect(low);
    low.connect(plunge);
    plunge.connect(master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.31;
    const depth = ctx.createGain();
    depth.gain.value = 0.18;
    lfo.connect(depth);
    depth.connect(plunge.gain);
    lfo.start();
  }

  const start = () => {
    if (ctx || dead) return;
    try {
      ctx = new AC();
      build();
      ctx.resume?.();
    } catch (error) {
      console.warn('[lagoon] suara air terjun tidak bisa dimulai', error);
      dead = true;
      ctx = null;
    }
  };
  const onVisibility = () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.();
    else ctx.resume?.();
  };
  for (const e of events) addEventListener(e, start, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return {
    update({ x = 0, z = 0, fx = 0, fz = -1, active = true, indoor = 0, cabin = false, rain = 0 } = {}) {
      const level = lagoonSoundLevel({ x, z, active, indoor, cabin, rain });
      const pan = level.source ? soundPan({ x, z, fx, fz }, level.source) : 0;
      last = { gain: level.gain, distance: level.distance, pan };
      if (!ctx || !master) return;
      if (ctx.state === 'suspended' && !document.hidden) ctx.resume?.();
      const t = ctx.currentTime;
      const near = clamp((90 - level.distance) / 80, 0, 1); // 0 jauh .. 1 dekat
      master.gain.setTargetAtTime(level.gain, t, 0.35);
      roarLow.frequency.setTargetAtTime(700 + 2300 * near, t, 0.4);
      hiss.gain.setTargetAtTime(0.1 + 0.5 * near, t, 0.4);
      panner?.pan.setTargetAtTime(pan, t, 0.25);
    },
    info: () => ({ on: !!ctx, ...last }),
    dispose() {
      dead = true;
      for (const e of events) removeEventListener(e, start);
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        ctx?.close?.();
      } catch {
        /* sudah tertutup */
      }
      ctx = null;
    },
  };
}
