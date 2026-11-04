// Suara semua kendaraan di sekitar hotel (WebAudio sintetis, tanpa berkas): mesin mobil, motor, bus, dan truk lalu lintas Lingkar NIKORA,
// mesin mobil pemain lain, klakson, dan benturan. Dulu hanya mesin mobil yang dikemudikan sendiri yang bersuara (car-audio.js); lalu lintas senyap.
// Hanya beberapa kendaraan terdekat yang dibunyikan (MAX_VOICES) supaya HP tidak berat; dengung lalu lintas jauh tetap di hotel-ambience.js.
// Parameter suara dihitung murni (voiceParams, panOf, pickSources, diuji di hotel-traffic-audio.test.js); mesin audio baru dibuat saat pemain
// pertama kali menyentuh layar atau menekan tombol (aturan autoplay peramban). ?suara=0 mematikannya.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SOUND_SPEED = 343; // m/s

/**
 * Watak mesin tiap jenis: idleHz = nada dasar saat diam, perMs = tambahan Hz per m/s laju, maxHz = batas atas,
 * cutoff = bukaan saringan (Hz), gain = kekerasan relatif, range = jarak (m) di mana suaranya habis.
 * Mobil: gemuruh rendah; motor: raungan tinggi yang berdenging; bus dan truk: diesel berat yang dalam.
 */
export const VOICE = Object.freeze({
  motor: Object.freeze({ idleHz: 36, perMs: 5.2, maxHz: 230, cutoff: 2400, gain: 0.6, range: 80 }),
  car: Object.freeze({ idleHz: 24, perMs: 2.8, maxHz: 150, cutoff: 1000, gain: 0.6, range: 95 }),
  bus: Object.freeze({ idleHz: 18, perMs: 1.6, maxHz: 85, cutoff: 560, gain: 0.9, range: 120 }),
  truck: Object.freeze({ idleHz: 17, perMs: 1.5, maxHz: 80, cutoff: 520, gain: 0.9, range: 120 }),
});
export const LEVEL = 0.12; // kekerasan dasar satu kendaraan di dekat pemain
export const MAX_VOICES = 6;
export const MAX_VOICES_LOW = 4;

/** Kerasnya menurut jarak: penuh di 0, habis di range, jatuh kuadrat. */
export const hear = (distance, range) => (1 - clamp(distance / range, 0, 1)) ** 2;

/** Pengali nada akibat efek Doppler. radial = laju mendekat (m/s, positif = mendekati pendengar). */
export const doppler = (radial) => clamp(SOUND_SPEED / (SOUND_SPEED - clamp(radial, -60, 60)), 0.82, 1.22);

/**
 * Nada dan kekerasan satu kendaraan. speed (m/s, >= 0), distance (m), radial (m/s mendekat), indoor 0..1 (di dalam ruangan), cabin (kamera di kabin mobil).
 * Mengembalikan { hz, subHz, cutoff, gain }; gain 0 bila di luar jangkauan.
 */
export function voiceParams(kind, { speed = 0, distance = 0, radial = 0, indoor = 0, cabin = false } = {}) {
  const k = VOICE[kind] ?? VOICE.car;
  const hz = clamp(k.idleHz + k.perMs * Math.max(0, speed), k.idleHz, k.maxHz) * doppler(radial);
  const load = 0.45 + 0.55 * clamp(speed / 22, 0, 1); // mesin yang menderu lebih keras daripada yang idle
  const shield = (1 - 0.85 * clamp(indoor, 0, 1)) * (cabin ? 0.5 : 1);
  const near = 1 - clamp(distance / k.range, 0, 1);
  return {
    hz,
    subHz: hz * 0.5,
    cutoff: k.cutoff * (0.45 + 0.55 * near) * (cabin ? 0.6 : 1), // makin jauh makin redup (udara menyerap nada tinggi)
    gain: LEVEL * k.gain * load * hear(distance, k.range) * shield,
  };
}

/** Geseran kiri-kanan -1..1 sumber suara terhadap pendengar yang menghadap yaw (konvensi kamera hotel-main.js: kanan = (cos yaw, -sin yaw)). */
export function panOf(listener, src) {
  const dx = src.x - listener.x;
  const dz = src.z - listener.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return 0;
  return clamp((0.9 * (dx * Math.cos(listener.yaw) + dz * -Math.sin(listener.yaw))) / d, -1, 1);
}

/** Laju mendekat (m/s) sumber (vx, vz) terhadap pendengar (boleh bergerak: vx, vz). */
export function radialSpeed(listener, src) {
  const dx = src.x - listener.x;
  const dz = src.z - listener.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return 0;
  const away = ((src.vx ?? 0) * dx + (src.vz ?? 0) * dz) / d;
  const toward = ((listener.vx ?? 0) * dx + (listener.vz ?? 0) * dz) / d;
  return toward - away;
}

/** Pilih sumber suara yang masuk jangkauan, terdekat dulu, paling banyak `max`. Mengembalikan salinan dengan dist. */
export function pickSources(listener, sources, max = MAX_VOICES) {
  const out = [];
  for (const s of sources) {
    const k = VOICE[s.kind] ?? VOICE.car;
    const dist = Math.hypot(s.x - listener.x, s.z - listener.z);
    if (dist < k.range) out.push({ ...s, dist });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, max);
}

// klakson tiap jenis: [nada 1, nada 2 (0 = tunggal), lama detik]
const HORN = Object.freeze({ car: [415, 523, 0.38], motor: [680, 0, 0.16], bus: [255, 320, 0.7], truck: [196, 247, 0.8] });

