// Siang-malam otomatis untuk semua venue (Royal, Villa, Masjid). Semua fungsi di sini murni dan bisa diuji.
// "Fase" langit: -1 = siang penuh, 0 = senja keemasan, +1 = malam penuh.

export const ZONES = Object.freeze({ WIB: 7, WITA: 8, WIT: 9 });
export const DEFAULT_ZONE = 'WIB';
/** auto = jam asli di zona waktu acara; day/sunset/night = dikunci; cycle = satu hari penuh dalam 20 menit (demo). */
export const DAY_MODES = Object.freeze(['auto', 'day', 'sunset', 'night', 'cycle']);
export const DEMO_CYCLE_MS = 20 * 60 * 1000;

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const span = (h, a, b) => smooth((h - a) / (b - a));

const offsetOf = (zone) => {
  if (typeof zone === 'number' && Number.isFinite(zone)) return clamp(zone, -12, 14);
  const key = String(zone ?? '').toUpperCase();
  return Object.prototype.hasOwnProperty.call(ZONES, key) ? ZONES[key] : ZONES[DEFAULT_ZONE];
};

/** Jam desimal 0..24 pada zona waktu acara (selisih tetap dari UTC; Indonesia tidak memakai waktu musim panas). */
export function hoursAt(now, zone) {
  const ms = (((now + offsetOf(zone) * HOUR_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return ms / HOUR_MS;
}

/**
 * Fase langit menurut jam: malam (19.15-05.00), fajar (05.00-06.30) menuju senja keemasan, pagi (06.30-08.30) menuju siang,
 * siang (08.30-15.30), sore (15.30-17.30) menuju senja, senja keemasan (17.30-18.00), lalu senja menuju malam (18.00-19.15).
 */
export function phaseAtHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h >= 19.25) return 1;
  if (h < 6.5) return 1 - span(h, 5, 6.5);
  if (h < 8.5) return 0 - span(h, 6.5, 8.5);
  if (h < 15.5) return -1;
  if (h < 17.5) return span(h, 15.5, 17.5) - 1;
  if (h < 18) return 0;
  return span(h, 18, 19.25);
}

/** Zona waktu dari ?tz= (WIB, WITA, WIT, atau selisih jam dari UTC seperti 8); undefined bila tidak sah. */
export function zoneFromSearch(search = '') {
  const raw = new URLSearchParams(search).get('tz')?.trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(ZONES, upper)) return upper;
  const n = Number(raw);
  return Number.isFinite(n) && n >= -12 && n <= 14 ? n : undefined;
}

/** Mode dari ?sky=; mode yang tidak dikenal kembali ke 'auto'. */
export function skyModeFromSearch(search = '', allowed = DAY_MODES) {
  const v = new URLSearchParams(search).get('sky')?.toLowerCase();
  return v && allowed.includes(v) ? v : 'auto';
}

function defaultZone() {
  try {
    return zoneFromSearch(globalThis.location?.search ?? '');
  } catch {
    return undefined;
  }
}

/** Fase langit untuk sebuah mode pada waktu `now` (ms epoch). Tanpa `zone`, dipakai ?tz= dari URL lalu WIB. */
export function skyPhase(mode = 'auto', now = Date.now(), { zone, cycle = DEMO_CYCLE_MS } = {}) {
  if (mode === 'day') return -1;
  if (mode === 'sunset') return 0;
  if (mode === 'night') return 1;
  if (mode === 'cycle') return phaseAtHour(((((now % cycle) + cycle) % cycle) / cycle) * 24);
  return phaseAtHour(hoursAt(now, zone ?? defaultZone()));
}

/** Memecah fase menjadi { night, day } masing-masing 0..1. */
export const splitPhase = (phase) => ({ night: Math.max(0, phase), day: Math.max(0, -phase) });

/** Mendekatkan nilai `cur` ke `target` paling banyak `rate` per detik (peralihan langit yang halus). */
export const approach = (cur, target, dt, rate = 0.25) => cur + Math.max(-dt * rate, Math.min(dt * rate, target - cur));

const mixValue = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t);

/** Mencampur tiga keyframe { day, sunset, night } menurut fase -1..1. Nilai berupa angka atau larik angka. */
export function blendSky(frames, phase) {
  const p = clamp(phase, -1, 1);
  const [a, b, t] = p < 0 ? [frames.day, frames.sunset, p + 1] : [frames.sunset, frames.night, p];
  return Object.fromEntries(Object.keys(a).map((k) => [k, mixValue(a[k], b[k], t)]));
}

/**
 * Pelacak fase yang dipakai tiap venue di setiap frame: bergerak halus menuju fase target (tidak melompat saat mode diganti)
 * dan memberi tahu kapan nilainya cukup berubah sehingga atmosfer perlu diterapkan ulang.
 */
export function createPhaseTracker({ mode = 'auto', zone, rate = 0.25 } = {}) {
  let current = mode;
  let phase = skyPhase(current, Date.now(), { zone });
  let applied = null;
  let lastMs = null;
  return {
    get phase() {
      return phase;
    },
    get mode() {
      return current;
    },
    setMode(next) {
      current = next;
    },
    /** Mengembalikan true bila fase berubah > 0,0005 sejak terakhir kali true (pemanggilan pertama selalu true). */
    tick(perfMs, dateMs = Date.now()) {
      const dt = lastMs === null ? 0 : clamp((perfMs - lastMs) / 1000, 0, 0.25);
      lastMs = perfMs;
      phase = approach(phase, skyPhase(current, dateMs, { zone }), dt, rate);
      if (applied === null || Math.abs(phase - applied) > 5e-4) {
        applied = phase;
        return true;
      }
      return false;
    },
  };
}
