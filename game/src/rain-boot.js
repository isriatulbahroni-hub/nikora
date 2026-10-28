// Hujan acak di halaman hotel (/hotel.html): menyambungkan drive-weather.js ke game. Alur badai (storm-drama.js):
//   langit makin gelap -> kilat -> guntur menyusul -> gerimis -> makin deras, makin gelap gulita, kilat dan guntur makin sering -> reda pelan.
//  - Jadwal hujan dari jam dinding (sama untuk semua pemain, tiba-tiba): createWeather(). Prelude (PRELUDE_MS) mendahului hujan terjadwal dan hujan buatan.
//  - TEDUH: di dalam ruangan beratap dan di kabin mobil hujan tidak digambar sama sekali, langit tidak ikut menggelapkan ruangan, kilat lebih redup,
//    dan suara hujan menjadi ketukan di atap (weather-shelter.js, diisi hotel-ambience.js dari indoorK dan kamera kabin hotel-main.js).
//  - Tampilan: guratan hujan di atas layar (hanya di luar), langit menggelap, kilatan. Miring mengikuti laju mobil.
//  - Suara: desis hujan, ketukan atap, guntur (storm-sound.js).
//  - Fisika: jalan basah memperkecil grip ban (setWetness di vehicle.js), dan mengering pelan setelah hujan reda.
//  - Kontrol: tombol "Hujan" di panel ⋯ mobil, tombol U di papan ketik (keduanya: prelude dulu baru hujan), ?hujan=1 (langsung hujan, tanpa prelude),
//    ?cuaca=0 (tanpa hujan acak), ?cuaca=cepat (waktu 30x), ?suara=0 (tanpa suara).
//  - window.__weather: intensity(), active(), start(peak, { instant }), calm(), toggle(), next(), prelude(), dark(), shelter(), strike() (pengujian).
import { createWeather } from './drive-weather.js';
import { setWetness } from './vehicle.js';
import { PRELUDE_MS, createStorm, darkTarget, flashAlpha, scheduledPrelude, screenDark, streakAmount } from './storm-drama.js';
import { hotelFallback, readShelter } from './weather-shelter.js';
import { createStormSound } from './storm-sound.js';

