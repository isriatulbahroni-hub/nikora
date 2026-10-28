// Suara mobil (WebAudio sintetis, tanpa berkas audio): mesin mobil yang dikemudikan, klakson, bunyi pintu.
// Mesin pemain lain tidak disuarakan (hemat CPU HP); klakson dan pintu mobil mereka terdengar menurut jarak.
import { firingHz, gearFor, rpmFor } from './car-models.js';

// w16 = watak mesin 16 silinder empat-turbo (NIKORA W16, Bugatti Chiron): geraman rendah tebal, harmonik atas lebih terbuka daripada "deep",
// desis dua turbo yang berbeda nada, letupan knalpot saat gas dilepas di putaran tinggi, dan blow-off panjang.
// Frekuensi pembakaran 16 silinder di putaran tinggi 500-900 Hz: bila hanya itu yang dibunyikan, suaranya tipis dan melengking (tanpa energi di bawah
// 400 Hz, terukur dari rekaman layar). Karena itu watak w16 punya lapisan "geraman" sendiri: dua gergaji sedikit berbeda nada pada seperempat-orde
// (growlHz), disaring rendah, sehingga 150-400 Hz terisi dan tetap terdengar di speaker HP; lapisan knalpotnya digelapkan dan dikurangi distorsinya.
const TIMBRE = { smooth: { cutoff: 700, grit: 0.25 }, deep: { cutoff: 900, grit: 0.45 }, scream: { cutoff: 1800, grit: 0.7 }, w16: { cutoff: 1300, grit: 0.55 } };
const SUB_BOOST = { deep: 1.4, w16: 1.6 };
const W16_DARK = 0.55; // pengali bukaan filter lapisan knalpot pada watak w16
const W16_EXHAUST = 0.7; // pengali volume lapisan knalpot pada watak w16 (geraman mengambil alih bagian rendahnya)
const W16_DRIVE_MAX = 3.2; // distorsi knalpot w16 dibatasi: drive tinggi membuat gelombang persegi yang berdengung
export const hearGain = (distance, range = 45) => Math.max(0, 1 - distance / range) ** 2;

/** Frekuensi dasar suara mesin (Hz) dan bukaan filter untuk sebuah mobil bermodel pada keadaan tertentu. Murni, diuji. */
export function engineSound(model, speed, throttle, engineOn = true) {
  const rpm = rpmFor(model, speed, throttle, engineOn);
  const t = TIMBRE[model.engine.timbre] ?? TIMBRE.smooth;
  const hz = Math.min(520, Math.max(22, firingHz(model, rpm) * 0.5));
  const load = 0.35 + 0.65 * Math.max(0, throttle);
  return { rpm, hz, cutoff: t.cutoff * (0.5 + rpm / model.engine.maxRpm) * (0.6 + 0.4 * load), gain: engineOn ? 0.05 + 0.09 * load : 0, grit: t.grit };
}

/** Decit ban: gain dan frekuensi filter dari selip (0..1) dan laju (m/s). Murni, diuji. Di bawah ambang selip = hening. */
export function tyreSound(slip, speed) {
  const s = Math.max(0, slip - 0.04) / 0.96;
  const v = Math.min(1, Math.abs(speed) / 30);
  return { gain: s > 0 ? Math.min(0.14, 0.14 * s ** 0.8 * (0.35 + 0.65 * v)) : 0, freq: 700 + 1100 * v + 500 * s };
}

