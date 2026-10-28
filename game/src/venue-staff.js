// Karyawan tempat acara (villa, royal, aula, masjid): ratusan petugas yang disimulasikan sebagai jadwal, bukan ratusan avatar sekaligus.
// Pola sama dengan hotel-staff.js (hotel TIDAK disentuh): modul murni tanpa THREE, deterministik, posisi = fungsi dari jam permainan.
// Tiga shift sehari seperti hotel. Di luar shift karyawan ada di hotel (tempat tinggal mereka): 30 menit sebelum shift mereka
// berangkat ('arriving') dan 30 menit setelahnya pulang ('leaving'), naik sepeda motor sendiri atau bus antar-jemput (transport).
// Tahap ini hanya karyawannya. Parkir tamu/karyawan, mobil dinas villa, dan bus antar-jemput menyusul (lihat commuteSummary).
import { configFromId, sanitizeConfig } from './avatar-config.js';
import { ROOMS as VILLA_ROOMS, UPPER_ROOMS as VILLA_UPPER, ZONES as VILLA_ZONES, TOWERS as VILLA_TOWERS } from './villa-layout.js';
import { ROOMS as ROYAL_ROOMS, ZONES as ROYAL_ZONES } from './royal-layout.js';
import { ROOMS as MASJID_ROOMS, ZONES as MASJID_ZONES } from './masjid-layout.js';
import { GARDEN as MASJID_GARDEN } from './masjid-garden-data.js';
import { HALL } from './hall-layout.js';

export const STAFF_HOME = 'hotel'; // semua karyawan pulang ke hotel setelah shift
export const COMMUTE_H = 0.5; // lama berangkat/pulang (jam permainan)

// Tiga shift sehari (jam permainan 0..24), sama dengan hotel. Peran dengan `shifts: [0, 1]` tidak masuk shift malam.
export const SHIFTS = Object.freeze([
  Object.freeze({ id: 'pagi', from: 6, to: 14 }),
  Object.freeze({ id: 'siang', from: 14, to: 22 }),
  Object.freeze({ id: 'malam', from: 22, to: 6 }),
]);
const inShift = (shift, hour) => {
  const h = ((hour % 24) + 24) % 24;
  return shift.from < shift.to ? h >= shift.from && h < shift.to : h >= shift.from || h < shift.to;
};
const within = (hour, from, len) => ((((hour - from) % 24) + 24) % 24) < len;

// ---------------------------------------------------------------- area kerja (diambil dari denah tiap tempat acara)
const area = (id, rect, level = 0) => Object.freeze({ id, rect: Object.freeze([...rect]), level });
const find = (lists, id) => {
  const hit = lists.flat().find((r) => r.id === id);
  if (!hit) throw new Error(`venue-staff: area "${id}" tidak ada di denah`);
  return area(id, hit.rect, hit.level ?? 0);
};
const mid = (r) => ({ x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 });

const villaFind = (id) => find([VILLA_ROOMS, VILLA_UPPER, VILLA_ZONES], id);
const VILLA_AREAS = Object.freeze({
  lobby: villaFind('lobby'),
  hall: villaFind('wedding_hall'),
  restaurant: villaFind('restaurant'),
  kitchen: villaFind('kitchen'),
  spa: villaFind('spa'),
  corridor: villaFind('corridor'),
  parking: villaFind('parking'),
  courtyard: villaFind('courtyard'),
  garden: villaFind('fountain_garden'),
  gate: area('gate', [-10, 70, 10, 82]), // di dalam gerbang selatan
  poolside: area('poolside', [-9, 0, 9, 18]), // tepi luar kolam (kolam sendiri x -7..7)
});
const VILLA_GUEST_ROOMS = Object.freeze(Array.from({ length: 16 }, (_, k) => villaFind(`guest_${k + 1}`))); // 1-8 lantai 0, 9-16 lantai 1
const VILLA_HUB = mid(VILLA_TOWERS.find((t) => t.id === 'tower_g').rect); // menara tangga sayap tamu

const royalFind = (id) => find([ROYAL_ROOMS, ROYAL_ZONES], id);
const ROYAL_AREAS = Object.freeze({
  cathedral: royalFind('cathedral'),
  dining: royalFind('dining'),
  lounge: royalFind('lounge'),
  music: royalFind('music'),
  plaza: royalFind('plaza'),
  shore: royalFind('shore'),
  back: royalFind('back'),
  garden_w: royalFind('garden_w'),
  garden_e: royalFind('garden_e'),
});