const MAX_DROPS = 260;
const CALM_MS = 15 * 60 * 1000; // sama dengan drive-weather.js: reda dipaksa 15 menit (waktu cuaca)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function mountRain({ search = window.location.search, root = document.body } = {}) {
  const weather = createWeather({ search });
  const storm = createStorm();
  const sound = createStormSound({ search });
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:4;pointer-events:none';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  addEventListener('resize', resize);

  const drops = Array.from({ length: MAX_DROPS }, () => ({ x: Math.random(), y: Math.random(), l: 0.5 + Math.random() * 0.5, v: 0.8 + Math.random() * 0.6 }));
  let wet = 0; // 0..1: jalan basah (mengering pelan, ~20 dtk)
  let dark = 0; // gelap langit yang dihaluskan 0..1 (storm-drama.darkTarget)
  let shelter = 0; // 0 = langit terbuka .. 1 = di dalam ruangan atau kabin mobil (dihaluskan)
  let lastPrelude = 0;
  let drawn = false;
  let last = performance.now();
  let toastTimer = 0;
  let pending = null; // hujan buatan yang menunggu prelude selesai: { at (performance.now), peak }
  let holdManual = false; // setelah hujan buatan mulai, tahan gelap prelude sampai gerimis pertama tampak
  let calmUntil = 0; // waktu cuaca sampai hujan acak dipaksa reda
  let nextInfo = null;
  let nextAt = -1e9;
  const say = (text) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2400);
  };

  // weather.next() mencari beberapa periode ke depan: cukup dihitung ulang tiap 0,5 dtk
  const nextStorm = (now) => {
    if (now - nextAt > 500) {
      nextInfo = weather.next();
      nextAt = now;
    }
    return nextInfo ? { startsInMs: Math.max(0, nextInfo.startsInMs - (now - nextAt)) } : null;
  };
  const preludeNow = (now, level) => {
    if (pending) return clamp(1 - (pending.at - now) / PRELUDE_MS, 0, 1);
    if (holdManual) {
      if (level < 0.003) return 1;
      holdManual = false;
    }
    return scheduledPrelude({ next: nextStorm(now), level, random: weather.random, calmed: weather.clock() < calmUntil });
  };

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (pending && now >= pending.at) {
      weather.start(pending.peak);
      pending = null;
      holdManual = true;
    }
    const level = weather.intensity();
    const prelude = preludeNow(now, level);
    lastPrelude = prelude;
    const sh = readShelter({ fallback: hotelFallback });
    shelter += (sh.k - shelter) * (1 - Math.exp(-dt / 0.1)); // cepat: hujan hilang begitu melewati ambang pintu
    wet += (level - wet) * (1 - Math.exp(-dt / (level > wet ? 6 : 20)));
    setWetness(wet > 0.05 ? wet : 0);
    const target = darkTarget({ prelude, level });
    dark += (target - dark) * (1 - Math.exp(-dt / (target > dark ? 4 : 9)));
    const fx = storm.step(dt, { prelude, level });
    for (const t of fx.thunder) sound.thunder(t.volume, shelter);
    sound.update({ level, shelter, cabin: sh.cabin });

    const dk = screenDark(dark, shelter);
    const fl = flashAlpha(fx.flash, shelter);
    const rain = streakAmount(level, shelter); // 0 di dalam ruangan dan kabin: tidak satu pun guratan digambar
    if (dk < 0.004 && fl < 0.004 && rain < 0.01) {
      if (drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
      return;
    }
    drawn = true;
    const car = window.__hotel?.driving?.();
    const slant = 0.12 + clamp(Math.abs(car?.speed ?? 0) / 45, 0, 1) * 0.9; // makin cepat makin miring ke belakang
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cr = Math.round(38 - 33 * dark); // kelabu kebiruan -> hampir hitam saat gelap gulita
    const cg = Math.round(50 - 42 * dark);
    const cb = Math.round(64 - 48 * dark);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${dk.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    if (fl >= 0.004) {
      ctx.fillStyle = `rgba(215,228,255,${(fl * 0.8).toFixed(3)})`; // kilat menerangi seluruh layar sesaat
      ctx.fillRect(0, 0, W, H);
    }
    if (rain < 0.01) return;
    const n = Math.round(MAX_DROPS * clamp(rain, 0, 1) ** 0.8);
    ctx.lineWidth = 1 + rain * 0.8;
    ctx.strokeStyle = `rgba(205,220,235,${(0.18 + 0.32 * rain + 0.3 * fl).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y += dt * (1.1 + rain) * d.v * (1.2 + slant);
      d.x -= dt * 0.25 * slant * d.v;
      if (d.y > 1.05) { d.y = -0.1; d.x = Math.random(); }
      if (d.x < -0.1) d.x += 1.2;
      const x = d.x * W;
      const y = d.y * H;
      const len = (14 + 30 * rain) * d.l;
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * slant, y - len);
    }
    ctx.stroke();
  }
  requestAnimationFrame(frame);

  const api = {
    intensity: () => weather.intensity(),
    active: () => weather.active() || !!pending,
    /** Hujan turun: prelude (gelap, kilat, guntur) dulu, lalu gerimis makin deras. instant = langsung gerimis tanpa prelude. */
    start(peak, { instant = false } = {}) {
      if (instant) {
        pending = null;
        weather.start(peak);
        holdManual = true;
        return;
      }
      pending = { at: performance.now() + PRELUDE_MS, peak };
    },
    calm() {
      pending = null;
      holdManual = false;
      calmUntil = weather.clock() + CALM_MS;
      weather.calm();
    },
    next: () => weather.next(),
    wet: () => wet,
    prelude: () => lastPrelude,
    dark: () => dark,
    shelter: () => shelter,
    strike: (strength = 0.7) => storm.strike(strength), // satu kilat dan guntur sekarang (pengujian)
    toggle() {
      if (api.active()) { api.calm(); say('Hujan reda'); } else { api.start(); say('Langit mulai gelap… sebentar lagi hujan'); }
    },
  };
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'u' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName ?? '')) return;
    api.toggle();
  });
  window.__weather = api;
  return api;
}

mountRain();
