import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_BUILDING, HOTEL_CORE, HOTEL_FORECOURT, HOTEL_SITE, HOTEL_TOP_LEVEL, HOTEL_TOP_Y, GUEST_ROOM_TOTAL, GUEST_LEVEL_COUNT, GUESTS_PER_LEVEL,
  LIFTS, FLOOR_NAMES, ROAD, SKY_LOBBY_EVERY, getHotelWorld, hotelRoomsAtLevel, hotelLevelY, floorName, isGuestLevel, isSkyLobbyLevel, liftTravelMs, rideLift, liftAt, roomAt, HOTEL_CAR_SPOTS, surfaceAt,
  hotelFootprint,
} from './hotel-layout.js';
import { BOUNDS, WORLD_LIMIT } from './villa-layout.js';

const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
const overlap = (a, b) => a[0] < b[2] - 1e-9 && a[2] > b[0] + 1e-9 && a[1] < b[3] - 1e-9 && a[3] > b[1] + 1e-9;
const TOP = HOTEL_TOP_LEVEL;

test('hotel: 1000 lantai, tinggi 4,2 km, nama tiap lantai ada, lantai dibuat malas', () => {
  assert.equal(HOTEL_LEVEL_COUNT, 1000);
  assert.equal(TOP, 999);
  assert.equal(FLOOR_NAMES.length, 1000);
  assert.equal(hotelLevelY(TOP), TOP * HOTEL_LEVEL_HEIGHT);
  assert.equal(HOTEL_TOP_Y, 1000 * HOTEL_LEVEL_HEIGHT);
  const w = getHotelWorld();
  assert.equal(w.levels.length, 1000);
  assert.equal(w.levels[501].rooms.length, 1 + GUESTS_PER_LEVEL);
  assert.equal(w.levels[500].rooms.length, 1 + 6, 'lantai 501 adalah Sky Lobby: inti + 6 petak');
  assert.equal(w.levels[1000], undefined);
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) assert.ok(FLOOR_NAMES[l], `nama lantai ${l}`);
  assert.equal(floorName(0), 'Lobi & Restoran');
  assert.equal(floorName(4), 'Deluxe');
  assert.equal(floorName(301), 'Premier');
  assert.equal(floorName(601), 'Grand Premier');
  assert.equal(floorName(901), 'Royal Residence');
  assert.equal(floorName(50), 'Sky Lobby 1');
  assert.equal(floorName(998), 'Suite Eksekutif');
  assert.equal(floorName(TOP), 'Sky Level');
  assert.equal(floorName(1000), '');
});

test('hotel: jenis lantai (podium, kamar tamu, Sky Lobby tiap 50 lantai, suite, Sky Level)', () => {
  for (const l of [0, 1, 2, 3]) assert.ok(!isGuestLevel(l) && !isSkyLobbyLevel(l), `podium ${l}`);
  for (const l of [4, 5, 49, 51, 99, 997]) assert.ok(isGuestLevel(l), `kamar tamu ${l}`);
  for (let l = SKY_LOBBY_EVERY; l < 998; l += SKY_LOBBY_EVERY) assert.ok(isSkyLobbyLevel(l) && !isGuestLevel(l), `sky lobby ${l}`);
  for (const l of [998, TOP]) assert.ok(!isGuestLevel(l) && !isSkyLobbyLevel(l), `puncak ${l}`);
  assert.ok(!isSkyLobbyLevel(0));
  assert.equal(GUEST_LEVEL_COUNT, 975); // 994 lantai (4..997) dikurangi 19 Sky Lobby
  assert.equal(GUEST_ROOM_TOTAL, 975 * GUESTS_PER_LEVEL);
});

test('hotel: jauh dari villa (> 300 m dari pagar villa) namun masih di dalam batas dunia', () => {
  assert.ok(HOTEL_BUILDING[1] - BOUNDS.maxZ > 300, `jarak ${HOTEL_BUILDING[1] - BOUNDS.maxZ}`);
  assert.ok(HOTEL_SITE.maxZ <= WORLD_LIMIT.maxZ && HOTEL_SITE.minX >= WORLD_LIMIT.minX && HOTEL_SITE.maxX <= WORLD_LIMIT.maxX);
  assert.ok(HOTEL_BUILDING[0] > HOTEL_SITE.minX && HOTEL_BUILDING[2] < HOTEL_SITE.maxX && HOTEL_BUILDING[3] < HOTEL_SITE.maxZ);
});