const HB = HALL.bounds;
const HALL_AREAS = Object.freeze({
  whole: area('whole', [HB.minX + 2, HB.minZ + 1, HB.maxX - 2, HB.maxZ - 1]),
  entrance: area('entrance', [-8, 8.5, 8, 11.5]),
  terrace: area('terrace', [-20, -24, 20, -18.5]),
  promenade: area('promenade', [-4, -12, 4, 8]),
  west: area('west', [-27, -14, -21, 10]),
  east: area('east', [21, -14, 27, 10]),
});

const masjidFind = (id) => find([MASJID_ROOMS, MASJID_ZONES], id);
const MASJID_AREAS = Object.freeze({
  prayer_hall: masjidFind('prayer_hall'),
  women_hall: masjidFind('women_hall'),
  library: masjidFind('library'),
  tahfidz: masjidFind('tahfidz'),
  museum: masjidFind('museum'),
  wudhu_east: masjidFind('wudhu_east'),
  wudhu_west: masjidFind('wudhu_west'),
  walimah: masjidFind('walimah'),
  sahn: masjidFind('sahn'),
  forecourt: masjidFind('forecourt'),
  plaza_e: masjidFind('plaza_e'),
  plaza_w: masjidFind('plaza_w'),
  rear: masjidFind('rear'),
  riwaq_e: masjidFind('riwaq_e'),
  riwaq_w: masjidFind('riwaq_w'),
  riwaq_s: masjidFind('riwaq_s'),
  taman: area('taman', MASJID_GARDEN.rect),
  gate: area('gate', [-30, 226, 30, 238]), // di dalam Gerbang Utama
  sandal: area('sandal', [-60, -37, 60, -30]), // depan pintu Aula Shalat Utama
});

