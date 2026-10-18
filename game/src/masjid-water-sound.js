// Suara gemericik air pancuran Taman Perenungan: derau disaring (tanpa berkas audio), volume mengikuti jarak ke pancuran terdekat
// dan mengecil di dalam bangunan. Mulai setelah sentuhan/tombol pertama (aturan autoplay browser), berhenti saat tab disembunyikan.
// Matikan dengan ?suara=0 pada alamat.
import { nearestFountain, waterGain } from './masjid-garden-data.js';

const disabled = () => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('suara') === '0';
  } catch {
    return false;
  }
};

export function createWaterSound() {
  const none = { update() {}, dispose() {} };
  if (typeof window === 'undefined' || typeof document === 'undefined' || disabled()) return none;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return none;

  let ctx = null;
  let gain = null;
  let dead = false;
  let last = { x: 0, z: 0, indoor: 0 };
  const events = ['pointerdown', 'keydown', 'touchstart'];

  const start = () => {
    if (ctx || dead) return;
    try {
      ctx = new AudioCtx();
      const len = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < len; i += 1) {
        brown = (brown + (Math.random() * 2 - 1) * 0.12) * 0.985; // derau cokelat: gemuruh air, bukan desis
        data[i] = (Math.random() * 2 - 1) * 0.55 + brown * 3;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp).connect(lp).connect(gain).connect(ctx.destination);
      src.start();
      push();
    } catch (error) {
      console.warn('[taman] suara air tidak bisa dimulai', error);
      dead = true;
    }
  };
  const push = () => {
    if (!ctx || !gain) return;
    const target = waterGain(nearestFountain(last.x, last.z)) * (1 - 0.85 * last.indoor);
    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.35);
  };
  const onVisibility = () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.();
    else ctx.resume?.();
  };
  for (const e of events) window.addEventListener(e, start, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return {
    /** Dipanggil tiap frame dengan posisi pemain dan tingkat "di dalam bangunan" (0..1). */
    update(x, z, indoor = 0) {
      last = { x, z, indoor };
      if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume?.();
      push();
    },
    dispose() {
      dead = true;
      for (const e of events) window.removeEventListener(e, start);
      document.removeEventListener('visibilitychange', onVisibility);
      ctx?.close?.();
    },
  };
}