test('hotel: ruang tiap lantai tidak saling menimpa, menutup seluruh tapak lantai itu, dan di dalam tapaknya', () => {
  const eps = 1e-9;
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    const rooms = hotelRoomsAtLevel(l);
    const fp = hotelFootprint(l); // menara meruncing: tapak mengecil per zona 50 lantai
    for (const r of rooms) assert.ok(r.rect[0] >= fp[0] - eps && r.rect[2] <= fp[2] + eps && r.rect[1] >= fp[1] - eps && r.rect[3] <= fp[3] + eps, `${r.id} di dalam tapak lantai ${l}`);
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) assert.ok(!overlap(rooms[i].rect, rooms[j].rect), `lantai ${l}: ${rooms[i].id} menimpa ${rooms[j].id}`);
    const ids = new Set(rooms.map((r) => r.id));
    assert.equal(ids.size, rooms.length, `id unik di lantai ${l}`);
    if (!isGuestLevel(l)) assert.ok(Math.abs(rooms.reduce((s, r) => s + area(r.rect), 0) - area(fp)) < 1e-6, `lantai publik ${l} menutup seluruh tapak`);
  }
  assert.deepEqual(hotelRoomsAtLevel(-1), []);
  assert.deepEqual(hotelRoomsAtLevel(1000), []);
});

test('hotel: menara meruncing per zona 50 lantai, tapak tidak pernah melebar, inti lift tetap', () => {
  assert.deepEqual([...hotelFootprint(0)], [...HOTEL_BUILDING]);
  assert.deepEqual([...hotelFootprint(49)], [...HOTEL_BUILDING], 'zona 0 (lantai 0..49) memakai tapak penuh');
  let prev = area(hotelFootprint(0));
  for (let l = 1; l < HOTEL_LEVEL_COUNT; l++) {
    const a = area(hotelFootprint(l));
    assert.ok(a <= prev + 1e-9, `lantai ${l} tidak lebih luas dari lantai di bawahnya`);
    prev = a;
  }
  const base = area(HOTEL_BUILDING);
  assert.ok(area(hotelFootprint(50)) < base, 'zona 1 sudah menyusut');
  const top = hotelFootprint(TOP);
  assert.ok(Math.abs(top[2] - top[0] - 72 * 0.7) < 1e-6, 'lebar puncak = 70% dari dasar');
  assert.ok(Math.abs(top[3] - top[1] - 56 * 0.7) < 1e-6, 'dalam puncak = 70% dari dasar');
  assert.ok(Math.abs((top[0] + top[2]) / 2) < 1e-9 && Math.abs((top[1] + top[3]) / 2 - 448) < 1e-9, 'tetap sepusat dengan dasar');
  for (const l of [0, 5, 50, 500, 998, TOP]) assert.deepEqual(hotelRoomsAtLevel(l).find((r) => r.kind === 'core').rect, HOTEL_CORE, `inti lantai ${l} tidak mengecil`);
});

test('hotel: 975 lantai kamar tamu x 34 kamar, nomor kamar dan id unik, fasilitas lengkap di podium, Sky Lobby, dan puncak', () => {
  const names = new Set();
  const ids = new Set();
  let guestLevels = 0;
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    const guests = hotelRoomsAtLevel(l).filter((r) => r.kind === 'guest');
    assert.equal(guests.length, isGuestLevel(l) ? GUESTS_PER_LEVEL : 0, `lantai ${l}`);
    if (guests.length) guestLevels++;
    for (const g of guests) {
      assert.ok(!names.has(g.name), `nomor kamar unik: ${g.name}`);
      assert.ok(!ids.has(g.id), `id kamar unik: ${g.id}`);
      names.add(g.name);
      ids.add(g.id);
    }
  }
  assert.equal(guestLevels, GUEST_LEVEL_COUNT);
  assert.equal(names.size, GUEST_ROOM_TOTAL);
  const publicNames = [0, 1, 2, 3, 50, 100, 998, TOP].map((l) => hotelRoomsAtLevel(l).map((r) => r.name).join('|')).join('|');
  for (const f of ['Grand Lobby', 'Grand Ballroom', 'Spa & Wellness', 'Indoor Swimming Pool', 'Fitness Center', 'Musholla', 'Kids Club', 'Mini Cinema', 'Presidential Suite', 'Sky Lounge', 'Infinity Pool', 'Meeting Center', 'Shopping Arcade', 'Sky · Grand Lobby', 'Sky · Shopping Arcade']) assert.ok(publicNames.includes(f), f);
});

test('hotel: Sky Lobby memakai program podium bergilir dengan id unik antar lantai', () => {
  assert.equal(roomAt(0, 430, 50).name, 'Sky · Grand Lobby & Reception');
  assert.equal(roomAt(0, 430, 100).name, 'Sky · Shopping Arcade');
  assert.equal(roomAt(0, 430, 150).name, 'Sky · Spa & Wellness');
  assert.equal(roomAt(0, 430, 200).name, 'Sky · Grand Ballroom');
  assert.equal(roomAt(0, 430, 250).name, 'Sky · Grand Lobby & Reception');
  assert.notEqual(roomAt(0, 430, 50).id, roomAt(0, 430, 250).id);
  assert.equal(roomAt(0, 430, 50).floorName, 'Sky Lobby 1');
});