// ---------------------------------------------------------------- peran per tempat acara
// kind: post = berdiri di satu titik; patrol = keliling empat sudut area; rounds = singgah di beberapa titik; serve = konter <-> meja;
// clean_rooms = membersihkan kamar tamu villa (naik turun lewat menara tangga). busTenths = per sepuluh karyawan yang naik bus jemputan.
const role = (name, count, kind, areas, extra = {}) => Object.freeze({ name, count, kind, areas, ...extra });
export const VENUE_DEFS = Object.freeze({
  villa: Object.freeze({
    label: 'NIKORA Wedding Villa',
    busTenths: 3,
    areas: VILLA_AREAS,
    guestRooms: VILLA_GUEST_ROOMS,
    hub: VILLA_HUB,
    roles: Object.freeze({
      front_desk: role('Resepsionis', 6, 'post', ['lobby'], { task: 'greeting' }),
      bellboy: role('Bellboy', 8, 'rounds', ['lobby', 'corridor', 'parking', 'lobby'], { task: 'serving', stops: 4, dwellMs: 12000 }),
      housekeeping: role('Cleaning Service', 24, 'clean_rooms', [], { shifts: [0, 1] }),
      kitchen: role('Staf Dapur', 12, 'rounds', ['kitchen'], { task: 'working', stops: 4, dwellMs: 15000 }),
      waiter: role('Pelayan Restoran', 16, 'serve', ['kitchen', 'restaurant'], { stops: 4 }),
      security: role('Satpam', 14, 'patrol', ['gate', 'parking', 'courtyard', 'lobby'], { task: 'watching' }),
      gardener: role('Tukang Kebun', 12, 'rounds', ['garden', 'courtyard'], { task: 'working', stops: 5, dwellMs: 14000 }),
      lifeguard: role('Penjaga Kolam', 4, 'patrol', ['poolside'], { task: 'watching', margin: 0, dwellMs: 20000 }),
      therapist: role('Terapis Spa', 6, 'rounds', ['spa'], { task: 'serving', stops: 3, dwellMs: 30000 }),
      parking: role('Petugas Parkir', 8, 'patrol', ['parking'], { task: 'directing', dwellMs: 12000 }),
      technician: role('Teknisi', 10, 'rounds', ['hall', 'lobby', 'kitchen', 'restaurant'], { task: 'working', stops: 4, dwellMs: 20000 }),
    }),
  }),
  royal: Object.freeze({
    label: 'The Royal Wedding · Istana Cinta',
    busTenths: 3,
    areas: ROYAL_AREAS,
    roles: Object.freeze({
      greeter: role('Penyambut Tamu', 8, 'post', ['plaza', 'shore'], { task: 'greeting' }),
      usher: role('Pengatur Kursi', 12, 'rounds', ['cathedral'], { task: 'serving', stops: 5, dwellMs: 12000 }),
      waiter: role('Pelayan VIP', 16, 'serve', ['dining', 'dining'], { stops: 4 }),
      caterer: role('Katering', 8, 'rounds', ['dining', 'lounge'], { task: 'working', stops: 4, dwellMs: 15000 }),
      security: role('Satpam', 14, 'patrol', ['plaza', 'shore', 'garden_w', 'garden_e'], { task: 'watching' }),
      gardener: role('Tukang Kebun', 14, 'rounds', ['garden_w', 'garden_e', 'back', 'shore'], { task: 'working', stops: 5, dwellMs: 14000 }),
      crew: role('Kru Panggung', 6, 'rounds', ['music'], { task: 'working', stops: 3, dwellMs: 25000 }),
      cleaner: role('Petugas Kebersihan', 12, 'rounds', ['cathedral', 'lounge', 'dining', 'plaza'], { task: 'cleaning', stops: 4, dwellMs: 20000, shifts: [0, 1] }),
      lounge_host: role('Host Lounge', 6, 'post', ['lounge'], { task: 'greeting' }),
      valet: role('Petugas Dermaga', 4, 'patrol', ['shore'], { task: 'directing', dwellMs: 12000 }),
    }),
  }),
  hall: Object.freeze({
    label: 'Aula Resepsi',
    busTenths: 2,
    areas: HALL_AREAS,
    roles: Object.freeze({
      greeter: role('Penyambut Tamu', 6, 'post', ['entrance'], { task: 'greeting' }),
      waiter: role('Pelayan', 14, 'serve', ['terrace', 'terrace'], { stops: 4 }),
      security: role('Satpam', 8, 'patrol', ['whole'], { task: 'watching' }),
      gardener: role('Tukang Kebun', 8, 'rounds', ['west', 'east'], { task: 'working', stops: 4, dwellMs: 14000 }),
      cleaner: role('Petugas Kebersihan', 6, 'rounds', ['promenade', 'entrance'], { task: 'cleaning', stops: 4, dwellMs: 20000, shifts: [0, 1] }),
      technician: role('Teknisi', 4, 'rounds', ['terrace', 'promenade'], { task: 'working', stops: 3, dwellMs: 20000 }),
      pool_cleaner: role('Perawat Kolam', 4, 'rounds', ['promenade', 'west', 'east'], { task: 'working', stops: 4, dwellMs: 16000 }),
    }),
  }),
  masjid: Object.freeze({
    label: 'Masjid Agung NIKORA',
    busTenths: 3,
    areas: MASJID_AREAS,
    roles: Object.freeze({
      cleaner: role('Petugas Kebersihan', 50, 'rounds', ['prayer_hall', 'sahn', 'riwaq_e', 'riwaq_w', 'wudhu_east', 'wudhu_west', 'women_hall', 'riwaq_s'], { task: 'cleaning', stops: 5, dwellMs: 18000 }),
      security: role('Satpam', 30, 'patrol', ['gate', 'forecourt', 'plaza_e', 'plaza_w', 'sahn'], { task: 'watching' }),
      gardener: role('Tukang Kebun', 24, 'rounds', ['forecourt', 'plaza_e', 'plaza_w', 'rear', 'taman'], { task: 'working', stops: 5, dwellMs: 14000 }),
      wudhu_attendant: role('Petugas Wudhu', 12, 'rounds', ['wudhu_east', 'wudhu_west'], { task: 'working', stops: 3, dwellMs: 20000 }),
      librarian: role('Pustakawan', 6, 'rounds', ['library'], { task: 'serving', stops: 3, dwellMs: 20000 }),
      guide: role('Pemandu', 12, 'rounds', ['museum', 'prayer_hall', 'sahn'], { task: 'greeting', stops: 4, dwellMs: 20000 }),
      teacher: role('Pengajar Tahfidz', 8, 'post', ['tahfidz'], { task: 'standing' }),
      event_crew: role('Kru Walimah', 16, 'serve', ['walimah', 'walimah'], { stops: 4 }),
      parking: role('Petugas Parkir', 14, 'patrol', ['forecourt'], { task: 'directing', dwellMs: 12000 }),
      sandal_keeper: role('Penjaga Sandal', 12, 'post', ['sandal'], { task: 'standing' }),
      technician: role('Teknisi', 16, 'rounds', ['prayer_hall', 'sahn', 'library', 'museum'], { task: 'working', stops: 4, dwellMs: 20000 }),
    }),
  }),
});

