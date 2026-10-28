// Alur badai di hotel, murni (tanpa DOM, tanpa suara; diuji di storm-drama.test.js). Urutannya:
//   1. PRELUDE (PRELUDE_MS, sebelum hujan pertama): langit makin gelap, lalu kilat pertama, lalu guntur menyusul (bergemuruh)
//   2. gerimis (drive-weather.js menaikkan 0 -> gerimis), makin lama makin besar sampai deras
//   3. makin deras = makin gelap (sampai gelap gulita), kilat dan guntur makin sering dan keras, suara hujan makin besar
//   4. reda pelan; langit terang kembali
// Teduh (ruangan beratap, kabin mobil): hujan tidak digambar, langit di jendela tidak segelap di luar, kilat lebih redup, suara teredam.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sm = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export const PRELUDE_MS = 40000; // dari langit mulai gelap sampai gerimis pertama
export const PRELUDE_DARK = 0.3; // gelap di akhir prelude (0..1)
export const MAX_DARK = 0.88; // gelap gulita saat hujan deras (tidak 1 supaya lampu dan avatar masih samar terlihat)
export const RAIN_ON = 0.003; // di bawah ini dianggap belum hujan

/** Gelap langit 0..1 selama prelude (p 0..1). */
export const preludeDark = (p) => PRELUDE_DARK * sm(p);

/** Gelap langit 0..1 selama hujan: mulai dari gelap prelude, makin deras makin gelap. */
export function rainDark(level) {
  const l = clamp(level, 0, 1);
  return l < RAIN_ON ? 0 : PRELUDE_DARK + (MAX_DARK - PRELUDE_DARK) * sm(l / 0.85);
}

export const darkTarget = ({ prelude = 0, level = 0 } = {}) => Math.max(preludeDark(prelude), rainDark(level));

/** Gelap yang digambar di layar: di dalam ruangan hampir tidak ikut menggelap (lampu dalam ruangan tetap terang). */
export const screenDark = (dark, shelter) => clamp(dark, 0, 1) * (1 - 0.9 * clamp(shelter, 0, 1));

/** Banyaknya hujan yang digambar di layar 0..1: hilang sepenuhnya begitu pemain cukup teduh (shelter >= 0,8). */
export const streakAmount = (level, shelter) => clamp(level, 0, 1) * clamp(1 - 1.25 * clamp(shelter, 0, 1), 0, 1);

/** Kilatan yang tampak di layar: lewat jendela tetap terlihat tapi lebih redup. */
export const flashAlpha = (flash, shelter) => clamp(flash, 0, 1) * (1 - 0.7 * clamp(shelter, 0, 1));

/** Rata-rata detik antar sambaran: Infinity bila belum waktunya. Prelude: 14 -> 8 dtk; hujan: 26 dtk (gerimis) -> 6 dtk (deras). */
export function strikeGap({ prelude = 0, level = 0 } = {}) {
  if (level >= RAIN_ON) return 26 - 20 * sm(level / 0.85);
  if (prelude >= 0.3) return 14 - 6 * sm((prelude - 0.3) / 0.7);
  return Infinity;
}

/** Bentuk satu kilatan: sambaran utama lalu 0..2 kedipan susulan. [{ at (dtk), a (0..1) }] */
export function flashPattern(rand = Math.random) {
  const main = 0.65 + 0.35 * rand();
  const pulses = [{ at: 0, a: main }];
  const extra = Math.floor(rand() * 3);
  let t = 0;
  for (let i = 0; i < extra; i++) {
    t += 0.07 + 0.12 * rand();
    pulses.push({ at: t, a: main * (0.45 + 0.4 * rand()) });
  }
  return pulses;
}

/** Terang kilatan 0..1 pada umur `age` dtk sejak sambaran. */
export function flashAt(pattern, age) {
  let v = 0;
  for (const p of pattern) {
    const x = age - p.at;
    if (x >= 0) v = Math.max(v, p.a * Math.exp(-x / 0.09));
  }
  return v < 0.01 ? 0 : v;
}

/** Jeda kilat -> guntur (detik): cahaya lebih cepat dari suara; 0,35 sampai 5,15 dtk. */
export const thunderDelay = (rand = Math.random) => 0.35 + rand() * 4.8;

/** Keras guntur 0..1: makin dekat (jeda pendek) dan makin deras makin keras. */
export const thunderVolume = (delay, strength) => clamp((1.1 - delay / 6.2) * (0.5 + 0.5 * clamp(strength, 0, 1)), 0.12, 1);

/** Gain suara hujan: hiss = hujan di udara terbuka, roof = ketukan di atap saat teduh (di kabin mobil lebih keras). */
export function rainAudio({ level = 0, shelter = 0, cabin = false } = {}) {
  const open = clamp(level, 0, 1) ** 0.85;
  const s = clamp(shelter, 0, 1);
  return { hiss: open * (1 - 0.93 * s), roof: open * s * (cabin ? 0.85 : 0.4) };
}

/**
 * Seberapa jauh prelude sudah berjalan 0..1 untuk hujan acak terjadwal. next = { startsInMs } dari weather.next() (null bila tak ada).
 * Hujan yang sudah mulai tapi gerimisnya belum tampak menahan nilai 1 (supaya gelapnya tidak turun lalu naik lagi).
 */
export function scheduledPrelude({ next, level = 0, random = true, calmed = false, ms = PRELUDE_MS } = {}) {
  if (!random || calmed || !next) return 0;
  if (next.startsInMs <= 0) return level < RAIN_ON ? 1 : 0;
  if (next.startsInMs > ms) return 0;
  return clamp(1 - next.startsInMs / ms, 0, 1);
}

/**
 * Penjadwal kilat dan guntur. step(dt, { prelude, level }) => { flash 0..1, thunder: [{ volume }] } (guntur yang jatuh tempo frame ini).
 * strike(strength) memicu satu sambaran sekarang (pengujian). Saat prelude melewati 0,3 sambaran pertama dipastikan datang dalam 1 sampai 3,4 dtk.
 */
export function createStorm({ rand = Math.random } = {}) {
  let wait = null;
  let pattern = null;
  let age = 0;
  let thunders = [];
  let preludeStruck = false;
  const arm = (gap) => Math.max(2.5, -Math.log(1 - rand()) * gap);
  const api = {
    strike(strength = 0.5) {
      pattern = flashPattern(rand);
      age = 0;
      const d = thunderDelay(rand);
      thunders.push({ in: d, volume: thunderVolume(d, strength) });
    },
    step(dt, { prelude = 0, level = 0 } = {}) {
      const gap = strikeGap({ prelude, level });
      const strength = Math.max(level / 0.85, prelude * 0.5);
      if (!Number.isFinite(gap)) {
        wait = null;
        if (prelude === 0 && level < RAIN_ON) preludeStruck = false;
      } else {
        if (wait === null) wait = arm(gap);
        if (prelude >= 0.3 && level < RAIN_ON && !preludeStruck) {
          wait = Math.min(wait, 1 + rand() * 2.4);
          preludeStruck = true;
        }
        wait -= dt;
        if (wait <= 0) {
          api.strike(strength);
          wait = arm(gap);
        }
      }
      let flash = 0;
      if (pattern) {
        age += dt;
        flash = flashAt(pattern, age);
        if (age > pattern[pattern.length - 1].at + 0.6) pattern = null;
      }
      const due = [];
      thunders = thunders.filter((t) => {
        t.in -= dt;
        if (t.in > 0) return true;
        due.push({ volume: t.volume });
        return false;
      });
      return { flash, thunder: due };
    },
  };
  return api;
}
