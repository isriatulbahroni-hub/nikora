import test from 'node:test';
import assert from 'node:assert/strict';
import { GUEST_LEVEL_COUNT, GUESTS_PER_LEVEL, HOTEL_BUILDING, HOTEL_FORECOURT, HOTEL_PARKING, HOTEL_SITE, hotelRoomsAtLevel } from './hotel-layout.js';
import {
  STAFF, STAFF_ROLES, STAFF_TOTAL, SHIFTS, CLEAN_MS, onDuty, cleanerForLevel, cleanerLevels, housekeeperState, parkingState, staffOnLevel, dutySummary,
  staffConfig, staffActFor, pickNearby, STAFF_VIEW_MAX, STAFF_VIEW_RADIUS, staffState, workSummary, WORK_TASKS,
} from './hotel-staff.js';

const inRect = (r, x, z) => x >= r[0] - 1e-6 && x <= r[2] + 1e-6 && z >= r[1] - 1e-6 && z <= r[3] + 1e-6;

test('roster: ratusan karyawan, id unik, jumlah per peran sesuai', () => {
  assert.equal(STAFF.length, STAFF_TOTAL);
  assert.ok(STAFF_TOTAL >= 300);
  assert.equal(new Set(STAFF.map((s) => s.id)).size, STAFF.length);
  for (const [role, { count }] of Object.entries(STAFF_ROLES)) assert.equal(STAFF.filter((s) => s.role === role).length, count);
});

test('tiap lantai tamu punya tepat satu cleaning service; lantai lain tidak', () => {
  const total = STAFF_ROLES.housekeeping.count;
  let assigned = 0;
  for (let k = 0; k < total; k++) {
    const levels = cleanerLevels(k);
    assert.ok(levels.length >= 1, `cleaner ${k} tanpa lantai`);
    for (const l of levels) assert.equal(cleanerForLevel(l), k);
    assigned += levels.length;
  }
  assert.equal(assigned, GUEST_LEVEL_COUNT);
  for (const l of [0, 1, 2, 3, 50, 100, 998, 999]) assert.equal(cleanerForLevel(l), null);
});

test('shift: lobi selalu ada resepsionis dan satpam; cleaning service hanya pagi dan siang', () => {
  assert.deepEqual(SHIFTS.map((s) => s.id), ['pagi', 'siang', 'malam']);
  for (let h = 0; h < 24; h += 0.5) {
    const s = dutySummary(h);
    assert.ok(s.byRole.front_desk >= 1, `tanpa resepsionis jam ${h}`);
    assert.ok(s.byRole.security >= 1, `tanpa satpam jam ${h}`);
    assert.ok(s.byRole.parking >= 1, `tanpa petugas parkir jam ${h}`);
    assert.ok(s.total > 0 && s.total < STAFF_TOTAL);
    assert.equal(Object.values(s.byRole).reduce((a, b) => a + b, 0), s.total);
  }
  assert.equal(dutySummary(23).byRole.housekeeping, 0);
  assert.equal(dutySummary(3).byRole.housekeeping, 0);
  assert.equal(dutySummary(10).byRole.housekeeping, STAFF_ROLES.housekeeping.count / 2);
});

test('cleaning service: membersihkan semua kamar, berada di dalam kamar saat membersihkan, tidak teleport', () => {
  const staff = STAFF.find((s) => s.role === 'housekeeping' && s.index === 0);
  const levels = cleanerLevels(0);
  const seen = new Set();
  let cleaningSamples = 0;
  let prev = null;
  let maxStep = 0;
  const start = SHIFTS[staff.shift].from;
  for (let sec = 0; sec < 8 * 3600; sec++) {
    const hour = start + sec / 3600;
    const st = housekeeperState(staff, hour);
    assert.ok(Number.isFinite(st.x) && Number.isFinite(st.z));
    assert.ok(levels.includes(st.level));
    if (st.task === 'cleaning') {
      cleaningSamples++;
      const room = hotelRoomsAtLevel(st.level).find((r) => r.no === st.roomNo);
      assert.ok(room && inRect(room.rect, st.x, st.z), 'harus berada di dalam kamar yang dibersihkan');
      seen.add(`${st.level}:${st.roomNo}`);
    }
    if (prev) maxStep = Math.max(maxStep, Math.hypot(st.x - prev.x, st.z - prev.z));
    prev = st;
  }
  assert.ok(cleaningSamples > 0);
  assert.ok(seen.size >= GUESTS_PER_LEVEL * levels.length * 0.99, `hanya ${seen.size} kamar dibersihkan`);
  assert.ok(maxStep <= 1.4 + 1e-6, `lompatan ${maxStep} m per detik`);
  assert.ok(CLEAN_MS > 0);
});

