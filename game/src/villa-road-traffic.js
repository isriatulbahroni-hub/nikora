// Lalu lintas karyawan villa di jalan hotel <-> villa (Perjalanan 20 menit, hotel-journey.js). Data murni tanpa THREE, deterministik dari jam:
// semua pemain melihat kendaraan yang sama di tempat yang sama. Tampilannya: road-traffic-view.js.
//
// Karyawan villa tinggal di hotel (venue-staff.js: STAFF_HOME). Tiap pergantian shift mereka berkendara menempuh jalan yang sama dengan pemain:
//  - sepeda motor (tiap karyawan ber-transport 'motor' berkendara sendiri),
//  - bus antar-jemput (karyawan ber-transport 'bus', satu bus per BUS_SEATS orang),
//  - mobil dinas villa: enam sedan yang dikemudikan bellboy yang sedang bertugas, bolak-balik hotel <-> villa tiap tiga jam (antar belanja, tamu, dan
//    keperluan villa) supaya jalan tidak sepi di luar jam pergantian shift.
// Berangkat (arah 'out', hotel -> villa) dalam jendela COMMUTE_H sebelum shift mulai dan tiba paling lambat satu menit sebelum shift; pulang (arah
// 'back', villa -> hotel) dalam jendela COMMUTE_H sesudah shift selesai, sama dengan presence() di venue-staff.js.
// Kecepatan mengikuti profil autopilot rute (journey-drive.js: melambat di tikungan), diregangkan per jenis kendaraan (bus lebih lambat).
import { buildJourney } from './journey.js';
import { startState, stepDrive } from './journey-drive.js';
import { COMMUTE_H, SHIFTS, VENUE_STAFF, onDuty } from './venue-staff.js';

export const ROAD_VENUE = 'villa'; // id gerbang/rute di journey.js
export const BUS_SEATS = 24;
export const CAR_COUNT = 6; // enam sedan di gerbang villa (vehicle-fleet.js: villa_0..5)
export const ERRAND_EVERY_H = 3; // tiap mobil dinas berangkat dari hotel tiap sekian jam
export const ERRAND_STAY_S = 1500; // lama mobil dinas di villa sebelum kembali (detik)
export const STRETCH = Object.freeze({ motor: 1, car: 1.05, bus: 1.35 }); // lama tempuh relatif terhadap autopilot
const DAY = 86400;
const WINDOW = COMMUTE_H * 3600;
const mod = (a) => ((a % DAY) + DAY) % DAY;
const hash01 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const MOTOR_COLORS = Object.freeze([0x222428, 0x3a3d44, 0xb3262c, 0x1f4fa8, 0xe7e7e7]);
const CAR_COLORS = Object.freeze([0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x274a7c, 0xb9bcc0, 0x1a1a1a]);
const BUS_COLOR = 0xc9a24b;

let profile = null;
/** Profil tempuh autopilot rute villa: s (m dari gerbang) tiap detik sejak berangkat. duration = detik sampai tiba di ujung rute. */
export function journeyProfile() {
  if (profile) return profile;
  const j = buildJourney(ROAD_VENUE);
  const st = startState(0);
  const ss = [0];
  while (!st.arrived && st.t < 7200) {
    stepDrive(j, st, 1);
    ss.push(st.s);
  }
  profile = Object.freeze({ length: j.length, duration: st.t, ss });
  return profile;
}

/** Lama tempuh satu perjalanan (detik) untuk jenis kendaraan ini. */
export const tripDuration = (kind) => journeyProfile().duration * STRETCH[kind];

function forward(p, t) {
  if (t <= 0) return 0;
  if (t >= p.duration) return p.length;
  const i = Math.min(p.ss.length - 2, Math.floor(t));
  return p.ss[i] + (p.ss[i + 1] - p.ss[i]) * (t - i);
}

/** Jarak dari gerbang (m) setelah `elapsed` detik berjalan: arah 'out' bertambah dari 0, arah 'back' berkurang dari panjang rute. */
export function progressAt(kind, dir, elapsed) {
  const p = journeyProfile();
  const s = forward(p, Math.min(elapsed / STRETCH[kind], p.duration));
  return dir === 'out' ? s : p.length - s;
}