export const STAFF_VENUES = Object.freeze(Object.keys(VENUE_DEFS));
/** Peran dan jumlahnya per tempat acara: { villa: { security: { name, count }, ... }, ... } (untuk panel admin). */
export const VENUE_STAFF_ROLES = Object.freeze(Object.fromEntries(STAFF_VENUES.map((v) => [v, Object.freeze(Object.fromEntries(Object.entries(VENUE_DEFS[v].roles).map(([k, r]) => [k, Object.freeze({ name: r.name, count: r.count })])))])));

const pad = (n) => String(n + 1).padStart(3, '0');
function buildStaff(venue) {
  const def = VENUE_DEFS[venue];
  let n = 0;
  return Object.freeze(
    Object.entries(def.roles).flatMap(([roleKey, spec]) => {
      const shifts = spec.shifts ?? [0, 1, 2];
      return Array.from({ length: spec.count }, (_, index) => {
        const staff = Object.freeze({
          id: `${venue}_${roleKey}_${pad(index)}`,
          venue,
          role: roleKey,
          index,
          shift: shifts[index % shifts.length],
          transport: (n * 7 + 3) % 10 < def.busTenths ? 'bus' : 'motor', // sebagian tidak punya kendaraan -> bus jemputan; sisanya sepeda motor
        });
        n++;
        return staff;
      });
    }),
  );
}
/** Semua karyawan per tempat acara. */
export const VENUE_STAFF = Object.freeze(Object.fromEntries(STAFF_VENUES.map((v) => [v, buildStaff(v)])));
export const venueStaffTotal = (venue) => VENUE_STAFF[venue]?.length ?? 0;

/** Apakah karyawan sedang bertugas pada jam (pecahan) permainan ini. */
export const onDuty = (staff, hour) => inShift(SHIFTS[staff.shift], hour);

/** Di mana karyawan sekarang: 'working' (di tempat acara), 'arriving' / 'leaving' (di jalan antara hotel dan tempat acara), atau 'hotel'. */
export function presence(staff, hour) {
  const sh = SHIFTS[staff.shift];
  if (inShift(sh, hour)) return 'working';
  if (within(hour, sh.from - COMMUTE_H, COMMUTE_H)) return 'arriving';
  if (within(hour, sh.to, COMMUTE_H)) return 'leaving';
  return 'hotel';
}

// ---------------------------------------------------------------- mesin pekerjaan: urutan 'leg' yang berulang (sama dengan hotel-staff.js)
const WALK_MPS = 1.4; // kecepatan jalan (m/detik)
export const CLEAN_MS = 20000; // lama membersihkan satu kamar
const LIFT_MS = 8000; // lama naik/turun tangga (simbolis)
const PHASE_MS = 29000; // geser fase antar karyawan agar tidak serempak
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function jobBuilder(start, level, hub = null) {
  const legs = [];
  let cur = start;
  let lv = level;
  const api = {
    level: () => lv,
    go(to, dwellMs = 0, task = 'standing', toLevel = lv) {
      lv = toLevel;
      legs.push({ from: cur, to, level: lv, walkMs: (dist(cur, to) / WALK_MPS) * 1000, dwellMs, task });
      cur = to;
      return api;
    },
    lift(toLevel) {
      api.go(hub, LIFT_MS, 'riding');
      lv = toLevel;
      return api;
    },
    build: () => Object.freeze({ legs, totalMs: legs.reduce((sum, l) => sum + l.walkMs + l.dwellMs, 0) }),
  };
  return api;
}

function jobState(job, t) {
  let rest = t;
  for (const l of job.legs) {
    if (rest < l.walkMs) {
      const f = l.walkMs ? rest / l.walkMs : 1;
      return { x: l.from.x + (l.to.x - l.from.x) * f, z: l.from.z + (l.to.z - l.from.z) * f, level: l.level, task: 'walking' };
    }
    rest -= l.walkMs;
    if (rest < l.dwellMs) return { x: l.to.x, z: l.to.z, level: l.level, task: l.task };
    rest -= l.dwellMs;
  }
  const last = job.legs[job.legs.length - 1];
  return { x: last.to.x, z: last.to.z, level: last.level, task: 'walking' };
}