test('deterministik: jam yang sama memberi hasil yang sama', () => {
  const staff = STAFF.find((s) => s.role === 'housekeeping' && s.index === 7);
  assert.deepEqual(housekeeperState(staff, 9.3), housekeeperState(staff, 9.3));
  assert.deepEqual(staffOnLevel(0, 10), staffOnLevel(0, 10));
});

test('staffOnLevel: lobi berisi petugas pos di dalam ruangnya; lantai tamu hanya cleaner', () => {
  const lobby = staffOnLevel(0, 10);
  assert.ok(lobby.length > 0);
  assert.equal(new Set(lobby.map((s) => s.id)).size, lobby.length);
  assert.ok(lobby.every((s) => s.level === 0));
  const desk = lobby.filter((s) => s.role === 'front_desk');
  assert.ok(desk.length >= 1);
  const lobbyRect = hotelRoomsAtLevel(0).find((r) => r.id === 'lobby').rect;
  for (const d of desk) assert.ok(inRect(lobbyRect, d.x, d.z));
  assert.ok(staffOnLevel(2, 10).some((s) => s.role === 'lifeguard'));

  for (const level of [4, 500, 997]) {
    const list = staffOnLevel(level, 10);
    assert.ok(list.every((s) => (s.role === 'housekeeping' || s.role === 'bellboy') && s.level === level));
    assert.ok(list.filter((s) => s.role === 'housekeeping').length <= 1);
    assert.ok(staffOnLevel(level, 23).every((s) => s.role === 'bellboy'), 'malam: hanya bellboy yang mungkin ada di lantai tamu');
  }
  assert.deepEqual(staffOnLevel(50, 10), []);
});

test('onDuty menangani shift malam yang melewati tengah malam', () => {
  const night = STAFF.find((s) => s.role === 'security' && SHIFTS[s.shift].id === 'malam');
  assert.ok(onDuty(night, 23));
  assert.ok(onDuty(night, 2));
  assert.ok(!onDuty(night, 12));
});

test('petugas parkir: berpatroli di dalam area parkir, berhenti mengarahkan mobil, tidak teleport', () => {
  const staff = STAFF.find((s) => s.role === 'parking' && s.index === 0);
  const start = SHIFTS[staff.shift].from;
  const tasks = new Set();
  let prev = null;
  let maxStep = 0;
  for (let sec = 0; sec < 8 * 3600; sec++) {
    const st = parkingState(staff, start + sec / 3600);
    assert.equal(st.level, 0);
    assert.ok(inRect(HOTEL_PARKING, st.x, st.z), 'harus berada di area parkir');
    tasks.add(st.task);
    if (prev) maxStep = Math.max(maxStep, Math.hypot(st.x - prev.x, st.z - prev.z));
    prev = st;
  }
  assert.deepEqual([...tasks].sort(), ['directing', 'walking']);
  assert.ok(maxStep <= 1.4 + 1e-6, `lompatan ${maxStep} m per detik`);
});

test('petugas parkir muncul di lantai 0 hanya saat bertugas', () => {
  const day = staffOnLevel(0, 10).filter((s) => s.role === 'parking');
  assert.ok(day.length >= 1);
  assert.equal(new Set(day.map((s) => s.id)).size, day.length);
  assert.equal(day.length, STAFF.filter((s) => s.role === 'parking' && onDuty(s, 10)).length);
});