function buildTrips() {
  const staff = VENUE_STAFF[ROAD_VENUE];
  const slackIn = (kind) => Math.max(0, WINDOW - tripDuration(kind) - 60); // tiba paling lambat 1 menit sebelum shift
  const slackOut = (kind) => Math.max(0, WINDOW - tripDuration(kind)); // sudah sampai hotel sebelum jendela pulang berakhir
  const out = [];

  staff.forEach((s, i) => {
    if (s.transport !== 'motor') return;
    const sh = SHIFTS[s.shift];
    const color = MOTOR_COLORS[i % MOTOR_COLORS.length];
    out.push({ id: `${s.id}:in`, kind: 'motor', dir: 'out', t0: mod(sh.from * 3600 - WINDOW + hash01(i * 3 + 1) * slackIn('motor')), staff: [s.id], color });
    out.push({ id: `${s.id}:out`, kind: 'motor', dir: 'back', t0: mod(sh.to * 3600 + hash01(i * 5 + 2) * slackOut('motor')), staff: [s.id], color });
  });

  SHIFTS.forEach((sh, si) => {
    const riders = staff.filter((s) => s.transport === 'bus' && s.shift === si);
    if (!riders.length) return;
    const runs = Math.ceil(riders.length / BUS_SEATS);
    const gapIn = runs > 1 ? Math.min(60, slackIn('bus') / (runs - 1)) : 0;
    const gapOut = runs > 1 ? Math.min(60, slackOut('bus') / (runs - 1)) : 0;
    for (let r = 0; r < runs; r++) {
      const ids = riders.slice(r * BUS_SEATS, (r + 1) * BUS_SEATS).map((s) => s.id);
      out.push({ id: `bus-${sh.id}-${r}:in`, kind: 'bus', dir: 'out', t0: mod(sh.from * 3600 - WINDOW + r * gapIn), staff: ids, color: BUS_COLOR });
      out.push({ id: `bus-${sh.id}-${r}:out`, kind: 'bus', dir: 'back', t0: mod(sh.to * 3600 + r * gapOut), staff: ids, color: BUS_COLOR });
    }
  });

  const bellboys = staff.filter((s) => s.role === 'bellboy');
  for (let k = 0; k < CAR_COUNT; k++) {
    for (let n = 0; n < 24 / ERRAND_EVERY_H; n++) {
      const t0 = n * ERRAND_EVERY_H * 3600 + k * 1500 + Math.floor(hash01(k * 31 + n) * 300);
      const hour = (t0 / 3600) % 24;
      const onShift = bellboys.filter((b) => onDuty(b, hour));
      const pool = onShift.length ? onShift : bellboys;
      const driver = pool[(k + n) % pool.length]?.id ?? null;
      const color = CAR_COLORS[k % CAR_COLORS.length];
      out.push({ id: `car-${k}-${n}:out`, kind: 'car', dir: 'out', t0: mod(t0), staff: [], driver, car: k, color });
      out.push({ id: `car-${k}-${n}:back`, kind: 'car', dir: 'back', t0: mod(t0 + tripDuration('car') + ERRAND_STAY_S), staff: [], driver, car: k, color });
    }
  }
  return out;
}

let trips = null;
/** Semua perjalanan dalam sehari: { id, kind: 'motor' | 'bus' | 'car', dir: 'out' | 'back', t0 (detik dalam sehari), staff (id penumpang), driver, color }. */
export const tripList = () => (trips ??= Object.freeze(buildTrips().map((t) => Object.freeze(t))));

/** Kendaraan yang sedang di jalan pada `seconds` (detik dalam sehari, boleh pecahan). Mengisi dan mengembalikan `out`. */
export function trafficAt(seconds, out = []) {
  out.length = 0;
  const now = mod(seconds);
  for (const t of tripList()) {
    const dur = tripDuration(t.kind);
    const elapsed = mod(now - t.t0);
    if (elapsed >= dur) continue;
    out.push({ id: t.id, kind: t.kind, dir: t.dir, s: progressAt(t.kind, t.dir, elapsed), color: t.color, riders: t.staff.length, driver: t.driver ?? t.staff[0] ?? null });
  }
  return out;
}

/** Ringkasan untuk papan admin dan tes. */
export function roadSummary() {
  const p = journeyProfile();
  const byKind = { motor: 0, bus: 0, car: 0 };
  for (const t of tripList()) byKind[t.kind]++;
  return { length: p.length, duration: p.duration, trips: tripList().length, byKind };
}
