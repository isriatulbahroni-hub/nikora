// Hujan acak di halaman hotel (/hotel.html): menyambungkan drive-weather.js ke game. Alur badai (storm-drama.js):
//   langit makin gelap -> kilat -> guntur menyusul -> gerimis -> makin deras, makin gelap gulita, kilat dan guntur makin sering -> reda pelan.
//  - Jadwal hujan dari jam dinding (sama untuk semua pemain, tiba-tiba): createWeather(). Prelude (PRELUDE_MS) mendahului hujan terjadwal dan hujan buatan.
//  - TEDUH: di dalam ruangan beratap dan di kabin mobil langit tidak ikut menggelapkan ruangan, kilat lebih redup,
//    dan suara hujan menjadi ketukan di atap (weather-shelter.js, diisi hotel-ambience.js dari indoorK dan kamera kabin hotel-main.js).
//  - Tampilan: HUJAN 3D di dunia (rain-3d.js, dipasang hotel-life.js: terhalang kanopi/atap, terlihat di luar kaca mobil, genangan, dunia basah).
//    Bila hujan 3D tidak aktif (?hujan3d=0 atau galat) guratan 2D di atas layar dipakai sebagai cadangan. Selalu di lapisan ini: langit menggelap, kilatan,
//    tetes di kaca depan mobil dengan wiper saat kamera kabin (glass-rain.js), dan tetes di lensa saat di bawah langit terbuka.
//  - Suara: desis hujan, ketukan atap, guntur (storm-sound.js).
//  - 4D: guntur menggetarkan HP (weather-haptics.js), angin menyesuaikan kemiringan hujan, tetes di lensa. Tombol "4D" (muncul saat badai) mematikan semuanya;
//    ?getar=0 atau "kurangi gerakan" di sistem mematikan getaran saja. Tombol "Wiper" (di kabin saat hujan) berganti Auto/Nyala/Mati; tombol V di papan ketik.
//  - Fisika: jalan basah memperkecil grip ban (setWetness di vehicle.js), dan mengering pelan setelah hujan reda.
//  - Kontrol: tombol "Hujan" di panel ⋯ mobil, tombol U di papan ketik (keduanya: prelude dulu baru hujan), ?hujan=1 (langsung hujan, tanpa prelude),
//    ?cuaca=0 (tanpa hujan acak), ?cuaca=cepat (waktu 30x), ?suara=0 (tanpa suara).
//  - window.__weather: intensity(), active(), start(peak, { instant }), calm(), toggle(), next(), prelude(), dark(), shelter(), strike() (pengujian),
//    glass (tetes kaca dan wiper), fourD (on/set/toggle). window.__weather4d = fourD.
import { createWeather } from './drive-weather.js';
import { setWetness } from './vehicle.js';
import { PRELUDE_MS, createStorm, darkTarget, flashAlpha, scheduledPrelude, screenDark, streakAmount } from './storm-drama.js';
import { hotelFallback, readShelter } from './weather-shelter.js';
import { createStormSound } from './storm-sound.js';
import { createGlass } from './glass-rain.js';
import { createWeatherHaptics } from './weather-haptics.js';
import { engineHapticsEnabled } from './haptics.js';

const MAX_DROPS = 260;
const CALM_MS = 15 * 60 * 1000; // sama dengan drive-weather.js: reda dipaksa 15 menit (waktu cuaca)
const FOURD_KEY = 'nikora-4d';
const WIPER_LABEL = { auto: 'Auto', on: 'Nyala', off: 'Mati' };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Saklar efek 4D (getar, angin, tetes di lensa), tersimpan di perangkat; bawaan nyala. */
function createFourD() {
  let on = true;
  try { on = localStorage.getItem(FOURD_KEY) !== '0'; } catch { on = true; }
  return {
    on: () => on,
    set(v) {
      on = !!v;
      try { localStorage.setItem(FOURD_KEY, on ? '1' : '0'); } catch { /* penyimpanan tidak tersedia */ }
    },
    toggle() {
      this.set(!on);
      return on;
    },
  };
}