test('seragam: tiap peran punya warna sendiri, konfigurasi sah dan deterministik', () => {
  const byRole = new Map();
  for (const s of STAFF) {
    const cfg = staffConfig(s);
    assert.deepEqual(cfg, staffConfig(s));
    assert.equal(cfg.m, 0, 'petugas memakai avatar sederhana (murah)');
    if (!byRole.has(s.role)) byRole.set(s.role, new Set());
    byRole.get(s.role).add(cfg.o);
  }
  for (const [role, outfits] of byRole) assert.equal(outfits.size, 1, `${role} harus satu warna seragam`);
  const colors = [...byRole.values()].map((set) => [...set][0]);
  assert.equal(new Set(colors).size, colors.length, 'tiap peran berseragam beda');
  assert.equal(staffConfig(STAFF.find((s) => s.role === 'parking')).a, 6, 'petugas parkir memakai topi');
  const skins = new Set(STAFF.filter((s) => s.role === 'housekeeping').map((s) => staffConfig(s).s));
  assert.ok(skins.size > 1, 'kulit bervariasi antar petugas');
});

test('staffActFor memetakan tugas ke pose', () => {
  assert.equal(staffActFor('walking'), 'walk');
  assert.equal(staffActFor('cleaning'), 'bow');
  assert.equal(staffActFor('directing'), 'wave');
  assert.equal(staffActFor('standing'), null);
});

test('pickNearby: dalam radius, terdekat dahulu, dibatasi jumlahnya', () => {
  const list = Array.from({ length: 30 }, (_, i) => ({ id: `s${String(i).padStart(2, '0')}`, x: i * 3, z: 0 }));
  const me = { x: 0, z: 0 };
  const picked = pickNearby(list, me);
  assert.equal(picked.length, STAFF_VIEW_MAX);
  assert.deepEqual(picked.map((s) => s.id), list.slice(0, STAFF_VIEW_MAX).map((s) => s.id));
  assert.ok(pickNearby(list, me, 10, 99).every((s) => Math.hypot(s.x, s.z) <= 10));
  assert.equal(pickNearby(list, { x: 1000, z: 0 }).length, 0);
  assert.ok(STAFF_VIEW_RADIUS > 0);
  // petugas di lobi pada siang hari tidak melebihi batas
  assert.ok(pickNearby(staffOnLevel(0, 10), { x: 0, z: HOTEL_BUILDING[1] + 20 }).length <= STAFF_VIEW_MAX);
});

const WEST = [HOTEL_SITE.minX + 5, HOTEL_SITE.minZ + 5, HOTEL_BUILDING[0] - 5, HOTEL_SITE.maxZ - 5];

test('semua karyawan bekerja: tiap petugas mengerjakan tugas kerjanya selama shift', () => {
  for (const staff of STAFF) {
    const start = SHIFTS[staff.shift].from;
    const tasks = new Set();
    for (let sec = 0; sec < 8 * 3600; sec += 7) { // langkah 7 detik: tidak sejajar dengan putaran kerja 60 detik
      const st = staffState(staff, start + sec / 3600);
      assert.ok(st, `${staff.id} tanpa keadaan`);
      assert.ok(Number.isFinite(st.x) && Number.isFinite(st.z), `${staff.id} posisi tidak sah`);
      assert.ok(Number.isInteger(st.level) && st.level >= 0, `${staff.id} lantai tidak sah`);
      tasks.add(st.task);
    }
    assert.ok([...tasks].some((k) => WORK_TASKS.includes(k)), `${staff.id} (${staff.role}) tidak pernah bekerja: ${[...tasks]}`);
  }
});

