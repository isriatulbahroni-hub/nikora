// Karyawan NIKORA Grand Hotel: ratusan petugas yang disimulasikan sebagai jadwal, bukan ratusan avatar sekaligus.
// Posisi hanya dihitung untuk lantai yang sedang dekat pemain (staffOnLevel); sisanya cukup dihitung jumlahnya (dutySummary).
// Modul murni (tanpa THREE) dan deterministik: posisi petugas adalah fungsi dari jam permainan, jadi semua klien melihat hal yang sama.
// Rute lorong masih garis lurus antar titik pintu (belum navmesh) dan belum digambar sebagai avatar; lihat docs/HOTEL_KARYAWAN.md.
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

// ---------------------------------------------------------------- tugas membersihkan satu lantai
const WALK_MPS = 1.4; // kecepatan jalan petugas (m/detik)
export const CLEAN_MS = 20000; // lama membersihkan satu kamar
const jobs = new Map();
const mid = (r) => ({ x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 });

/** Satu putaran membersihkan semua kamar di satu lantai: titik tengah inti -> (pintu -> tempat tidur -> pintu) per kamar -> inti. */
function floorJob(level) {
  let job = jobs.get(level);
  if (job) return job;
  const hub = mid(HOTEL_CORE);
  const legs = [];
  let cur = hub;
  const go = (to, dwellMs, roomNo) => {
    legs.push({ from: cur, to, walkMs: (Math.hypot(to.x - cur.x, to.z - cur.z) / WALK_MPS) * 1000, dwellMs, roomNo });
    cur = to;
  };
  for (const room of hotelRoomsAtLevel(level)) {
    if (room.kind !== 'guest') continue;
    const door = { x: room.door.x, z: room.door.z };
    go(door, 0, room.no);
    go({ x: room.bed.x, z: room.bed.z }, CLEAN_MS, room.no);
    go(door, 0, room.no);
  }
  go(hub, 0, null);
  job = Object.freeze({ level, legs, totalMs: legs.reduce((sum, l) => sum + l.walkMs + l.dwellMs, 0) });
  jobs.set(level, job);
  return job;
}

function jobState(job, t, dwellTask = 'cleaning') {
  let rest = t;
  for (const l of job.legs) {
    if (rest < l.walkMs) {
      const f = l.walkMs ? rest / l.walkMs : 1;
      return { x: l.from.x + (l.to.x - l.from.x) * f, z: l.from.z + (l.to.z - l.from.z) * f, task: 'walking', roomNo: l.roomNo };
    }
    rest -= l.walkMs;
    if (rest < l.dwellMs) return { x: l.to.x, z: l.to.z, task: dwellTask, roomNo: l.roomNo };
    rest -= l.dwellMs;
  }
  const last = job.legs[job.legs.length - 1];
  return { x: last.to.x, z: last.to.z, task: 'walking', roomNo: null };
}

/** Keadaan satu cleaning service pada jam permainan `hour`: lantai, posisi, dan tugas ('walking' | 'cleaning'). Mulai dari awal shift. */
export function housekeeperState(staff, hour) {
  const levels = cleanerLevels(staff.index);
  if (!levels.length) return null;
  const list = levels.map(floorJob);
  const cycle = list.reduce((sum, j) => sum + j.totalMs, 0);
  const sinceShift = (((hour - SHIFTS[staff.shift].from) % 24) + 24) % 24;
  let t = (sinceShift * 3600000) % cycle;
  for (const job of list) {
    if (t < job.totalMs) return { id: staff.id, role: staff.role, level: job.level, ...jobState(job, t) };
    t -= job.totalMs;
  }
  return null;
}

// ---------------------------------------------------------------- petugas yang berjaga di pos tetap
const frac = (n) => n - Math.floor(n);
const spread = (index, r) => ({ x: r[0] + (r[2] - r[0]) * (0.15 + 0.7 * frac(index * 0.6180339887)), z: r[1] + (r[3] - r[1]) * (0.15 + 0.7 * frac(index * 0.7548776662)) });
const roomRect = (level, id) => hotelRoomsAtLevel(level).find((r) => r.id === id)?.rect ?? null;
const WEST_GROUNDS = Object.freeze([HOTEL_SITE.minX + 5, HOTEL_SITE.minZ + 5, -45, HOTEL_SITE.maxZ - 5]); // halaman barat, di luar menara

