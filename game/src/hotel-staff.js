// Karyawan NIKORA Grand Hotel: ratusan petugas yang disimulasikan sebagai jadwal, bukan ratusan avatar sekaligus.
// Posisi hanya dihitung untuk lantai yang sedang dekat pemain (staffOnLevel); sisanya cukup dihitung jumlahnya (dutySummary).
// Modul murni (tanpa THREE) dan deterministik: posisi petugas adalah fungsi dari jam permainan, jadi semua klien melihat hal yang sama.
// Setiap petugas punya pekerjaan berulang (kerja = urutan 'leg': jalan lurus ke titik, lalu diam mengerjakan sesuatu).
// Rute lorong masih garis lurus antar titik pintu (belum navmesh); avatar petugas digambar hotel-staff-view.js. Lihat docs/HOTEL_KARYAWAN.md.
import { configFromId, sanitizeConfig } from './avatar-config.js';
import { HOTEL_LEVEL_COUNT, HOTEL_CORE, HOTEL_FORECOURT, HOTEL_SITE, HOTEL_CAR_SPOTS, isGuestLevel, hotelRoomsAtLevel } from './hotel-layout.js';

export const STAFF_ROLES = Object.freeze({
  housekeeping: Object.freeze({ name: 'Cleaning Service', count: 240 }),
  front_desk: Object.freeze({ name: 'Resepsionis', count: 12 }),
  bellboy: Object.freeze({ name: 'Bellboy', count: 24 }),
  security: Object.freeze({ name: 'Satpam', count: 30 }),
  waiter: Object.freeze({ name: 'Pelayan Restoran', count: 40 }),
  valet: Object.freeze({ name: 'Valet Parkir', count: 16 }),
  parking: Object.freeze({ name: 'Petugas Parkir', count: 24 }),
  gardener: Object.freeze({ name: 'Tukang Kebun', count: 20 }),
  lifeguard: Object.freeze({ name: 'Penjaga Kolam', count: 8 }),
});
export const STAFF_TOTAL = Object.values(STAFF_ROLES).reduce((sum, r) => sum + r.count, 0);

// Tiga shift sehari (jam permainan 0..24). Cleaning service hanya masuk shift pagi dan siang.
export const SHIFTS = Object.freeze([
  Object.freeze({ id: 'pagi', from: 6, to: 14 }),
  Object.freeze({ id: 'siang', from: 14, to: 22 }),
  Object.freeze({ id: 'malam', from: 22, to: 6 }),
]);
const inShift = (shift, hour) => {
  const h = ((hour % 24) + 24) % 24;
  return shift.from < shift.to ? h >= shift.from && h < shift.to : h >= shift.from || h < shift.to;
};

const pad = (n) => String(n + 1).padStart(3, '0');
export const STAFF = Object.freeze(
  Object.entries(STAFF_ROLES).flatMap(([role, { count }]) =>
    Array.from({ length: count }, (_, index) =>
      Object.freeze({ id: `${role}_${pad(index)}`, role, index, shift: role === 'housekeeping' ? index % 2 : index % SHIFTS.length })),
  ),
);
const CLEANERS = STAFF.filter((s) => s.role === 'housekeeping');

/** Apakah petugas sedang bertugas pada jam (pecahan) permainan ini. */
export const onDuty = (staff, hour) => inShift(SHIFTS[staff.shift], hour);

// ---------------------------------------------------------------- pembagian lantai tamu untuk cleaning service
const GUEST_LEVELS = Array.from({ length: HOTEL_LEVEL_COUNT }, (_, l) => l).filter(isGuestLevel);
const cleanerLevelList = Array.from({ length: CLEANERS.length }, () => []);
const levelCleaner = new Map();
GUEST_LEVELS.forEach((level, gi) => {
  const k = Math.floor((gi * CLEANERS.length) / GUEST_LEVELS.length);
  cleanerLevelList[k].push(level);
  levelCleaner.set(level, k);
});
/** Indeks cleaning service yang memegang lantai ini, atau null bila bukan lantai tamu. */
export const cleanerForLevel = (level) => levelCleaner.get(level) ?? null;
/** Lantai tamu yang dipegang satu cleaning service. */
export const cleanerLevels = (index) => cleanerLevelList[index] ?? [];

