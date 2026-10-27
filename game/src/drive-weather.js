// Cuaca acak untuk dunia hotel/perjalanan: hujan datang TIBA-TIBA seperti dunia nyata, mulai dari gerimis lalu makin lama makin deras sampai
// puncaknya, kemudian mereda pelan. Jadwalnya murni fungsi dari jam dinding (Date.now), jadi tanpa server semua pemain melihat cuaca yang SAMA
// pada saat yang sama, dan tidak ada yang bisa menebak kapan hujan turun. Semua fungsi murni dan diuji (drive-weather.test.js).
// Alamat: ?cuaca=0 (tanpa hujan acak), ?cuaca=cepat (waktu 30x lebih cepat, untuk menguji), ?hujan=1 / ?hujan=0.6 (hujan langsung turun sejak awal).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sm = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export const EPOCH_MS = 40 * 60 * 1000; // satu periode cuaca: paling banyak satu hujan per 40 menit
export const RAIN_CHANCE = 0.5; // peluang sebuah periode ada hujannya
export const DRIZZLE = 0.14; // intensitas awal: gerimis
export const FADE_IN_MS = 20000; // 0 -> gerimis dalam 20 dtk (tidak ada hujan yang muncul mendadak penuh)
export const SEED = 20261027;
const DEFAULT_PEAK = 0.85;
const MANUAL_MS = 20 * 60 * 1000;
const CALM_MS = 15 * 60 * 1000;

/** Bilangan acak 0..1 yang tetap untuk (periode, nomor). */
export function hash01(epoch, k, seed = SEED) {
  let h = Math.imul((epoch | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((k | 0) + 1, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Hujan pada sebuah periode, atau null: { start, end, peak, rise } (ms absolut; rise = bagian awal yang makin deras, 0..1). */
export function stormIn(epoch, seed = SEED) {
  if (hash01(epoch, 0, seed) >= RAIN_CHANCE) return null;
  const dur = (12 + 23 * hash01(epoch, 1, seed)) * 60000; // 12 sampai 35 menit
  const start = epoch * EPOCH_MS + hash01(epoch, 2, seed) * (EPOCH_MS - dur);
  return { start, end: start + dur, peak: 0.45 + 0.55 * hash01(epoch, 3, seed), rise: 0.6 + 0.2 * hash01(epoch, 4, seed) };
}

/** Intensitas 0..1 sebuah hujan pada waktu t: gerimis, naik halus ke puncak, lalu reda halus sampai 0. */
export function stormLevel(st, t) {
  if (!st || t < st.start || t >= st.end) return 0;
  const u = (t - st.start) / (st.end - st.start);
  const fade = clamp((t - st.start) / FADE_IN_MS, 0, 1);
  if (u < st.rise) return fade * (DRIZZLE + (st.peak - DRIZZLE) * sm(u / st.rise));
  return st.peak * (1 - sm((u - st.rise) / (1 - st.rise)));
}

/** Intensitas hujan acak pada waktu t (ms). */
export const weatherAt = (t, seed = SEED) => stormLevel(stormIn(Math.floor(t / EPOCH_MS), seed), t);

/** Waktu hujan acak berikutnya yang mulai setelah t: { start, end, peak } atau null (mencari sampai 24 periode ke depan). */
export function nextStorm(t, seed = SEED) {
  const e0 = Math.floor(t / EPOCH_MS);
  for (let e = e0; e < e0 + 24; e++) {
    const s = stormIn(e, seed);
    if (s && s.end > t) return { start: s.start, end: s.end, peak: s.peak };
  }
  return null;
}

/** Hujan buatan yang dimulai sekarang (tombol Hujan, ?hujan=): langsung gerimis lalu makin deras sampai `peak`. */
export const manualStorm = (now, peak = DEFAULT_PEAK) => ({ start: now, end: now + MANUAL_MS, peak: clamp(peak, 0.15, 1), rise: 0.7 });

/** Nilai ?hujan=: null bila tidak ada atau 0; 1 = puncak bawaan 0,85; angka 0..1 = puncak itu. */
export function manualFromSearch(search = '') {
  const raw = new URLSearchParams(search).get('hujan');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1 ? DEFAULT_PEAK : clamp(n, 0.15, 1);
}

/**
 * Pengendali cuaca satu halaman. now = () => ms (bawaan Date.now); ?cuaca=cepat mempercepat waktu 30x.
 * intensity() = tingkat hujan sekarang (0..1): hujan buatan bila ada, selain itu jadwal acak (kecuali ?cuaca=0).
 */
export function createWeather({ search = '', now = Date.now } = {}) {
  const q = new URLSearchParams(search).get('cuaca');
  const random = q !== '0';
  const speed = q === 'cepat' ? 30 : 1;
  const t0 = now();
  const clock = () => t0 + (now() - t0) * speed;
  let storm = null; // hujan buatan
  let calmUntil = 0; // reda dipaksa sampai waktu ini
  let fixed = null; // tingkat tetap (pengujian lewat konsol)
  const first = manualFromSearch(search);
  if (first !== null) storm = manualStorm(clock(), first);

  return {
    get random() { return random; },
    get speed() { return speed; },
    clock,
    intensity() {
      if (fixed !== null) return fixed;
      const t = clock();
      if (storm) {
        if (t < storm.end) return stormLevel(storm, t);
        storm = null;
      }
      return t < calmUntil || !random ? 0 : weatherAt(t);
    },
    /** Sedang hujan (atau hujan buatan sedang berjalan, termasuk gerimis awal)? */
    active() {
      return this.intensity() > 0.02 || (fixed === null && !!storm && clock() < storm.end);
    },
    /** Hujan turun sekarang: gerimis lalu makin deras. */
    start(peak = DEFAULT_PEAK) {
      fixed = null;
      calmUntil = 0;
      storm = manualStorm(clock(), peak);
    },
    /** Reda sekarang dan tidak ada hujan acak selama 15 menit (waktu cuaca). */
    calm() {
      fixed = null;
      storm = null;
      calmUntil = clock() + CALM_MS;
    },
    /** Tingkat tetap (pengujian); null = kembali ke cuaca. */
    setFixed(v) {
      fixed = v === null ? null : clamp(Number(v) || 0, 0, 1);
    },
    /** Hujan acak berikutnya (waktu dinding) untuk pengujian. */
    next() {
      const n = nextStorm(clock());
      if (!n) return null;
      const w = (x) => t0 + (x - t0) / speed;
      return { startsInMs: Math.max(0, Math.round(w(n.start) - now())), minutes: Math.round((n.end - n.start) / 60000), peak: +n.peak.toFixed(2) };
    },
  };
}
