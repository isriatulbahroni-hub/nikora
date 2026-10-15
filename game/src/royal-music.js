// Piano langsung Istana Cinta: musik generatif (progresi kanon, nada piano sintetis Web Audio) yang dijadwalkan dari
// jam dinding, jadi semua tamu mendengar nada yang sama pada saat yang sama tanpa mengirim audio.
// start() harus dipanggil dari gestur pengguna (kebijakan autoplay peramban).
const STEP_MS = 420;
const CHORDS = [[50, 57, 62, 66], [45, 52, 57, 61], [47, 54, 59, 62], [42, 49, 54, 57], [43, 50, 55, 59], [50, 57, 62, 66], [43, 50, 55, 59], [45, 52, 57, 61]];
const MELODY = [78, 76, 74, 73, 71, 69, 71, 73];
const PATTERN = [0, 1, 2, 3, 2, 1, 2, 3];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

/** Nada pada langkah ke-k (deterministik): { notes: [{ freq, dur, gain }] }. */
export function stepNotes(k) {
  const bar = Math.floor(k / 8) % CHORDS.length;
  const s = ((k % 8) + 8) % 8;
  const chord = CHORDS[bar];
  const out = [{ freq: midi(chord[PATTERN[s]] + 12), dur: 1.5, gain: 0.16 }];
  if (s === 0) {
    out.push({ freq: midi(MELODY[bar]), dur: 2.6, gain: 0.2 }, { freq: midi(chord[0] - 12), dur: 3, gain: 0.18 });
  }
  return out;
}

export function createPiano({ epoch = 0 } = {}) {
  let ctx = null;
  let master = null;
  let analyser = null;
  let timer = 0;
  let lastStep = -1;
  let on = false;
  const data = new Uint8Array(64);

  function schedule() {
    const now = Date.now();
    const upto = Math.floor((now + 450 - epoch) / STEP_MS);
    if (lastStep < 0) lastStep = upto - 1;
    for (let k = lastStep + 1; k <= upto; k++) {
      const when = ctx.currentTime + (epoch + k * STEP_MS - now) / 1000;
      if (when < ctx.currentTime - 0.05) continue;
      for (const n of stepNotes(k)) note(Math.max(when, ctx.currentTime), n);
    }
    lastStep = upto;
  }

  function note(when, { freq, dur, gain }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(master);
    for (const [mult, type, level] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3.01, 'sine', 0.12]]) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * mult;
      og.gain.value = level;
      osc.connect(og);
      og.connect(g);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    }
  }

  return {
    get on() { return on; },
    start() {
      if (on) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = ctx ?? new AC();
      if (!master) {
        master = ctx.createGain();
        master.gain.value = 0;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        const delay = ctx.createDelay(1);
        const feedback = ctx.createGain();
        const wet = ctx.createGain();
        delay.delayTime.value = 0.23;
        feedback.gain.value = 0.38;
        wet.gain.value = 0.28;
        master.connect(analyser);
        master.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(analyser);
        analyser.connect(ctx.destination);
      }
      ctx.resume?.();
      on = true;
      lastStep = -1;
      timer = setInterval(schedule, 100);
    },
    stop() {
      on = false;
      clearInterval(timer);
      master?.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
    /** Volume 0..1 (sudah memperhitungkan jarak ke piano). */
    setVolume(v) {
      if (master && on) master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.2);
    },
    /** Spektrum untuk visualizer, atau null bila musik mati. */
    spectrum() {
      if (!on || !analyser) return null;
      analyser.getByteFrequencyData(data);
      return data;
    },
    level() {
      if (!on || !analyser) return 0;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      return Math.min(1, sum / data.length / 90);
    },
  };
}