// ---------------------------------------------------------------- mesin pekerjaan: urutan 'leg' yang berulang
const WALK_MPS = 1.4; // kecepatan jalan petugas (m/detik)
export const CLEAN_MS = 20000; // lama membersihkan satu kamar
const LIFT_MS = 8000; // lama berada di kabin lift (simbolis; lift asli ada di hotel-world.js)
const jobs = new Map();
const mid = (r) => ({ x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 });
const HUB = mid(HOTEL_CORE); // titik tengah inti bangunan: kabin lift, sama di semua lantai
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Susun satu pekerjaan: go() = jalan lurus ke titik lalu diam `dwellMs` mengerjakan `task`; lift() = naik/turun lewat inti. */
function jobBuilder(start, level) {
  const legs = [];
  let cur = start;
  let lv = level;
  const api = {
    go(to, dwellMs = 0, task = 'standing', roomNo = null) {
      legs.push({ from: cur, to, level: lv, walkMs: (dist(cur, to) / WALK_MPS) * 1000, dwellMs, task, roomNo });
      cur = to;
      return api;
    },
    lift(toLevel) {
      api.go(HUB, LIFT_MS, 'riding');
      lv = toLevel;
      return api;
    },
    build: () => Object.freeze({ legs, totalMs: legs.reduce((sum, l) => sum + l.walkMs + l.dwellMs, 0) }),
  };
  return api;
}

/** Satu putaran membersihkan semua kamar di satu lantai: titik tengah inti -> (pintu -> tempat tidur -> pintu) per kamar -> inti. */
function floorJob(level) {
  let job = jobs.get(level);
  if (job) return job;
  const b = jobBuilder(HUB, level);
  for (const room of hotelRoomsAtLevel(level)) {
    if (room.kind !== 'guest') continue;
    const door = { x: room.door.x, z: room.door.z };
    b.go(door).go({ x: room.bed.x, z: room.bed.z }, CLEAN_MS, 'cleaning', room.no).go(door);
  }
  b.go(HUB);
  job = Object.freeze({ level, ...b.build() });
  jobs.set(level, job);
  return job;
}

/** Keadaan pada waktu `t` (ms sejak awal putaran): posisi, lantai, tugas, dan nomor kamar (bila ada). */
function jobState(job, t) {
  let rest = t;
  for (const l of job.legs) {
    const level = l.level ?? job.level;
    if (rest < l.walkMs) {
      const f = l.walkMs ? rest / l.walkMs : 1;
      return { x: l.from.x + (l.to.x - l.from.x) * f, z: l.from.z + (l.to.z - l.from.z) * f, level, task: 'walking', roomNo: l.roomNo };
    }
    rest -= l.walkMs;
    if (rest < l.dwellMs) return { x: l.to.x, z: l.to.z, level, task: l.task, roomNo: l.roomNo };
    rest -= l.dwellMs;
  }
  const last = job.legs[job.legs.length - 1];
  return { x: last.to.x, z: last.to.z, level: last.level ?? job.level, task: 'walking', roomNo: null };
}

const sinceShiftMs = (staff, hour) => ((((hour - SHIFTS[staff.shift].from) % 24) + 24) % 24) * 3600000;

/** Keadaan satu cleaning service pada jam permainan `hour`: lantai, posisi, dan tugas ('walking' | 'cleaning'). Mulai dari awal shift. */
export function housekeeperState(staff, hour) {
  const levels = cleanerLevels(staff.index);
  if (!levels.length) return null;
  const list = levels.map(floorJob);
  const cycle = list.reduce((sum, j) => sum + j.totalMs, 0);
  let t = sinceShiftMs(staff, hour) % cycle;
  for (const job of list) {
    if (t < job.totalMs) return { id: staff.id, role: staff.role, ...jobState(job, t) };
    t -= job.totalMs;
  }
  return null;
}