/** Dua tombol kecil kanan atas: 4D (tampil saat badai) dan Wiper (tampil di kabin saat hujan). Di bawah deretan tombol Jelajah/Kamera/Peta. */
function mountChips({ fourD, glass }) {
  const css = 'position:fixed;right:14px;z-index:31;height:36px;padding:0 12px;border-radius:18px;border:1px solid rgba(255,255,255,.35);background:rgba(20,17,13,.55);color:#f1e9d6;font:700 12px system-ui,sans-serif;touch-action:manipulation;display:none';
  const top = (n) => `calc(max(12px,env(safe-area-inset-top)) + ${n}px)`;
  const make = (n, label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = `${css};top:${top(n)}`;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    document.body.appendChild(b);
    return b;
  };
  const b4 = make(126, 'Efek 4D hujan: getar, angin, tetes di lensa', () => { fourD.toggle(); paint(); });
  const bw = make(170, 'Wiper kaca depan', () => { glass.wiper.cycle(); paint(); });
  const show = (b, on) => { const v = on ? 'block' : 'none'; if (b.style.display !== v) b.style.display = v; };
  const text = (b, t) => { if (b.textContent !== t) b.textContent = t; };
  function paint() {
    text(b4, fourD.on() ? '4D: nyala' : '4D: mati');
    b4.style.borderColor = fourD.on() ? '#c9a24b' : 'rgba(255,255,255,.35)';
    text(bw, `Wiper: ${WIPER_LABEL[glass.wiper.mode()]}`);
  }
  paint();
  return {
    update({ storm, cabin }) {
      show(b4, storm);
      show(bw, cabin);
      if (storm || cabin) paint();
    },
  };
}

export function mountRain({ search = window.location.search, root = document.body } = {}) {
  const weather = createWeather({ search });
  const storm = createStorm();
  const sound = createStormSound({ search });
  const glass = createGlass();
  const fourD = createFourD();
  const hapticsOk = engineHapticsEnabled(search, !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const haptics = createWeatherHaptics({ enabled: () => hapticsOk && fourD.on() });
  const chips = mountChips({ fourD, glass });
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
    for (const t of fx.thunder) {
      sound.thunder(t.volume, shelter);
      haptics.thunder(t.volume, shelter); // 4D: HP bergetar mengikuti kerasnya guntur
    }
    sound.update({ level, shelter, cabin: sh.cabin });

    // kaca: tetes di kaca depan (kamera kabin) dan di lensa (langit terbuka); wiper menyapu tetes kaca depan
    const car = window.__hotel?.driving?.();
    const cabin = !!sh.cabin;
    glass.step(dt, { level, cabin, exposed: shelter < 0.2 && !cabin, speed: Math.abs(car?.speed ?? 0), lens: fourD.on(), view: { w: W, h: H } });
    chips.update({ storm: level > 0.02 || lastPrelude > 0.05, cabin: cabin && level > 0.02 });

    const dk = screenDark(dark, shelter);
    const fl = flashAlpha(fx.flash, shelter);
    // guratan 2D hanya cadangan: bila hujan 3D aktif (hotel-life.js memasangnya) guratan digambar di dunia, bukan di layar
    const rain = streakAmount(level, shelter) * (window.__rain3d?.active?.() ? 0 : 1);
    if (dk < 0.004 && fl < 0.004 && rain < 0.01 && !glass.active()) {
      if (drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
      return;
    }
    drawn = true;
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
    glass.draw(ctx, W, H); // tetes kaca depan, tetes lensa, dan bilah wiper
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
    glass, // tetes kaca dan wiper (pengujian)
    fourD, // saklar efek 4D
    strike: (strength = 0.7) => storm.strike(strength), // satu kilat dan guntur sekarang (pengujian)
    toggle() {
      if (api.active()) { api.calm(); say('Hujan reda'); } else { api.start(); say('Langit mulai gelap… sebentar lagi hujan'); }
    },
  };
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName ?? '')) return;
    const k = e.key.toLowerCase();
    if (k === 'u') api.toggle();
    else if (k === 'v') say(`Wiper: ${WIPER_LABEL[glass.wiper.cycle()]}`);
  });
  window.__weather = api;
  window.__weather4d = fourD;
  return api;
}

mountRain();