/** Bobot harmonik (1..n) bunyi knalpot menurut watak mesin: halus = rendah dominan, dalam = rendah tebal, menjerit = harmonik tinggi kuat. */
export function harmonicWeights(timbre, cylinders, n = 12) {
  const slope = { smooth: 1.7, deep: 1.25, scream: 0.8, w16: 1.1 }[timbre] ?? 1.5;
  const w = [];
  for (let k = 1; k <= n; k++) {
    const evenBoost = cylinders % 4 === 0 && k % 2 === 0 ? 1.25 : 1; // mesin 4/8/12/16 silinder: harmonik genap lebih kuat
    w.push(evenBoost / k ** slope);
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/**
 * Semua lapisan suara mobil dari keadaan mobil (murni, diuji; bunyi sungguhan dirakit di createCarAudio).
 * state = { speed (m/s), throttle (-1..1), engineOn, boost (0..1, diratakan pemanggil), cabin (kamera di dalam kabin) }.
 * Lapisan: knalpot (frekuensi pembakaran + subharmonik setengah-orde), gerung gigi, desis intake, turbo (dua nada), angin, pemotong putaran (rev limiter),
 * letupan knalpot (crackle) saat gas dilepas di putaran tinggi, dan geraman rendah (growl, seperempat-orde) pada mesin watak w16.
 */
export function engineLayers(model, state) {
  const e = model.engine;
  const { speed = 0, throttle = 0, engineOn = true, boost = 0, cabin = false } = state;
  const rpm = rpmFor(model, speed, throttle, engineOn);
  const rpmFrac = engineOn ? Math.min(1, rpm / e.maxRpm) : 0;
  const load = Math.max(0, throttle);
  const fire = firingHz(model, rpm);
  const t = TIMBRE[e.timbre] ?? TIMBRE.smooth;
  const on = engineOn ? 1 : 0;
  const v = Math.min(1, Math.abs(speed) / Math.max(1, model.maxSpeed));
  const turboFreq = 1400 + 5200 * boost;
  return {
    rpm,
    rpmFrac,
    fireHz: Math.min(900, Math.max(24, fire)),
    subHz: Math.min(450, Math.max(12, fire / 2)),
    drive: 1 + 5 * load * (0.4 + 0.6 * rpmFrac), // pengeras tanh: gas dalam = geram
    exhaustGain: on * (0.05 + 0.1 * (0.35 + 0.65 * load)),
    subGain: on * (0.025 + 0.04 * (1 - rpmFrac)) * (SUB_BOOST[e.timbre] ?? 1),
    cutoff: (cabin ? 0.55 : 1) * t.cutoff * (0.5 + rpmFrac) * (0.6 + 0.4 * (0.35 + 0.65 * load)),
    growlHz: Math.min(240, Math.max(26, fire / 4)), // geraman: seperempat-orde pembakaran, jauh di bawah nada knalpot
    growlCut: 260 + 700 * rpmFrac, // bukaan saringan rendah geraman: makin tinggi putaran makin terbuka
    growlGain: e.timbre === 'w16' ? on * (0.18 + 0.12 * load) * (cabin ? 1.2 : 1) : 0,
    intakeFreq: 450 + 1300 * rpmFrac,
    intakeGain: on * load * rpmFrac * rpmFrac * (cabin ? 0.05 : 0.035),
    whineFreq: Math.min(2400, (rpm / 60) * 3.7),
    whineGain: on * (0.004 + 0.008 * v) * (Math.abs(speed) > 0.5 ? 1 : 0),
    turboFreq,
    turboGain: e.turbo ? on * boost * 0.018 : 0,
    turboFreq2: turboFreq * 1.5, // turbo kedua berputar di nada berbeda: desis empat turbo W16 lebih tebal daripada satu turbo
    turboGain2: e.turbo && e.timbre === 'w16' ? on * boost * 0.011 : 0,
    windGain: Math.min(0.12, 0.12 * v ** 2.2) * (cabin ? 0.55 : 1),
    windCut: 500 + 2600 * v,
    limiter: engineOn && rpmFrac > 0.97 && load > 0.5,
    crackle: engineOn && e.timbre === 'w16' && load < 0.1 && rpmFrac > 0.55 && Math.abs(speed) > 15,
    cabinLow: cabin ? 1.35 : 1, // di dalam kabin dentuman rendah lebih terasa
  };
}

/** Boost turbo diratakan: naik pelan saat gas dalam di putaran tinggi, jatuh cepat saat gas dilepas. */
export function nextBoost(prev, throttle, rpmFrac, dt) {
  const target = Math.max(0, throttle) * Math.min(1, rpmFrac * 1.4);
  const rate = target > prev ? 1.6 : 4.5;
  return prev + (target - prev) * (1 - Math.exp(-rate * dt));
}

export function createCarAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext ?? window.webkitAudioContext : null;
  let ctx = null;
  let master = null;
  let cabinFilter = null;
  let eng = null;
  let engModel = null;
  let horn = null;
  let squeal = null;
  let noiseBuf = null;
  let boost = 0;
  let lastGear = 0;
  let duckUntil = 0;
  let lastT = 0;
  let cabin = false;
  const ensure = () => {
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        cabinFilter = ctx.createBiquadFilter(); // kamera di kabin: bunyi luar teredam, dentuman rendah menonjol
        cabinFilter.type = 'lowpass';
        cabinFilter.frequency.value = cabin ? 3200 : 20000;
        cabinFilter.connect(master);
        master.connect(ctx.destination);
      } catch {
        ctx = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  const noise = () => {
    if (!noiseBuf) {
      const n = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.start();
    return src;
  };
  const tone = (type, freq, to) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    o.connect(to);
    return o;
  };
  const shaperCurve = (k) => {
    const n = 512;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return c;
  };

  function startEngine(model) {
    if (eng || !ensure()) return;
    engModel = model;
    const isW16 = model.engine.timbre === 'w16';
    const w = harmonicWeights(model.engine.timbre, model.engine.cylinders);
    const real = new Float32Array(w.length + 1);
    const imag = new Float32Array(w.length + 1);
    w.forEach((x, i) => { imag[i + 1] = x * 3; });
    const wave = ctx.createPeriodicWave(real, imag);
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(cabinFilter);

    // knalpot: harmonik pada frekuensi pembakaran + subharmonik setengah-orde, dipanaskan pengeras tanh, lalu resonansi pipa
    const exhaust = ctx.createOscillator();
    exhaust.setPeriodicWave(wave);
    exhaust.frequency.value = 60;
    exhaust.start();
    const sub = tone('triangle', 30, ctx.createGain());
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    sub.disconnect();
    sub.connect(subGain);
    const jitter = ctx.createOscillator(); // misfire halus: detune bergetar pelan
    jitter.frequency.value = 7.3;
    const jitterGain = ctx.createGain();
    jitterGain.gain.value = 0.6;
    jitter.connect(jitterGain);
    jitterGain.connect(exhaust.detune);
    jitter.start();
    const shaper = ctx.createWaveShaper();
    shaper.curve = shaperCurve(2);
    shaper.oversample = '2x';
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 1.6;
    const pipe = ctx.createBiquadFilter(); // resonansi pipa knalpot
    pipe.type = 'peaking';
    pipe.frequency.value = 170;
    pipe.Q.value = 2.2;
    pipe.gain.value = 6;
    const exGain = ctx.createGain();
    exGain.gain.value = 0;
    exhaust.connect(shaper);
    subGain.connect(shaper);
    shaper.connect(lowpass);
    lowpass.connect(pipe);
    pipe.connect(exGain);
    exGain.connect(out);

    // geraman rendah (hanya watak w16): dua gergaji berselisih sedikit nada (berdenyut kasar), disaring rendah, tanpa distorsi
    let growl = null;
    if (isW16) {
      const growlGain = ctx.createGain();
      growlGain.gain.value = 0;
      const growlLp = ctx.createBiquadFilter();
      growlLp.type = 'lowpass';
      growlLp.Q.value = 1;
      growlLp.frequency.value = 400;
      const g1 = ctx.createOscillator();
      g1.type = 'sawtooth';
      g1.frequency.value = 40;
      const g2 = ctx.createOscillator();
      g2.type = 'sawtooth';
      g2.frequency.value = 40;
      g2.detune.value = 14; // sekitar 0,8%: denyut halus seperti blok mesin besar
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      g1.connect(mix);
      g2.connect(mix);
      mix.connect(growlLp);
      growlLp.connect(growlGain);
      growlGain.connect(out);
      g1.start();
      g2.start();
      growl = { g1, g2, growlLp, growlGain };
    }

    // intake (desis udara), gerung gigi, turbo (dua nada), angin
    const intake = noise();
    const intakeBp = ctx.createBiquadFilter();
    intakeBp.type = 'bandpass';
    intakeBp.Q.value = 1.1;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    intake.connect(intakeBp);
    intakeBp.connect(intakeGain);
    intakeGain.connect(out);
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    const whine = tone('sine', 400, whineGain);
    whineGain.connect(out);
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    const turbo = tone('sine', 1500, turboGain);
    turboGain.connect(out);
    const turboGain2 = ctx.createGain();
    turboGain2.gain.value = 0;
    const turbo2 = tone('sine', 2200, turboGain2);
    turboGain2.connect(out);
    const wind = noise();
    const windHp = ctx.createBiquadFilter();
    windHp.type = 'highpass';
    windHp.frequency.value = 220;
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 800;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windHp);
    windHp.connect(windLp);
    windLp.connect(windGain);
    windGain.connect(out);

    eng = { out, exhaust, sub, jitter, shaper, lowpass, pipe, exGain, subGain, intake, intakeBp, intakeGain, whine, whineGain, turbo, turboGain, turbo2, turboGain2, wind, windLp, windGain, growl, drive: 0, nodes: [exhaust, sub, jitter, intake, whine, turbo, turbo2, wind, ...(growl ? [growl.g1, growl.g2] : [])] };
  }

  function stopEngine() {
    if (eng) {
      const t = ctx.currentTime;
      eng.out.gain.setTargetAtTime(0, t, 0.08);
      const dead = eng;
      eng = null;
      setTimeout(() => { for (const o of dead.nodes) { try { o.stop(); } catch { /* sudah berhenti */ } } dead.out.disconnect(); }, 500);
    }
    if (squeal) {
      const q = squeal;
      squeal = null;
      q.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => { try { q.src.stop(); } catch { /* sudah berhenti */ } q.gain.disconnect(); }, 300);
    }
  }

  function startSqueal() {
    if (squeal || !ensure()) return;
    const src = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(cabinFilter);
    squeal = { src, filter, gain };
  }

  /** Letupan pendek: blow-off turbo saat gas dilepas, letupan knalpot saat pindah gigi. */
  function pop(freq, gain, dur) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noise.buf ?? (noise.buf = (() => { const n = Math.floor(ctx.sampleRate * 0.3); const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2; return b; })());
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.setTargetAtTime(0, ctx.currentTime + 0.02, dur);
    src.connect(f);
    f.connect(g);
    g.connect(cabinFilter);
    src.start();
  }

  return {
    /** Dipanggil tiap frame saat mengemudi (car = Vehicle). Mobil null = mesin berhenti. Kabin diatur lewat cabin(on). */
    engine(car) {
      if (!car) { stopEngine(); boost = 0; lastGear = 0; return; }
      if (!ensure()) return;
      if (eng && engModel !== car.spec) stopEngine(); // ganti mobil: bangun ulang lapisan
      startEngine(car.spec);
      if (!eng) return;
      const t = ctx.currentTime;
      const dt = Math.min(0.1, Math.max(0.001, t - lastT || 0.016));
      lastT = t;
      const throttle = car.throttle ?? 0;
      const pre = engineLayers(car.spec, { speed: car.speed, throttle, engineOn: car.engine, boost, cabin });
      const prevBoost = boost;
      boost = nextBoost(boost, throttle, pre.rpmFrac, dt);
      const L = engineLayers(car.spec, { speed: car.speed, throttle, engineOn: car.engine, boost, cabin });
      const w16 = car.spec.engine.timbre === 'w16';
      // pindah gigi: gas terputus sebentar + letupan; gas dilepas dengan boost tinggi: blow-off
      const gear = gearFor(car.spec, car.speed);
      if (gear !== lastGear && lastGear !== 0 && gear !== 0 && throttle > 0.4) { duckUntil = t + 0.08; pop(260, 0.05 + 0.03 * L.rpmFrac, 0.05); }
      lastGear = gear;
      if (car.spec.engine.turbo && prevBoost > 0.55 && boost < prevBoost - 0.03 && throttle < 0.2) {
        if (w16) { pop(1500, 0.1, 0.22); pop(650, 0.05, 0.3); } else pop(2400, 0.06, 0.12); // blow-off W16: lebih panjang dan lebih dalam
      }
      if (L.crackle && Math.random() < dt * 7) pop(180 + Math.random() * 260, 0.035 + Math.random() * 0.03, 0.03); // letupan knalpot saat gas dilepas
      const cut = t < duckUntil || L.limiter && Math.sin(t * 60) > 0 ? 0.3 : 1; // potong gas saat pindah gigi / rev limiter
      const drv = w16 ? Math.min(W16_DRIVE_MAX, L.drive) : L.drive;
      eng.exhaust.frequency.setTargetAtTime(L.fireHz, t, 0.03);
      eng.sub.frequency.setTargetAtTime(L.subHz, t, 0.03);
      if (Math.abs(drv - eng.drive) > 0.3) { eng.shaper.curve = shaperCurve(drv); eng.drive = drv; }
      eng.lowpass.frequency.setTargetAtTime(L.cutoff * (w16 ? W16_DARK : 1), t, 0.05);
      eng.pipe.gain.setTargetAtTime(6 * L.cabinLow, t, 0.1);
      eng.exGain.gain.setTargetAtTime(L.exhaustGain * cut * (w16 ? W16_EXHAUST : 1), t, 0.03);
      eng.subGain.gain.setTargetAtTime(L.subGain, t, 0.05);
      if (eng.growl) {
        eng.growl.g1.frequency.setTargetAtTime(L.growlHz, t, 0.03);
        eng.growl.g2.frequency.setTargetAtTime(L.growlHz, t, 0.03);
        eng.growl.growlLp.frequency.setTargetAtTime(L.growlCut, t, 0.05);
        eng.growl.growlGain.gain.setTargetAtTime(L.growlGain * cut, t, 0.03);
      }
      eng.intakeBp.frequency.setTargetAtTime(L.intakeFreq, t, 0.05);
      eng.intakeGain.gain.setTargetAtTime(L.intakeGain, t, 0.05);
      eng.whine.frequency.setTargetAtTime(L.whineFreq, t, 0.05);
      eng.whineGain.gain.setTargetAtTime(L.whineGain, t, 0.08);
      eng.turbo.frequency.setTargetAtTime(L.turboFreq, t, 0.05);
      eng.turboGain.gain.setTargetAtTime(L.turboGain, t, 0.05);
      eng.turbo2.frequency.setTargetAtTime(L.turboFreq2, t, 0.05);
      eng.turboGain2.gain.setTargetAtTime(L.turboGain2, t, 0.05);
      eng.windLp.frequency.setTargetAtTime(L.windCut, t, 0.1);
      eng.windGain.gain.setTargetAtTime(L.windGain, t, 0.1);
      const q = tyreSound(car.slip ?? 0, car.speed);
      if (q.gain > 0) startSqueal();
      if (squeal) {
        squeal.filter.frequency.setTargetAtTime(q.freq, t, 0.05);
        squeal.gain.gain.setTargetAtTime(q.gain, t, 0.04);
      }
    },
    /** Kamera di dalam kabin: bunyi luar teredam (lowpass pada keluaran). */
    cabin(on) {
      if (on === cabin) return;
      cabin = on;
      if (ctx && cabinFilter) cabinFilter.frequency.setTargetAtTime(on ? 3200 : 20000, ctx.currentTime, 0.15);
    },
    /** Klakson dua nada; on=true mulai (pemain lokal, ditahan), on=false berhenti. */
    horn(on, gain = 0.16) {
      if (on && !horn && ensure()) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.02);
        g.connect(master);
        horn = { g, a: tone('square', 415, g), b: tone('square', 523, g) };
      } else if (!on && horn) {
        const h = horn;
        horn = null;
        h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        setTimeout(() => { try { h.a.stop(); h.b.stop(); } catch { /* sudah berhenti */ } h.g.disconnect(); }, 200);
      }
    },
    /** Klakson pendek mobil lain menurut jarak (m). */
    honkAt(distance) {
      const g = hearGain(distance, 70) * 0.16;
      if (g < 0.003 || !ensure()) return;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(g, ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.35, 0.03);
      gain.connect(master);
      const a = tone('square', 415, gain);
      const b = tone('square', 523, gain);
      setTimeout(() => { try { a.stop(); b.stop(); } catch { /* sudah berhenti */ } gain.disconnect(); }, 600);
    },
    /** Bunyi pintu tertutup/terbuka: dentuman pendek. */
    door(distance = 0) {
      const g = hearGain(distance, 30) * 0.5;
      if (g < 0.01 || !ensure()) return;
      const n = Math.floor(ctx.sampleRate * 0.14);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = g;
      src.connect(f);
      f.connect(gain);
      gain.connect(master);
      src.start();
    },
    unlock: () => { ensure(); },
    dispose() {
      this.engine(null);
      this.horn(false);
    },
  };
}