// ---------------------------------------------------------------- pekerjaan peran lain
const frac = (n) => n - Math.floor(n);
const spread = (index, r) => ({ x: r[0] + (r[2] - r[0]) * (0.15 + 0.7 * frac(index * 0.6180339887)), z: r[1] + (r[3] - r[1]) * (0.15 + 0.7 * frac(index * 0.7548776662)) });
const rectOf = (level, id) => hotelRoomsAtLevel(level).find((r) => r.id === id)?.rect ?? null;
const inset = (r, m) => [r[0] + m, r[1] + m, r[2] - m, r[3] - m];
const corners = (r) => [{ x: r[0], z: r[1] }, { x: r[2], z: r[1] }, { x: r[2], z: r[3] }, { x: r[0], z: r[3] }];
const WEST_GROUNDS = Object.freeze([HOTEL_SITE.minX + 5, HOTEL_SITE.minZ + 5, -45, HOTEL_SITE.maxZ - 5]); // halaman barat, di luar menara
const guestRooms = (level) => hotelRoomsAtLevel(level).filter((r) => r.kind === 'guest');
const lobbyRect = () => rectOf(0, 'lobby') ?? HOTEL_FORECOURT;

/** Resepsionis: menyambut tamu di mejanya (melambai), lalu menunggu. */
function frontDeskJob(i) {
  const p = spread(i, lobbyRect());
  return jobBuilder(p, 0).go(p, 20000, 'greeting').go(p, 40000, 'standing').build();
}

/** Bellboy: ambil bagasi di lobi, naik lift ke lantai tamu, antar ke kamar, turun lagi. Empat pengantaran per putaran. */
function bellboyJob(i) {
  const base = spread(i, lobbyRect());
  const b = jobBuilder(base, 0).go(base, 15000, 'serving');
  for (let k = 0; k < 4; k++) {
    const level = GUEST_LEVELS[(i * 131 + k * 277) % GUEST_LEVELS.length];
    const rooms = guestRooms(level);
    const room = rooms[(i * 7 + k * 5) % rooms.length];
    const door = { x: room.door.x, z: room.door.z };
    b.lift(level).go(door).go({ x: room.bed.x, z: room.bed.z }, 12000, 'serving', room.no).go(door).lift(0).go(base, 8000, 'serving');
  }
  return b.build();
}

/** Valet: menyambut tamu di drop-off, lalu memeriksa mobil di slot parkir (mobil asli tidak dipindahkan). */
function valetJob(i) {
  const spots = HOTEL_CAR_SPOTS.filter((s) => s.id.startsWith('hp_'));
  const a = spread(i, HOTEL_FORECOURT);
  const b = jobBuilder(a, 0);
  for (let k = 0; k < 3; k++) {
    const s = spots[(i * 5 + k * 4) % spots.length];
    b.go(a, 12000, 'greeting').go({ x: s.x - 4, z: s.z }, 8000, 'working');
  }
  return b.go(a).build();
}

/** Pelayan: ambil pesanan di konter ruang makan, antar ke meja bergantian. */
function waiterJob(i) {
  const rect = rectOf(0, ['grand_dining', 'specialty_dining'][i % 2]) ?? HOTEL_FORECOURT;
  const counter = { x: rect[0] + 1.5, z: rect[1] + 1.5 };
  const b = jobBuilder(counter, 0);
  for (let k = 0; k < 4; k++) b.go(counter, 6000, 'standing').go(spread(i * 7 + k * 3 + 1, rect), 10000, 'serving');
  return b.go(counter).build();
}

/** Satpam: berkeliling empat titik jaga (di dalam lobi atau di halaman depan) sambil mengawasi. */
function securityJob(i) {
  const pts = corners(i % 2 ? inset(HOTEL_FORECOURT, 3) : inset(lobbyRect(), 2));
  const s = (i >> 1) % 4;
  const b = jobBuilder(pts[s], 0);
  for (let k = 0; k < 4; k++) b.go(pts[(s + k) % 4], 25000, 'watching');
  return b.go(pts[s]).build();
}