test('tiap peran bekerja di tempatnya dan tidak teleport', () => {
  const lobby = hotelRoomsAtLevel(0).find((r) => r.id === 'lobby').rect;
  const dining = ['grand_dining', 'specialty_dining'].map((id) => hotelRoomsAtLevel(0).find((r) => r.id === id).rect);
  const pool = hotelRoomsAtLevel(2).find((r) => r.id === 'indoor_pool').rect;
  const where = {
    front_desk: (s) => s.level === 0 && inRect(lobby, s.x, s.z),
    waiter: (s, staff) => s.level === 0 && inRect(dining[staff.index % 2], s.x, s.z),
    valet: (s) => s.level === 0 && inRect([HOTEL_FORECOURT[0], HOTEL_FORECOURT[1], HOTEL_PARKING[2], HOTEL_PARKING[3]], s.x, s.z), // halaman depan sampai parkir (jalan di antaranya)
    security: (s) => s.level === 0 && (inRect(HOTEL_FORECOURT, s.x, s.z) || inRect(lobby, s.x, s.z)),
    gardener: (s) => s.level === 0 && inRect(WEST, s.x, s.z),
    lifeguard: (s) => s.level === 2 && inRect(pool, s.x, s.z),
  };
  const expectTask = { front_desk: ['greeting'], waiter: ['serving'], valet: ['greeting', 'working'], security: ['watching'], gardener: ['working'], lifeguard: ['watching'], parking: ['directing'], bellboy: ['serving', 'riding'] };
  for (const [role, { count }] of Object.entries(STAFF_ROLES)) {
    if (role === 'housekeeping') continue;
    for (const index of new Set([0, Math.floor(count / 2), count - 1])) {
      const staff = STAFF.find((s) => s.role === role && s.index === index);
      const start = SHIFTS[staff.shift].from;
      const tasks = new Set();
      let prev = null;
      for (let sec = 0; sec < 8 * 3600; sec++) {
        const st = staffState(staff, start + sec / 3600);
        tasks.add(st.task);
        if (where[role]) assert.ok(where[role](st, staff), `${staff.id} di luar tempat kerjanya (${st.x.toFixed(1)}, ${st.z.toFixed(1)}, lt ${st.level})`);
        if (prev && prev.level === st.level) assert.ok(Math.hypot(st.x - prev.x, st.z - prev.z) <= 1.4 + 1e-6, `${staff.id} melompat`);
        prev = st;
      }
      for (const k of expectTask[role]) assert.ok(tasks.has(k), `${staff.id} tidak pernah ${k}`);
    }
  }
});

test('bellboy naik lift ke lantai tamu dan mengantar ke kamar', () => {
  const staff = STAFF.find((s) => s.role === 'bellboy' && s.index === 0);
  const start = SHIFTS[staff.shift].from;
  const levels = new Set();
  const delivered = new Set();
  let rides = 0;
  let prevLevel = 0;
  for (let sec = 0; sec < 8 * 3600; sec++) {
    const st = staffState(staff, start + sec / 3600);
    levels.add(st.level);
    if (st.task === 'riding') rides++;
    if (st.task === 'serving' && st.level > 0) {
      const room = hotelRoomsAtLevel(st.level).find((r) => r.no === st.roomNo);
      assert.ok(room && inRect(room.rect, st.x, st.z), 'mengantar di dalam kamar tujuan');
      delivered.add(`${st.level}:${st.roomNo}`);
    }
    prevLevel = st.level;
  }
  assert.ok(prevLevel >= 0 && levels.has(0) && levels.size >= 3, `hanya ${[...levels]}`);
  assert.ok([...levels].some((l) => cleanerForLevel(l) !== null), 'mengunjungi lantai tamu');
  assert.ok(rides > 0 && delivered.size >= 4, `naik lift ${rides} detik, kamar ${delivered.size}`);
});

test('workSummary: sebagian besar petugas yang bertugas sedang mengerjakan sesuatu', () => {
  for (const h of [8, 12, 16, 20, 23.5, 3]) {
    const w = workSummary(h);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    assert.equal(total, dutySummary(h).total);
    const working = Object.entries(w).filter(([k]) => WORK_TASKS.includes(k)).reduce((a, [, n]) => a + n, 0);
    assert.ok(working / total > 0.3, `jam ${h}: hanya ${working}/${total} bekerja (${JSON.stringify(w)})`);
  }
});
