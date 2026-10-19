import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_BUILDING, HOTEL_CORE, HOTEL_FORECOURT, HOTEL_SITE, GUEST_ROOM_TOTAL, GUESTS_PER_LEVEL,
  LIFTS, FLOOR_NAMES, ROAD, getHotelWorld, hotelRoomsAtLevel, hotelLevelY, isGuestLevel, rideLift, liftAt, roomAt, HOTEL_CAR_SPOTS, surfaceAt,
} from './hotel-layout.js';
import { BOUNDS, WORLD_LIMIT } from './villa-layout.js';

const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
const overlap = (a, b) => a[0] < b[2] - 1e-9 && a[2] > b[0] + 1e-9 && a[1] < b[3] - 1e-9 && a[3] > b[1] + 1e-9;

test('hotel: 15 lantai, tinggi 63 m, nama tiap lantai ada', () => {
  assert.equal(HOTEL_LEVEL_COUNT, 15);
  assert.equal(FLOOR_NAMES.length, 15);
  assert.equal(hotelLevelY(14), 14 * HOTEL_LEVEL_HEIGHT);
  assert.equal(getHotelWorld().levels.length, 15);
});

test('hotel: jauh dari villa (> 300 m dari pagar villa) namun masih di dalam batas dunia', () => {
  assert.ok(HOTEL_BUILDING[1] - BOUNDS.maxZ > 300, `jarak ${HOTEL_BUILDING[1] - BOUNDS.maxZ}`);
  assert.ok(HOTEL_SITE.maxZ <= WORLD_LIMIT.maxZ && HOTEL_SITE.minX >= WORLD_LIMIT.minX && HOTEL_SITE.maxX <= WORLD_LIMIT.maxX);
  assert.ok(HOTEL_BUILDING[0] > HOTEL_SITE.minX && HOTEL_BUILDING[2] < HOTEL_SITE.maxX && HOTEL_BUILDING[3] < HOTEL_SITE.maxZ);
});

test('hotel: ruang tiap lantai tidak saling menimpa, menutup seluruh tapak, dan di dalam bangunan', () => {
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    const rooms = hotelRoomsAtLevel(l);
    for (const r of rooms) assert.ok(r.rect[0] >= HOTEL_BUILDING[0] && r.rect[2] <= HOTEL_BUILDING[2] && r.rect[1] >= HOTEL_BUILDING[1] && r.rect[3] <= HOTEL_BUILDING[3], `${r.id} di dalam bangunan`);
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) assert.ok(!overlap(rooms[i].rect, rooms[j].rect), `lantai ${l}: ${rooms[i].id} menimpa ${rooms[j].id}`);
    const ids = new Set(rooms.map((r) => r.id));
    assert.equal(ids.size, rooms.length, `id unik di lantai ${l}`);
    if (!isGuestLevel(l)) assert.ok(Math.abs(rooms.reduce((s, r) => s + area(r.rect), 0) - area(HOTEL_BUILDING)) < 1e-6, `lantai publik ${l} menutup seluruh tapak`);
  }
});

test('hotel: 9 lantai kamar tamu x 34 kamar = 306 kamar, nomor kamar unik, ada fasilitas lengkap', () => {
  assert.equal(GUEST_ROOM_TOTAL, 306);
  const all = [];
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    const guests = hotelRoomsAtLevel(l).filter((r) => r.kind === 'guest');
    assert.equal(guests.length, isGuestLevel(l) ? GUESTS_PER_LEVEL : 0, `lantai ${l}`);
    all.push(...guests.map((g) => g.name));
  }
  assert.equal(new Set(all).size, 306);
  const names = Object.values(Array.from({ length: 15 }, (_, l) => hotelRoomsAtLevel(l).map((r) => r.name).join('|'))).join('|');
  for (const f of ['Grand Lobby', 'Grand Ballroom', 'Spa & Wellness', 'Indoor Swimming Pool', 'Fitness Center', 'Musholla', 'Kids Club', 'Mini Cinema', 'Presidential Suite', 'Sky Lounge', 'Infinity Pool', 'Meeting Center', 'Shopping Arcade']) assert.ok(names.includes(f), f);
});

test('hotel: 4 lift di dalam inti, melayani 15 lantai', () => {
  assert.equal(LIFTS.length, 4);
  for (const l of LIFTS) assert.ok(l.rect[0] >= HOTEL_CORE[0] && l.rect[2] <= HOTEL_CORE[2] && l.rect[1] >= HOTEL_CORE[1] && l.rect[3] <= HOTEL_CORE[3], l.id);
  const mid = (r) => ({ x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 });
  const p = { ...mid(LIFTS[0].rect), level: 0 };
  assert.equal(liftAt(p.x, p.z).id, 'lift_1');
  const up = rideLift(p, 14);
  assert.equal(up.level, 14);
  assert.equal(up.y, hotelLevelY(14));
  assert.ok(up.travelMs > rideLift(p, 2).travelMs, 'makin jauh makin lama');
  assert.equal(rideLift(p, 0), null, 'lantai sama');
  assert.equal(rideLift(p, 15), null);
  assert.equal(rideLift(p, 1.5), null);
  assert.equal(rideLift({ x: 0, z: 450, level: 0 }, 5), null, 'di luar kabin tidak bisa naik lift');
});