const frac = (n) => n - Math.floor(n);
const spread = (n, r) => ({ x: r[0] + (r[2] - r[0]) * (0.15 + 0.7 * frac(n * 0.6180339887)), z: r[1] + (r[3] - r[1]) * (0.15 + 0.7 * frac(n * 0.7548776662)) });
const insetRect = (r, m) => {
  const mm = Math.min(m, (r[2] - r[0]) / 4, (r[3] - r[1]) / 4);
  return [r[0] + mm, r[1] + mm, r[2] - mm, r[3] - mm];
};
const corners = (r) => [{ x: r[0], z: r[1] }, { x: r[2], z: r[1] }, { x: r[2], z: r[3] }, { x: r[0], z: r[3] }];

const JOB_KINDS = {
  post(def, spec, i) {
    const a = def.areas[spec.areas[i % spec.areas.length]];
    const p = spread(i, a.rect);
    const task = spec.task ?? 'standing';
    return jobBuilder(p, a.level).go(p, 20000, task).go(p, 40000, 'standing').build();
  },
  patrol(def, spec, i) {
    const a = def.areas[spec.areas[i % spec.areas.length]];
    const pts = corners(insetRect(a.rect, spec.margin ?? 2));
    const s = Math.floor(i / spec.areas.length) % 4;
    const b = jobBuilder(pts[s], a.level);
    for (let k = 0; k < 4; k++) b.go(pts[(s + k) % 4], spec.dwellMs ?? 25000, spec.task ?? 'watching');
    return b.go(pts[s]).build();
  },
  rounds(def, spec, i) {
    const stops = spec.stops ?? 4;
    const at = (k) => {
      const a = def.areas[spec.areas[(i + k) % spec.areas.length]];
      return { a, p: spread(i * 7 + k * 3 + 1, a.rect) };
    };
    const first = at(0);
    const b = jobBuilder(first.p, first.a.level);
    for (let k = 0; k < stops; k++) {
      const { a, p } = at(k);
      b.go(p, spec.dwellMs ?? 15000, spec.task ?? 'working', a.level);
    }
    return b.go(first.p, 0, 'walking', first.a.level).build();
  },
  serve(def, spec, i) {
    const counterArea = def.areas[spec.areas[0]];
    const tableArea = def.areas[spec.areas[1] ?? spec.areas[0]];
    const counter = spread(i, counterArea.rect);
    const b = jobBuilder(counter, counterArea.level).go(counter, 6000, 'standing');
    for (let k = 0; k < (spec.stops ?? 4); k++) b.go(spread(i * 7 + k * 3 + 1, tableArea.rect), 10000, 'serving', tableArea.level).go(counter, 6000, 'standing', counterArea.level);
    return b.build();
  },
  clean_rooms(def, spec, i) {
    const rooms = def.guestRooms;
    const b = jobBuilder(def.hub, 0, def.hub);
    for (let k = 0; k < 4; k++) {
      const room = rooms[(i * 5 + k * 3) % rooms.length];
      const [x1, z1, x2, z2] = room.rect;
      const cx = (x1 + x2) / 2;
      const north = z1 < 10;
      const door = { x: cx, z: north ? z2 : z1 };
      const bed = { x: cx, z: north ? z1 + 1.5 : z2 - 1.5 };
      if (room.level !== b.level()) b.lift(room.level);
      b.go(door).go(bed, CLEAN_MS, 'cleaning').go(door);
    }
    return (b.level() !== 0 ? b.lift(0) : b.go(def.hub)).build();
  },
};

const jobs = new Map();
function jobFor(staff) {
  if (!jobs.has(staff.id)) {
    const def = VENUE_DEFS[staff.venue];
    const spec = def.roles[staff.role];
    jobs.set(staff.id, JOB_KINDS[spec.kind](def, spec, staff.index));
  }
  return jobs.get(staff.id);
}

const sinceShiftMs = (staff, hour) => ((((hour - SHIFTS[staff.shift].from) % 24) + 24) % 24) * 3600000;