test('hotel: 4 lift di dalam inti, melayani 1000 lantai, perjalanan ekspres di bawah 30 detik', () => {
  assert.equal(LIFTS.length, 4);
  for (const l of LIFTS) assert.ok(l.rect[0] >= HOTEL_CORE[0] && l.rect[2] <= HOTEL_CORE[2] && l.rect[1] >= HOTEL_CORE[1] && l.rect[3] <= HOTEL_CORE[3], l.id);
  const mid = (r) => ({ x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 });
  const p = { ...mid(LIFTS[0].rect), level: 0 };
  assert.equal(liftAt(p.x, p.z).id, 'lift_1');
  const up = rideLift(p, TOP);
  assert.equal(up.level, TOP);
  assert.equal(up.y, hotelLevelY(TOP));
  assert.ok(up.travelMs > rideLift(p, 2).travelMs, 'makin jauh makin lama');
  assert.ok(rideLift(p, 500).travelMs < up.travelMs);
  assert.ok(up.travelMs < 30000, `perjalanan ${up.travelMs} ms`);
  assert.equal(up.travelMs, liftTravelMs(TOP));
  assert.equal(rideLift(p, 0), null, 'lantai sama');
  assert.equal(rideLift(p, 1000), null);
  assert.equal(rideLift(p, -1), null);
  assert.equal(rideLift(p, 1.5), null);
  assert.equal(rideLift({ x: 0, z: 450, level: 0 }, 5), null, 'di luar kabin tidak bisa naik lift');
});

test('hotel: jalan kaki dari halaman -> lobi -> inti -> lift -> lantai 1000 -> lorong lantai atas', () => {
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
  const up = rideLift(pos, TOP);
  pos = { ...pos, ...up };
  assert.equal(pos.level, TOP);
  assert.equal(w.roomAt(pos.x, pos.z, TOP).kind, 'core');
  walk(-0.2, 0, 9); // ke tengah kabin/inti dulu supaya pas dengan pintu selatan inti
  walk(0, 0.2, 100); // keluar dari inti ke selatan lewat pintu (z=456)
  assert.ok(pos.z > 457, `keluar inti di lantai 1000, z=${pos.z}`);
  assert.equal(pos.y, hotelLevelY(TOP));
  assert.ok(w.canStand(TOP, pos.x, pos.z));
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
  // tepi bangunan lantai teratas (teras): tidak bisa melangkah ke luar tapak lantai itu (tapak menyusut di puncak)
  const fpTop = hotelFootprint(TOP);
  let t = { x: -22, z: 432, level: TOP };
  for (let i = 0; i < 100; i++) t = w.move(t, -0.1, -0.1);
  assert.ok(t.x >= fpTop[0] && t.z >= fpTop[1], `tetap di dalam tapak puncak (${t.x.toFixed(2)}, ${t.z.toFixed(2)})`);
  // dan di lantai kamar jauh di atas pun berlaku sama
  const fp701 = hotelFootprint(701);
  let u = { x: -27, z: 428, level: 701 };
  for (let i = 0; i < 100; i++) u = w.move(u, -0.1, -0.1);
  assert.ok(u.x >= fp701[0] && u.z >= fp701[1], `tetap di dalam tapak lantai 702 (${u.x.toFixed(2)}, ${u.z.toFixed(2)})`);
  assert.equal(u.y, hotelLevelY(701));
});

test('hotel: roomAt memberi nama ruang, halaman, dan jalan', () => {
  assert.equal(roomAt(0, 430, 0).name, 'Grand Lobby & Reception');
  assert.equal(roomAt(0, 400, 0).name, 'Drop-off & Valet');
  assert.equal(roomAt(0, 300, 0).name, 'Jalan Raya NIKORA · Arah Villa');
  assert.equal(roomAt(-30, 450, 2).name, 'Indoor Swimming Pool');
  // lantai 998/999 berdenah menyusut (skala 0,70): titik uji dipilih di dalam petak yang sudah dipadatkan
  assert.equal(roomAt(-20, 450, TOP).kind, 'terrace');
  assert.equal(roomAt(0, 432, TOP).name, 'Sky Lounge & Bar');
  assert.equal(roomAt(-22, 432, 998).name, 'Royal Suite');
});

test('hotel: slot parkir dan valet ada di atas aspal dan di luar bangunan', () => {
  assert.ok(HOTEL_CAR_SPOTS.length >= 16);
  for (const s of HOTEL_CAR_SPOTS) {
    assert.equal(surfaceAt(s.x, s.z), 'road', s.id);
    assert.ok(s.z < HOTEL_BUILDING[1] || s.x > HOTEL_BUILDING[2] || s.x < HOTEL_BUILDING[0], `${s.id} di luar bangunan`);
  }
  assert.equal(ROAD.toZ, HOTEL_FORECOURT[1]);
});