/** Tukang kebun: tiap orang punya petak sendiri (16 x 16 m) di halaman barat dan merawat lima titik di dalamnya (menyiram, memangkas). */
function gardenerJob(i) {
  const c = spread(i, WEST_GROUNDS);
  const plot = [c.x - 8, c.z - 8, c.x + 8, c.z + 8];
  const pts = Array.from({ length: 5 }, (_, k) => spread(k + 1, plot));
  const b = jobBuilder(pts[0], 0);
  for (const p of pts) b.go(p, 14000, 'working');
  return b.go(pts[0]).build();
}

/** Penjaga kolam: berkeliling tepi ruang kolam di lantai 3 (indeks lantai 2) sambil mengawasi perenang. */
function lifeguardJob(i) {
  const pts = corners(inset(rectOf(2, 'indoor_pool') ?? HOTEL_FORECOURT, 2));
  const s = i % 4;
  const b = jobBuilder(pts[s], 2);
  for (let k = 0; k < 4; k++) b.go(pts[(s + k) % 4], 20000, 'watching');
  return b.go(pts[s]).build();
}

const ROLE_JOBS = { front_desk: frontDeskJob, bellboy: bellboyJob, valet: valetJob, waiter: waiterJob, security: securityJob, gardener: gardenerJob, lifeguard: lifeguardJob };
const PHASE_MS = 29000; // geser fase antar petugas seperan agar tidak serempak
const roleJobs = new Map();
const jobFor = (staff) => {
  if (!roleJobs.has(staff.id)) roleJobs.set(staff.id, ROLE_JOBS[staff.role]?.(staff.index) ?? null);
  return roleJobs.get(staff.id);
};
const ROAMERS = STAFF.filter((s) => ROLE_JOBS[s.role]);

/** Keadaan satu petugas peran lain (resepsionis, bellboy, valet, pelayan, satpam, tukang kebun, penjaga kolam). */
function workerState(staff, hour) {
  const job = jobFor(staff);
  if (!job?.totalMs) return null;
  return { id: staff.id, role: staff.role, ...jobState(job, (sinceShiftMs(staff, hour) + staff.index * PHASE_MS) % job.totalMs) };
}

// ---------------------------------------------------------------- petugas parkir: berpatroli di sepanjang slot parkir tamu
const PARKING_DWELL_MS = 12000; // berhenti mengarahkan mobil di tiap slot
let patrol = null;
function parkingPatrol() {
  if (patrol) return patrol;
  const spots = HOTEL_CAR_SPOTS.filter((s) => s.id.startsWith('hp_'));
  const row = (r) => spots.filter((s) => s.id.startsWith(`hp_${r}_`)).sort((a, b) => a.z - b.z);
  const points = [...row(0), ...row(1).reverse()].map((s) => ({ x: s.x - 4, z: s.z })); // berdiri di samping mobil, bukan di atasnya
  const b = jobBuilder(points[points.length - 1], 0);
  for (const p of points) b.go(p, PARKING_DWELL_MS, 'directing');
  patrol = b.build();
  return patrol;
}
const PARKING_STAFF = STAFF.filter((s) => s.role === 'parking');

/** Keadaan satu petugas parkir: berjalan dari slot ke slot dan berhenti ('directing') mengarahkan mobil. */
export function parkingState(staff, hour) {
  const p = parkingPatrol();
  if (!p.totalMs) return null;
  return { id: staff.id, role: staff.role, ...jobState(p, (sinceShiftMs(staff, hour) + staff.index * PHASE_MS) % p.totalMs) };
}

/** Keadaan satu petugas pada jam permainan `hour`. */
export function staffState(staff, hour) {
  if (staff.role === 'housekeeping') return housekeeperState(staff, hour);
  if (staff.role === 'parking') return parkingState(staff, hour);
  return workerState(staff, hour);
}