/** Keadaan satu karyawan yang sedang bertugas: posisi, lantai, dan tugas. Null bila sedang tidak bertugas. */
export function staffState(staff, hour) {
  if (!onDuty(staff, hour)) return null;
  const job = jobFor(staff);
  if (!job?.totalMs) return null;
  return { id: staff.id, venue: staff.venue, role: staff.role, ...jobState(job, (sinceShiftMs(staff, hour) + staff.index * PHASE_MS) % job.totalMs) };
}

/** Karyawan yang sedang bertugas DAN berada di lantai ini (villa punya lantai 0-2; tempat lain hanya 0). */
export function staffOnLevel(venue, level, hour) {
  const out = [];
  for (const staff of VENUE_STAFF[venue] ?? []) {
    const st = staffState(staff, hour);
    if (st && st.level === level) out.push(st);
  }
  return out;
}

/** Tugas yang dihitung sebagai bekerja (selain berjalan, naik tangga, dan menunggu). */
export const WORK_TASKS = Object.freeze(['cleaning', 'directing', 'serving', 'greeting', 'working', 'watching']);

/** Jumlah karyawan yang bertugas per peran pada jam ini (untuk panel admin). */
export function dutySummary(venue, hour) {
  const byRole = Object.fromEntries(Object.keys(VENUE_DEFS[venue].roles).map((r) => [r, 0]));
  let total = 0;
  for (const s of VENUE_STAFF[venue]) {
    if (!onDuty(s, hour)) continue;
    byRole[s.role]++;
    total++;
  }
  return { total, byRole };
}

/** Berapa karyawan sedang berangkat/pulang pada jam ini, per jenis kendaraan: dasar jumlah bus jemputan hotel <-> tempat acara. */
export function commuteSummary(venue, hour) {
  const out = { arriving: { motor: 0, bus: 0 }, leaving: { motor: 0, bus: 0 } };
  for (const s of VENUE_STAFF[venue]) {
    const p = presence(s, hour);
    if (p === 'arriving' || p === 'leaving') out[p][s.transport]++;
  }
  return out;
}

// ---------------------------------------------------------------- tampilan: seragam dan pose
// Indeks OUTFITS/HAIR_COLORS dari avatar-config.js; kulit dan rambut diturunkan dari id karyawan (deterministik).
const UNIFORMS = Object.freeze({
  housekeeping: { o: 8 },
  cleaner: { o: 8 },
  wudhu_attendant: { o: 8 },
  front_desk: { o: 2 },
  greeter: { o: 2 },
  lounge_host: { o: 2 },
  guide: { o: 2 },
  bellboy: { o: 10 },
  sandal_keeper: { o: 10 },
  security: { o: 5, a: 6, k: 0 },
  crew: { o: 5 },
  waiter: { o: 4 },
  caterer: { o: 4 },
  kitchen: { o: 4 },
  event_crew: { o: 4 },
  teacher: { o: 4 },
  valet: { o: 3, a: 6, k: 0 },
  usher: { o: 3 },
  parking: { o: 9, a: 6, k: 11 },
  gardener: { o: 0, a: 6, k: 2 },
  pool_cleaner: { o: 0 },
  lifeguard: { o: 1 },
  therapist: { o: 7 },
  librarian: { o: 7 },
  technician: { o: 6 },
});

/** Konfigurasi avatar sederhana (avatar-config.js) untuk satu karyawan. */
export function staffConfig(staff) {
  const base = configFromId(staff.id);
  const u = UNIFORMS[staff.role] ?? {};
  return sanitizeConfig({ ...base, o: u.o ?? base.o, a: u.a ?? 0, k: u.k ?? base.k, m: 0 });
}

/** Pose avatar (applyPose) per tugas. */
export const staffActFor = (task) => ({ walking: 'walk', cleaning: 'bow', serving: 'bow', working: 'bow', directing: 'wave', greeting: 'wave' })[task] ?? null;

// Satu avatar sederhana sekitar 30 mesh, jadi yang digambar sekaligus dibatasi; sisanya hanya dihitung.
export const STAFF_VIEW_RADIUS = 40; // meter dari pemain
export const STAFF_VIEW_MAX = 14;

/** Karyawan yang digambar: dalam radius dari pemain, paling dekat dahulu, paling banyak `max`. */
export function pickNearby(list, me, radius = STAFF_VIEW_RADIUS, max = STAFF_VIEW_MAX) {
  return list
    .map((s) => ({ s, d: Math.hypot(s.x - me.x, s.z - me.z) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : 1))
    .slice(0, max)
    .map(({ s }) => s);
}