/**
 * Mengembalikan { update({ listener, sources, indoor, cabin }), bump(strength, distance), horn(kind, distance), info(), dispose() }.
 * listener = { x, z, yaw, vx?, vz? }; sources = [{ id, kind, x, z, speed, vx, vz }]. Tanpa WebAudio atau dengan ?suara=0 tidak berbunyi.
 */
export function createTrafficAudio({ search = '', low = false } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const off = !AC || new URLSearchParams(search).get('suara') === '0';
  if (off) return { update() {}, bump() {}, horn() {}, info: () => ({ on: false, voices: 0 }), dispose() {} };

  const maxVoices = low ? MAX_VOICES_LOW : MAX_VOICES;
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  const voices = new Map(); // id sumber -> suara
  const curve = (() => {
    const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) c[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
    return c;
  })();

  const start = () => {
    if (ctx) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      ctx.resume?.();
    } catch {
      ctx = null;
    }
  };
  if (typeof addEventListener === 'function') {
    addEventListener('pointerdown', start, { once: true });
    addEventListener('keydown', start, { once: true });
  }

  const noise = () => {
    if (!noiseBuf) {
      const n = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    }
    return noiseBuf;
  };

  function build(kind) {
    const k = VOICE[kind] ?? VOICE.car;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.9;
    lp.frequency.value = k.cutoff;
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = k.idleHz;
    const b = ctx.createOscillator(); // lapisan kedua: subharmonik (mobil, bus, truk) atau nada berselisih tipis (motor: raungan berdenyut)
    b.type = kind === 'motor' ? 'sawtooth' : 'triangle';
    b.frequency.value = k.idleHz * (kind === 'motor' ? 1.01 : 0.5);
    const bGain = ctx.createGain();
    bGain.gain.value = kind === 'motor' ? 0.5 : 0.8;
    a.connect(shaper);
    b.connect(bGain);
    bGain.connect(shaper);
    shaper.connect(lp);
    lp.connect(out);
    if (pan) {
      out.connect(pan);
      pan.connect(master);
    } else out.connect(master);
    a.start();
    b.start();
    return { kind, a, b, lp, out, pan };
  }

  function release(v) {
    v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => {
      for (const o of [v.a, v.b]) { try { o.stop(); } catch { /* sudah berhenti */ } }
      v.out.disconnect();
    }, 450);
  }

  return {
    update({ listener, sources = [], indoor = 0, cabin = false } = {}) {
      if (!ctx || !listener) return;
      const t = ctx.currentTime;
      const chosen = pickSources(listener, sources, maxVoices);
      const live = new Set();
      for (const s of chosen) {
        live.add(s.id);
        let v = voices.get(s.id);
        if (!v) {
          v = build(s.kind);
          voices.set(s.id, v);
        }
        const p = voiceParams(s.kind, { speed: s.speed ?? 0, distance: s.dist, radial: radialSpeed(listener, s), indoor, cabin });
        v.a.frequency.setTargetAtTime(p.hz, t, 0.05);
        v.b.frequency.setTargetAtTime(s.kind === 'motor' ? p.hz * 1.01 : p.subHz, t, 0.05);
        v.lp.frequency.setTargetAtTime(p.cutoff, t, 0.1);
        v.out.gain.setTargetAtTime(p.gain, t, 0.08);
        v.pan?.pan.setTargetAtTime(panOf(listener, s), t, 0.1);
      }
      for (const [id, v] of voices) {
        if (live.has(id)) continue;
        release(v);
        voices.delete(id);
      }
    },
    /** Benturan: dentuman rendah dan kerusakan logam. strength = laju tabrakan (m/s), distance = jarak dari pendengar. */
    bump(strength = 8, distance = 0) {
      if (!ctx) return;
      const g = clamp(strength / 14, 0.18, 1) * hear(distance, 70) * 0.5;
      if (g < 0.02) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(36, t + 0.22);
      const og = ctx.createGain();
      og.gain.setValueAtTime(g, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(og);
      og.connect(master);
      o.start(t);
      o.stop(t + 0.32);
      const src = ctx.createBufferSource();
      src.buffer = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 850;
      f.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.value = g * 0.8;
      src.connect(f);
      f.connect(ng);
      ng.connect(master);
      src.start(t);
    },
    /** Klakson kendaraan lalu lintas menurut jenis dan jarak. */
    horn(kind = 'car', distance = 0) {
      if (!ctx) return;
      const [f1, f2, dur] = HORN[kind] ?? HORN.car;
      const g = hear(distance, 100) * 0.13;
      if (g < 0.004) return;
      const t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(g, t + 0.02);
      gain.gain.setTargetAtTime(0, t + dur, 0.03);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.connect(gain);
      gain.connect(master);
      for (const f of [f1, f2]) {
        if (!f) continue;
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.25);
      }
      setTimeout(() => gain.disconnect(), (dur + 0.4) * 1000);
    },
    info: () => ({ on: !!ctx, voices: voices.size }),
    dispose() {
      if (typeof removeEventListener === 'function') {
        removeEventListener('pointerdown', start);
        removeEventListener('keydown', start);
      }
      for (const v of voices.values()) release(v);
      voices.clear();
      const c = ctx;
      ctx = null;
      setTimeout(() => { try { c?.close?.(); } catch { /* sudah tertutup */ } }, 600);
    },
  };
}
