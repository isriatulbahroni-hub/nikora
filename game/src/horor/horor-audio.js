// Audio prosedural untuk Mansion Horor: semua suara disintesis dengan WebAudio, tanpa berkas audio.
//
// Diport dari KantLex/yoru-no-gakko (MIT, Copyright (c) 2026 KantLex), src/02-audio.js.
// Teks lisensi ada di docs/horor/THIRD_PARTY_NOTICES.md.
// Perubahan: modul ES (ekspor `audio`), dibuang: baris suara pengisi suara (audio/voice, berlisensi ElevenLabs, bukan MIT),
// piano/nyanyian/lonceng sekolah dan efek khusus hantu game aslinya; dipertahankan: mesin suara ruang (reverb, bus,
// akustik per ruangan), langkah kaki, pintu, tembakan/kena, ambience drone, dan efek umum. Ditambah `close()`
// supaya GameHost.destroy() bisa melepas AudioContext.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
export const audio = {
  ctx: null, ready: false, lx: 0, lz: 0, rx: 1, rz: 0, loops: {},
  vol: { music: 1, sound: 1, voice: 1 }, duckK: 1, ducks: 0, acoustic: 'room',
  /** Lepas AudioContext (dipanggil saat permainan di-destroy). Aman dipanggil berulang. */
  close() {
    try { this.ctx?.close?.(); } catch (_) { /* sudah tertutup */ }
    this.ctx = null; this.ready = false; this.loops = {};
  },
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    // A long, dark "empty corridor" impulse response
    const len = Math.floor(c.sampleRate * 3.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    this.verb = c.createConvolver(); this.verb.buffer = ir;
    const vl = c.createBiquadFilter(); vl.type = 'lowpass'; vl.frequency.value = 3200;
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.55;   // the room's send level (setAcoustics)
    this.verbFix = c.createGain(); this.verbFix.gain.value = 0.55; // music keeps the same reverb everywhere
    this.verbIn.connect(vl).connect(this.verb).connect(this.master); this.verbFix.connect(vl);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // category buses: dry → master, wet → reverb, both at volume × duck, so 0 silences the reverb send too
    this.bus = {};
    for (const k of ['music', 'sfx', 'amb', 'voice']) {
      const dry = c.createGain(), wet = c.createGain();
      dry.gain.value = wet.gain.value = this.busLvl(k);
      dry.connect(this.master); wet.connect(k === 'music' ? this.verbFix : this.verbIn);
      this.bus[k] = { dry, wet };
    }
    // footstep echo: a short slap-back whose repeats get darker (on in corridors, stairwells, halls)
    this.echoIn = c.createGain(); this.echoIn.gain.value = 0;
    this.echoDelay = c.createDelay(0.5); this.echoDelay.delayTime.value = 0.12;
    const el = c.createBiquadFilter(); el.type = 'lowpass'; el.frequency.value = 1500;
    const fb = c.createGain(); fb.gain.value = 0.35;
    this.echoIn.connect(this.echoDelay).connect(el); el.connect(fb).connect(this.echoDelay); el.connect(this.bus.sfx.dry);
    this.ready = true;
    this.drone();
    this.setAcoustics(this.acoustic);
  },
  // ── volumes (0..1 per category, perceptual curve) and voice ducking ──
  busLvl(k) {
    const v = k === 'music' ? this.vol.music : k === 'voice' ? this.vol.voice : this.vol.sound;
    return v * v * ((k === 'music' || k === 'amb') && this.vol.voice > 0 ? this.duckK : 1); // a muted line doesn't duck
  },
  applyVol(tc = 0.05, ks = ['music', 'sfx', 'amb', 'voice']) {
    if (!this.ready) return;
    const t = this.now();
    for (const k of ks) { const g = this.busLvl(k); this.bus[k].dry.gain.setTargetAtTime(g, t, tc); this.bus[k].wet.gain.setTargetAtTime(g, t, tc); }
  },
  setVolume(kind, v) { // kind: 'music' | 'sound' (sfx + ambience) | 'voice'; stored so it applies once build() runs
    if (!(kind in this.vol)) return;
    this.vol[kind] = clamp(+v || 0, 0, 1);
    this.applyVol();
  },
  duck(d) { // counted, so overlapping lines don't un-duck early
    this.ducks = Math.max(0, this.ducks + d);
    const on = this.ducks > 0;
    this.duckK = on ? 0.4 : 1; // about -8 dB
    this.applyVol(on ? 0.08 : 0.5, ['music', 'amb']);
  },
  // ── per-room acoustics: reverb send, footstep echo, roof wind ──
  ACOUSTICS: { room: [0.4, 0, 0.12], corridor: [0.75, 0.42, 0.13], stair: [0.7, 0.38, 0.1], tile: [0.85, 0, 0.1], hall: [0.95, 0.5, 0.16], outdoor: [0.06, 0, 0.12] },
  setAcoustics(kind = 'room') {
    this.acoustic = this.ACOUSTICS[kind] ? kind : 'room';
    if (!this.ready) return;
    const [send, echo, dt] = this.ACOUSTICS[this.acoustic], t = this.now();
    this.verbIn.gain.setTargetAtTime(send, t, 0.4);
    this.echoIn.gain.setTargetAtTime(echo, t, 0.3);
    this.echoDelay.delayTime.setTargetAtTime(dt, t, 0.2);
    this.roofWind.gain.setTargetAtTime(this.acoustic === 'outdoor' ? 0.24 : 0, t, 1.5);
  },
  now() { return this.ctx.currentTime; },
  // one-shots only while the clock runs: a context left suspended (pad-only input isn't a user activation) would
  // otherwise queue every sound at one frozen currentTime and play them all at once on the first click
  live() { return this.ready && this.ctx.state === 'running'; },
  listen(x, z, rx, rz) { this.lx = x; this.lz = z; this.rx = rx; this.rz = rz; },
  spatial(x, z) {
    if (x === undefined) return { g: 1, p: 0 };
    const dx = x - this.lx, dz = z - this.lz, d = Math.hypot(dx, dz);
    const g = clamp(1 - d / 20, 0, 1) ** 1.6;
    const p = d > 0.01 ? clamp((dx * this.rx + dz * this.rz) / d, -1, 1) * 0.75 : 0;
    return { g, p };
  },
  // Output chain for one sound: gain → pan → bus dry + reverb send (+ echo send)
  out(vol = 1, x, z, wet = 0.35, bus = 'sfx', echo = 0) {
    const c = this.ctx, s = this.spatial(x, z), b = this.bus[bus];
    const g = c.createGain(); g.gain.value = vol * s.g;
    const p = c.createStereoPanner(); p.pan.value = s.p;
    g.connect(p); p.connect(b.dry);
    if (wet > 0) { const w = c.createGain(); w.gain.value = wet; p.connect(w); w.connect(b.wet); }
    if (echo > 0) { const e = c.createGain(); e.gain.value = echo; p.connect(e); e.connect(this.echoIn); }
    return g;
  },
  env(param, t, a, peak, d, floor = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(floor, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(floor, t + a + d);
  },
  osc(type, f, t, dur, dest, peak = 0.3, a = 0.005) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    this.env(g.gain, t, a, peak, dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  },
  noise(t, dur, dest, peak = 0.3, a = 0.003, filt) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    let node = s;
    if (filt) { const f = c.createBiquadFilter(); f.type = filt.type; f.frequency.value = filt.f; f.Q.value = filt.q || 1; node.connect(f); node = f; if (filt.sweep) f.frequency.exponentialRampToValueAtTime(filt.sweep, t + dur); }
    this.env(g.gain, t, a, peak, dur);
    node.connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
    return s;
  },
  play(name, x, z, ...args) {
    if (!this.live()) return;
    try { this.sfx[name].call(this, this.now(), x, z, ...args); } catch (e) { console.warn(e); }
  },
  sfx: {
    step(t, x, z, surface = 'wood') {
      const f = { wood: 650, tile: 2400, lino: 1300, stair: 500 }[surface] || 900;
      this.noise(t, 0.07, this.out(0.35, x, z, 0.25, 'sfx', 0.9), 0.5, 0.002, { type: 'bandpass', f: f * rand(0.85, 1.15), q: 1.4 });
    },
    creak(t, x, z) {
      const c = this.ctx, o = this.out(0.35, x, z, 0.5), osc = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      osc.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 7;
      const curve = new Float32Array(16); for (let i = 0; i < 16; i++) curve[i] = 70 + Math.sin(i * 1.7) * 18 + rand(-10, 10) + i * 3;
      osc.frequency.setValueCurveAtTime(curve, t, 0.9);
      this.env(g.gain, t, 0.08, 0.5, 0.9);
      osc.connect(f).connect(g).connect(o); osc.start(t); osc.stop(t + 1.1);
      this.osc('sine', 65, t + 0.85, 0.3, o, 0.6);
    },
    swing(t, x, z) { this.noise(t, 0.2, this.out(0.5, x, z, 0.2), 0.45, 0.02, { type: 'bandpass', f: 300, q: 2, sweep: 2600 }); },
    hit(t, x, z) {
      const o = this.out(0.7, x, z, 0.3);
      this.noise(t, 0.08, o, 0.8, 0.001, { type: 'lowpass', f: 1800 });
      const s = this.osc('sine', 230, t, 0.18, o, 0.7); s.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    },
    kick(t, x, z) { const o = this.out(0.5, x, z, 0.2); this.noise(t, 0.06, o, 0.5, 0.001, { type: 'lowpass', f: 900 }); },
    hurt(t) {
      const o = this.out(0.6);
      this.noise(t, 0.22, o, 0.45, 0.01, { type: 'bandpass', f: 950, q: 3 });
      const s = this.osc('sine', 150, t, 0.25, o, 0.8); s.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    },
    sting(t, x, z, vol = 0.5) {
      const c = this.ctx, o = this.out(vol, undefined, undefined, 0.8, 'music'), f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.35); f.frequency.exponentialRampToValueAtTime(600, t + 2.2);
      f.connect(o);
      for (const n of [48, 49, 55, 60, 61, 66]) {
        const s = this.osc('sawtooth', midi(n) * rand(0.995, 1.005), t, 2.2, f, 0.12, 0.02);
        s.detune.linearRampToValueAtTime(-60, t + 2.2);
      }
      this.noise(t, 0.5, o, 0.25, 0.005, { type: 'highpass', f: 1500 });
    },
    pickup(t) { const o = this.out(0.35, undefined, undefined, 0.5); this.osc('sine', midi(88), t, 0.5, o, 0.4); this.osc('sine', midi(95), t + 0.09, 0.9, o, 0.35); },
    knock(t, x, z) {
      const o = this.out(0.8, x, z, 0.5);
      for (let i = 0; i < 3; i++) {
        this.noise(t + i * 0.42, 0.07, o, 0.7, 0.001, { type: 'lowpass', f: 700 });
        this.osc('sine', 110, t + i * 0.42, 0.1, o, 0.6);
      }
    },
    heart(t) { const o = this.out(0.9, undefined, undefined, 0); this.osc('sine', 55, t, 0.12, o, 0.8); this.osc('sine', 50, t + 0.24, 0.16, o, 0.6); },
    drip(t, x, z) { const s = this.osc('sine', 1500, t, 0.08, this.out(0.25, x, z, 0.9), 0.4); s.frequency.exponentialRampToValueAtTime(520, t + 0.07); },
    whisper(t) {
      const o = this.out(0.18, this.lx + rand(-6, 6), this.lz + rand(-6, 6), 0.9);
      for (let i = 0; i < 4; i++) this.noise(t + i * 0.22, 0.18, o, 0.35, 0.05, { type: 'bandpass', f: rand(1800, 4200), q: 6 });
    },
    thud(t) { const o = this.out(0.8, undefined, undefined, 0.6); this.osc('sine', 70, t, 0.4, o, 0.9); this.noise(t, 0.15, o, 0.4, 0.002, { type: 'lowpass', f: 400 }); },
    crash(t) { const o = this.out(0.5, undefined, undefined, 0.8); for (let i = 0; i < 9; i++) this.osc('triangle', midi(36 + ((i * 7) % 24)), t, 1.8, o, 0.12); this.noise(t, 0.3, o, 0.3, 0.001, { type: 'lowpass', f: 2000 }); },
    rumble(t, x, z, dur = 2.5) {
      const o = this.out(0.9, undefined, undefined, 0.5);
      const s = this.osc('sawtooth', 31, t, dur, o, 0.0001, 0.01);
      const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.value = 140;
      s.disconnect(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(o);
      this.noise(t, dur, o, 0.35, dur * 0.3, { type: 'lowpass', f: 220 });
    },
    slam(t) {
      const o = this.out(1, undefined, undefined, 0.6);
      const s = this.osc('sine', 90, t, 0.6, o, 1, 0.002); s.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      this.noise(t, 0.4, o, 0.8, 0.001, { type: 'lowpass', f: 900 });
      this.noise(t + 0.02, 0.9, o, 0.25, 0.01, { type: 'bandpass', f: 2600, q: 0.7 });
    },
    shutter(t, x, z) { // a fire shutter grinding up into the ceiling
      const c = this.ctx, o = this.out(0.6, x, z, 0.5), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
      s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 1.5;
      l.type = 'square'; l.frequency.value = 28; lg.gain.value = 0.25; l.connect(lg).connect(g.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.45, t + 0.2); g.gain.setValueAtTime(0.45, t + 2.0); g.gain.linearRampToValueAtTime(0, t + 2.4);
      s.connect(f).connect(g).connect(o); s.start(t); s.stop(t + 2.5); l.start(t); l.stop(t + 2.5);
      const sq = this.osc('triangle', 1700, t + 0.3, 1.6, o, 0.05, 0.2); sq.frequency.linearRampToValueAtTime(1500, t + 1.9);
      this.osc('sine', 70, t + 2.35, 0.3, o, 0.7);
    },
    hiss(t, x, z) { this.noise(t, 0.8, this.out(0.5, x, z, 0.4), 0.5, 0.1, { type: 'bandpass', f: 3600, q: 1.8 }); },
  },


  // ── continuous layers ──
  drone() {
    const c = this.ctx;
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0;
    this.droneGain.connect(this.bus.amb.dry);
    for (const f of [49, 52.3, 98.7]) {
      const o = c.createOscillator(); o.type = f > 90 ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = f > 90 ? 0.03 : 0.14; o.connect(g).connect(this.droneGain); o.start();
    }
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.7;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 220; lfo.connect(lg).connect(f.frequency); lfo.start();
    this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
    n.connect(f).connect(this.windGain).connect(this.droneGain); n.start();
    // dengung lampu neon (setBuzz)
    const hz = c.createOscillator(); hz.type = 'sawtooth'; hz.frequency.value = 100;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 500;
    this.buzzGain = c.createGain(); this.buzzGain.gain.value = 0;
    hz.connect(hf).connect(this.buzzGain).connect(this.bus.amb.dry); hz.start();
    // roof wind: gusting low noise plus a thin whistle; bypasses droneGain, only up outdoors (setAcoustics)
    const rn = c.createBufferSource(); rn.buffer = this.noiseBuf; rn.loop = true;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 600;
    const gust = c.createGain(); gust.gain.value = 0.55;
    for (const [fq, a] of [[0.11, 0.3], [0.043, 0.2]]) { const l = c.createOscillator(), g = c.createGain(); l.frequency.value = fq; g.gain.value = a; l.connect(g).connect(gust.gain); l.start(); }
    const wb = c.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 1400; wb.Q.value = 18;
    const wl = c.createOscillator(), wlg = c.createGain(), wg = c.createGain(); wl.frequency.value = 0.07; wlg.gain.value = 300; wg.gain.value = 0.7;
    wl.connect(wlg).connect(wb.frequency); wl.start();
    this.roofWind = c.createGain(); this.roofWind.gain.value = 0;
    rn.connect(rl).connect(gust); rn.connect(wb).connect(wg).connect(gust);
    gust.connect(this.roofWind).connect(this.bus.amb.dry); rn.start(0, 0.7);
  },
  setAmbience(level, wind = 0.05, buzz = 0) {
    if (!this.ready) return;
    const t = this.now();
    this.droneGain.gain.setTargetAtTime(level, t, 1.2);
    this.windGain.gain.setTargetAtTime(wind, t, 1.2);
    this.buzzGain.gain.setTargetAtTime(buzz, t, 0.3);
  },
  setBuzz(v) { if (this.ready) this.buzzGain.gain.setTargetAtTime(v, this.now(), 0.02); },
};