/** Petugas yang sedang bertugas DAN berada di lantai ini pada jam permainan `hour` (bellboy berpindah lantai lewat lift). */
export function staffOnLevel(level, hour) {
  const out = [];
  for (const staff of ROAMERS) {
    if (!onDuty(staff, hour)) continue;
    const st = workerState(staff, hour);
    if (st?.level === level) out.push(st);
  }
  if (level === 0) for (const staff of PARKING_STAFF) if (onDuty(staff, hour)) out.push(parkingState(staff, hour));
  const k = cleanerForLevel(level);
  if (k !== null && onDuty(CLEANERS[k], hour)) {
    const st = housekeeperState(CLEANERS[k], hour);
    if (st && st.level === level) out.push(st);
  }
  return out;
}

/** Tugas yang dihitung sebagai bekerja (selain berjalan, naik lift, dan menunggu). */
export const WORK_TASKS = Object.freeze(['cleaning', 'directing', 'serving', 'greeting', 'working', 'watching']);

/** Apa yang sedang dikerjakan semua petugas yang bertugas pada jam ini: jumlah per tugas (untuk panel admin). */
export function workSummary(hour) {
  const byTask = {};
  for (const s of STAFF) {
    if (!onDuty(s, hour)) continue;
    const st = staffState(s, hour);
    if (st) byTask[st.task] = (byTask[st.task] ?? 0) + 1;
  }
  return byTask;
}

/** Jumlah petugas yang sedang bertugas per peran pada jam ini (untuk panel admin). */
export function dutySummary(hour) {
  const byRole = Object.fromEntries(Object.keys(STAFF_ROLES).map((r) => [r, 0]));
  let total = 0;
  for (const s of STAFF) {
    if (!onDuty(s, hour)) continue;
    byRole[s.role]++;
    total++;
  }
  return { total, byRole };
}

// ---------------------------------------------------------------- tampilan: seragam, tindakan, dan pemilihan petugas yang digambar
// Seragam per peran memakai indeks OUTFITS/HAIR_COLORS dari avatar-config.js; kulit dan rambut diturunkan dari id petugas (deterministik).
const UNIFORMS = Object.freeze({
  housekeeping: { o: 8 }, // Teal
  front_desk: { o: 2 }, // Emas
  bellboy: { o: 10 }, // Cokelat
  security: { o: 5, a: 6, k: 0 }, // Hitam + topi hitam
  waiter: { o: 4 }, // Putih Gading
  valet: { o: 3, a: 6, k: 0 }, // Biru Navy + topi hitam
  parking: { o: 9, a: 6, k: 11 }, // Oranye + topi emas (mudah terlihat)
  gardener: { o: 0, a: 6, k: 2 }, // Hijau Zamrud + topi cokelat
  lifeguard: { o: 1 }, // Maroon
});

/** Konfigurasi avatar sederhana (avatar-config.js) untuk satu petugas: seragam menurut peran, kulit dan rambut menurut id. */
export function staffConfig(staff) {
  const base = configFromId(staff.id);
  const u = UNIFORMS[staff.role] ?? {};
  return sanitizeConfig({ ...base, o: u.o ?? base.o, a: u.a ?? 0, k: u.k ?? base.k, m: 0 });
}

/** Pose avatar (applyPose) per tugas: berjalan; membungkuk (membersihkan, melayani, merawat); melambai (menyambut, mengarahkan mobil); selain itu berdiri. */
export const staffActFor = (task) => ({ walking: 'walk', cleaning: 'bow', serving: 'bow', working: 'bow', directing: 'wave', greeting: 'wave' })[task] ?? null;

// Satu avatar sederhana sekitar 30 mesh, jadi jumlah yang digambar sekaligus dibatasi (ratusan petugas lain hanya dihitung).
export const STAFF_VIEW_RADIUS = 40; // meter dari pemain
export const STAFF_VIEW_MAX = 14;

/** Petugas yang digambar: dalam radius dari pemain, paling dekat dahulu, paling banyak `max`. */
export function pickNearby(list, me, radius = STAFF_VIEW_RADIUS, max = STAFF_VIEW_MAX) {
  return list
    .map((s) => ({ s, d: Math.hypot(s.x - me.x, s.z - me.z) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : 1))
    .slice(0, max)
    .map(({ s }) => s);
}
