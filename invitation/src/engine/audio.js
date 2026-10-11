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