test('hotel: jalan kaki dari halaman -> lobi -> inti -> lift -> lantai 15 -> lorong lantai atas', () => {
  const w = getHotelWorld();
  let pos = { x: 0, z: HOTEL_FORECOURT[3] - 6, level: 0 };
  const walk = (dx, dz, steps) => { for (let i = 0; i < steps; i++) pos = w.move(pos, dx, dz); };
  walk(0, 0.2, 150); // 30 m ke selatan: lewat pintu utama (z=420), lobi, lalu pintu inti (z=440)
  assert.ok(pos.z > 441, `masuk inti, z=${pos.z}`);
  assert.equal(w.roomAt(pos.x, pos.z, 0).id, 'core_0');
  assert.equal(w.roomAt(pos.x, pos.z, 0).kind, 'core');
  walk(0.2, 0, Math.round((LIFTS[2].rect[0] + 1 - pos.x) / 0.2)); // ke kabin 3 (x ~ 1.75)
  walk(0, -0.1, 4);
  assert.ok(liftAt(pos.x, pos.z), `di dalam kabin (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
  const up = rideLift(pos, 14);
  pos = { ...pos, ...up };
  assert.equal(pos.level, 14);
  assert.equal(w.roomAt(pos.x, pos.z, 14).kind, 'core');
  walk(-0.2, 0, 9); // ke tengah kabin/inti dulu supaya pas dengan pintu selatan inti
  walk(0, 0.2, 100); // keluar dari inti ke selatan lewat pintu (z=456)
  assert.ok(pos.z > 457, `keluar inti di lantai 15, z=${pos.z}`);
  assert.equal(pos.y, hotelLevelY(14));
  assert.ok(w.canStand(14, pos.x, pos.z));
});

test('hotel: tembok kamar menghalangi, pintu kamar dari lorong bisa dimasuki, tepi lantai atas berpagar', () => {
  const w = getHotelWorld();
  // lantai 6 (level 5): kamar utara pertama [-36..-30] pintu di (-33, 430)
  const room = hotelRoomsAtLevel(5).find((r) => r.kind === 'guest');
  const door = w.levels[5].doors.find((d) => d.x === room.rect[0] + 3 && d.z === room.rect[3]);
  assert.ok(door, 'kamar punya pintu ke lorong');
  let pos = { x: door.x, z: door.z + 2, level: 5 };
  for (let i = 0; i < 40; i++) pos = w.move(pos, 0, -0.1);
  assert.ok(pos.z < door.z, `masuk kamar lewat pintu, z=${pos.z}`);
  // dari lorong ke samping (menabrak dinding antar-kamar) tidak tembus
  let q = { x: room.rect[0] + 1, z: room.rect[3] - 1, level: 5 };
  for (let i = 0; i < 80; i++) q = w.move(q, -0.1, 0);
  assert.ok(q.x >= HOTEL_BUILDING[0], 'tidak keluar bangunan');
  // tepi bangunan lantai 15 (teras): tidak bisa melangkah ke luar
  let t = { x: -33, z: 424, level: 14 };
  for (let i = 0; i < 100; i++) t = w.move(t, -0.1, -0.1);
  assert.ok(t.x >= HOTEL_BUILDING[0] && t.z >= HOTEL_BUILDING[1]);
});

test('hotel: roomAt memberi nama ruang, halaman, dan jalan', () => {
  assert.equal(roomAt(0, 430, 0).name, 'Grand Lobby & Reception');
  assert.equal(roomAt(0, 400, 0).name, 'Drop-off & Valet');
  assert.equal(roomAt(0, 300, 0).name, 'Jalan Raya NIKORA');
  assert.equal(roomAt(-30, 450, 2).name, 'Indoor Swimming Pool');
  assert.equal(roomAt(-30, 450, 14).kind, 'terrace');
  assert.equal(roomAt(0, 424, 14).name, 'Sky Lounge & Bar');
});

test('hotel: slot parkir dan valet ada di atas aspal dan di luar bangunan', () => {
  assert.ok(HOTEL_CAR_SPOTS.length >= 16);
  for (const s of HOTEL_CAR_SPOTS) {
    assert.equal(surfaceAt(s.x, s.z), 'road', s.id);
    assert.ok(s.z < HOTEL_BUILDING[1] || s.x > HOTEL_BUILDING[2] || s.x < HOTEL_BUILDING[0], `${s.id} di luar bangunan`);
  }
  assert.equal(ROAD.toZ, HOTEL_FORECOURT[1]);
});
