/**
 * Efek suara sintetis (tanpa berkas audio). Baru aktif setelah sentuhan pertama tamu,
 * sesuai aturan autoplay browser, dan bisa dimatikan.
 */
export function createAudio(sfx = { wave: 'sine', notes: [523.25, 659.25] }) {
  let ac = null;
  let muted = false;

  const ready = () => ac && !muted && ac.state !== 'closed';

  return {
    get muted() { return muted; },
    setMuted(v) { muted = !!v; },
    unlock() {
      if (ac || typeof window === 'undefined') return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try { ac = new Ctx(); if (ac.resume) ac.resume(); } catch { ac = null; }
    },
    /** Gesekan kertas: derau pendek lewat filter bandpass. */
    paper() {
      if (!ready()) return;
      const len = Math.floor(ac.sampleRate * 0.35);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
      const g = ac.createGain(); g.gain.value = 0.18;
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
    },
    /** Kertas robek: derau berdenyut cepat (serat putus satu per satu) lewat filter pas tinggi. */
    tear() {
      if (!ready()) return;
      const sr = ac.sampleRate, len = Math.floor(sr * .75), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0), step = Math.floor(sr * .012);
      let g = .3;
      for (let i = 0; i < len; i++) {
        if (i % step === 0) g = .15 + Math.random() * .85;
        d[i] = (Math.random() * 2 - 1) * g * Math.pow(1 - i / len, .7) * Math.min(1, i / (sr * .02));
      }
      const src = ac.createBufferSource(); src.buffer = buf;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 3200; pk.gain.value = 6;
      const gn = ac.createGain(); gn.gain.value = .26;
      src.connect(hp); hp.connect(pk); pk.connect(gn); gn.connect(ac.destination); src.start();
    },
    /** Dentang pendek sesuai nada khas tema. */
    chime() {
      if (!ready()) return;
      const t0 = ac.currentTime;
      sfx.notes.forEach((freq, i) => {
        const o = ac.createOscillator(); o.type = sfx.wave; o.frequency.value = freq;
        const g = ac.createGain(); const t = t0 + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.95);
      });
    },
    close() { if (ac && ac.close) ac.close().catch(() => {}); ac = null; },
  };
}