function postFor(staff) {
  const i = staff.index;
  const inRoom = (level, ids) => {
    const rect = roomRect(level, ids[i % ids.length]);
    return rect ? { level, ...spread(i, rect) } : null;
  };
  switch (staff.role) {
    case 'front_desk': return inRoom(0, ['lobby']);
    case 'bellboy': return inRoom(0, ['concierge', 'lobby']);
    case 'security': return i % 2 ? { level: 0, ...spread(i, HOTEL_FORECOURT) } : inRoom(0, ['lobby']);
    case 'waiter': return inRoom(0, ['grand_dining', 'specialty_dining']);
    case 'valet': return { level: 0, ...spread(i, HOTEL_FORECOURT) };
    case 'gardener': return { level: 0, ...spread(i, WEST_GROUNDS) };
    case 'lifeguard': return inRoom(2, ['indoor_pool']);
    default: return null;
  }
}

const postedByLevel = new Map();
for (const staff of STAFF) {
  if (staff.role === 'housekeeping') continue;
  const post = postFor(staff);
  if (!post) continue;
  if (!postedByLevel.has(post.level)) postedByLevel.set(post.level, []);
  postedByLevel.get(post.level).push({ staff, post });
}

// ---------------------------------------------------------------- petugas parkir: berpatroli di sepanjang slot parkir tamu
const PARKING_DWELL_MS = 6000; // berhenti mengarahkan mobil di tiap slot
const PARKING_PHASE_MS = 41000; // geser fase antar petugas agar tidak berbaris
let patrol = null;
function parkingPatrol() {
  if (patrol) return patrol;
  const spots = HOTEL_CAR_SPOTS.filter((s) => s.id.startsWith('hp_'));
  const row = (r) => spots.filter((s) => s.id.startsWith(`hp_${r}_`)).sort((a, b) => a.z - b.z);
  const points = [...row(0), ...row(1).reverse()].map((s) => ({ x: s.x - 4, z: s.z })); // berdiri di samping mobil, bukan di atasnya
  const legs = points.map((to, i) => {
    const from = points[(i + points.length - 1) % points.length];
    return { from, to, walkMs: (Math.hypot(to.x - from.x, to.z - from.z) / WALK_MPS) * 1000, dwellMs: PARKING_DWELL_MS, roomNo: null };
  });
  patrol = Object.freeze({ legs, totalMs: legs.reduce((sum, l) => sum + l.walkMs + l.dwellMs, 0) });
  return patrol;
}
const PARKING_STAFF = STAFF.filter((s) => s.role === 'parking');

/** Keadaan satu petugas parkir: berjalan dari slot ke slot dan berhenti ('directing') mengarahkan mobil. */
export function parkingState(staff, hour) {
  const p = parkingPatrol();
  if (!p.legs.length) return null;
  const sinceShift = (((hour - SHIFTS[staff.shift].from) % 24) + 24) % 24;
  const t = (sinceShift * 3600000 + staff.index * PARKING_PHASE_MS) % p.totalMs;
  return { id: staff.id, role: staff.role, level: 0, ...jobState(p, t, 'directing') };
}

/** Keadaan satu petugas (cleaning service dan petugas parkir bergerak, lainnya berdiri di posnya). */
export function staffState(staff, hour) {
  if (staff.role === 'housekeeping') return housekeeperState(staff, hour);
  if (staff.role === 'parking') return parkingState(staff, hour);
  const post = postedByLevel.get(postFor(staff)?.level)?.find((p) => p.staff.id === staff.id)?.post;
  return post ? { id: staff.id, role: staff.role, level: post.level, x: post.x, z: post.z, task: 'standing', roomNo: null } : null;
}

/** Petugas yang sedang bertugas DAN berada di lantai ini pada jam permainan `hour`. Murah: hanya mengecek petugas lantai itu. */
export function staffOnLevel(level, hour) {
  const out = [];
  for (const { staff, post } of postedByLevel.get(level) ?? []) {
    if (onDuty(staff, hour)) out.push({ id: staff.id, role: staff.role, level, x: post.x, z: post.z, task: 'standing', roomNo: null });
  }
  if (level === 0) for (const staff of PARKING_STAFF) if (onDuty(staff, hour)) out.push(parkingState(staff, hour));
  const k = cleanerForLevel(level);
  if (k !== null && onDuty(CLEANERS[k], hour)) {
    const st = housekeeperState(CLEANERS[k], hour);
    if (st && st.level === level) out.push(st);
  }
  return out;
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
