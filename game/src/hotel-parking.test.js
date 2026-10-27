import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_BUILDING, HOTEL_FORECOURT, HOTEL_PARKING, HOTEL_SITE } from './hotel-layout.js';
import {
  PARKING_ZONES, PARKING_KEEP_OUT, GUEST_NW, GUEST_LINK, GUEST_FLANK, GUEST_ENTRY_LANE, STAFF_CARS, STAFF_BIKES, STAFF_BIKES_CANOPY, OWNER_LANE, OWNER_GARAGE, OWNER_TURNTABLE,
  VALET_POINT, guestSlots, bikeSlots, ownerSlots, slotRect, parkingZoneAt, occupancy, slotLightColor, assignValet, guestStats, parkedGuestCars, CAR_COLORS,
} from './hotel-parking.js';

const E = 1e-9;
const inside = (r, outer) => r[0] >= outer[0] - E && r[2] <= outer[2] + E && r[1] >= outer[1] - E && r[3] <= outer[3] + E;
const overlap = (a, b) => a[0] < b[2] - E && a[2] > b[0] + E && a[1] < b[3] - E && a[3] > b[1] + E;
const siteRect = [HOTEL_SITE.minX, HOTEL_SITE.minZ, HOTEL_SITE.maxX, HOTEL_SITE.maxZ];

test('parkir: STAFF_CARS persis lahan HOTEL_PARKING yang sudah ada', () => {
  assert.deepEqual([...STAFF_CARS], [...HOTEL_PARKING]);
});

test('parkir: semua zona di dalam tapak, di luar bangunan dan halaman drop-off, dan tidak saling menimpa', () => {
  const all = PARKING_ZONES.flatMap((z) => z.rects.map((r) => ({ zone: z.id, r })));
  for (const { zone, r } of all) {
    assert.ok(inside(r, siteRect), `${zone} ${r} di dalam tapak`);
    assert.ok(!overlap(r, HOTEL_BUILDING), `${zone} ${r} tidak menimpa bangunan`);
    assert.ok(!overlap(r, HOTEL_FORECOURT), `${zone} ${r} tidak menimpa halaman drop-off`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlap(all[i].r, all[j].r), `${all[i].zone} ${all[i].r} menimpa ${all[j].zone} ${all[j].r}`);
  assert.equal(PARKING_KEEP_OUT.length, all.length);
});

test('parkir: tepat 500 slot tamu, id unik, semua di dalam zona tamu dan tidak saling menimpa', () => {
  const slots = guestSlots();
  assert.equal(slots.length, 500);
  assert.equal(new Set(slots.map((s) => s.id)).size, 500);
  assert.deepEqual(Object.fromEntries(Object.entries(guestStats(new Set()).blocks).map(([b, v]) => [b, v.total])), { A: 124, B: 186, C: 128, D: 62 });
  const rects = slots.map(slotRect);
  const rightZone = [GUEST_NW, GUEST_FLANK];
  rects.forEach((r, i) => {
    assert.ok(rightZone.some((z) => inside(r, z)), `${slots[i].id} di dalam blok tamu`);
    assert.ok(!overlap(r, HOTEL_BUILDING) && !overlap(r, HOTEL_FORECOURT) && !overlap(r, HOTEL_PARKING), `${slots[i].id} di luar bangunan/halaman/parkir karyawan`);
    assert.equal(parkingZoneAt(slots[i].x, slots[i].z).id, 'guest');
  });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${slots[i].id} menimpa ${slots[j].id}`);
  assert.ok(slots.filter((s) => s.ev).every((s) => s.block === 'D') && slots.some((s) => s.ev), 'hanya blok D yang listrik');
  assert.ok(slots.every((s) => s.w >= 2.8 && s.d >= 5.6), 'slot lebar untuk mobil mewah');
});

test('parkir: ada ruang lorong 6,4 m di antara baris tamu yang berhadapan (mobil bisa lewat)', () => {
  const byBlock = guestSlots().filter((s) => s.block === 'A' && s.z < 360);
  const xs = byBlock.map((s) => s.x).sort((a, b) => a - b);
  // baris kiri (hidung ke timur) dan baris kanan (hidung ke barat) dalam satu modul berjarak 5,6 + 6,4 antar pusat
  assert.ok(Math.abs(xs[1] - xs[0] - (5.6 + 6.4)) < 1e-6, `jarak pusat ${xs[1] - xs[0]}`);
});

test('parkir: 120 slot motor karyawan di bawah kanopi, tidak menimpa apa pun', () => {
  const bikes = bikeSlots();
  assert.equal(bikes.length, 120);
  assert.equal(new Set(bikes.map((s) => s.id)).size, 120);
  const rects = bikes.map(slotRect);
  rects.forEach((r, i) => {
    assert.ok(inside(r, STAFF_BIKES_CANOPY), `${bikes[i].id} di bawah kanopi`);
    assert.ok(inside(STAFF_BIKES_CANOPY, STAFF_BIKES));
  });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${bikes[i].id} menimpa ${bikes[j].id}`);
});

test('parkir: Royal Garage punya panggung putar Bugatti + 5 bay, semua di dalam garasi dan terpisah dari zona lain', () => {
  const slots = ownerSlots();
  assert.equal(slots.length, 6);
  assert.equal(slots[0].id, 'OWNER-00');
  assert.ok(slots[0].turntable);
  const rects = slots.map(slotRect);
  rects.forEach((r, i) => assert.ok(inside(r, OWNER_GARAGE), `${slots[i].id} di dalam garasi`));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${slots[i].id} menimpa ${slots[j].id}`);
  const t = [OWNER_TURNTABLE.x - OWNER_TURNTABLE.r, OWNER_TURNTABLE.z - OWNER_TURNTABLE.r, OWNER_TURNTABLE.x + OWNER_TURNTABLE.r, OWNER_TURNTABLE.z + OWNER_TURNTABLE.r];
  assert.ok(inside(t, OWNER_GARAGE), 'panggung putar di dalam garasi');
  for (let i = 1; i < rects.length; i++) assert.ok(!overlap(rects[i], t), `${slots[i].id} tidak menimpa panggung putar`);
  assert.ok(overlap(OWNER_LANE, [OWNER_GARAGE[0], OWNER_GARAGE[1] - 0.001, OWNER_GARAGE[2], OWNER_GARAGE[1] + 0.001]), 'lajur pemilik bersinggungan dengan pintu garasi');
  for (const s of slots) assert.equal(parkingZoneAt(s.x, s.z).id, 'owner');
  for (const s of guestSlots()) assert.notEqual(parkingZoneAt(s.x, s.z).id, 'owner');
});

test('parkir: lajur penghubung tamu bersinggungan dengan halaman, blok barat laut, dan sayap menara', () => {
  const touch = (a, b) => overlap([a[0] - 0.01, a[1] - 0.01, a[2] + 0.01, a[3] + 0.01], b);
  assert.ok(touch(GUEST_ENTRY_LANE, HOTEL_FORECOURT));
  assert.ok(touch(GUEST_ENTRY_LANE, GUEST_LINK));
  assert.ok(touch(GUEST_LINK, GUEST_NW));
  assert.ok(touch(GUEST_LINK, GUEST_FLANK));
});

test('parkir: keterisian deterministik (sekitar 40%), mobil digambar hanya di slot terisi, warna dari palet', () => {
  const slots = guestSlots();
  const a = occupancy(slots, 0.4);
  const b = occupancy(slots, 0.4);
  assert.deepEqual([...a], [...b]);
  assert.ok(a.size > 150 && a.size < 250, `terisi ${a.size}`);
  const cars = parkedGuestCars(a);
  assert.equal(cars.length, a.size);
  for (const c of cars) assert.ok(a.has(c.id) && CAR_COLORS.includes(c.color));
  assert.equal(occupancy(slots, 0).size, 0);
  assert.equal(occupancy(slots, 1).size, 500);
});

test('parkir: valet digital memilih slot kosong terdekat dari titik masuk, melewati yang terisi, null bila penuh', () => {
  const none = new Set();
  const first = assignValet(none);
  assert.ok(first);
  const dist = (s) => Math.abs(s.x - VALET_POINT.x) + Math.abs(s.z - VALET_POINT.z);
  for (const s of guestSlots()) assert.ok(dist(first) <= dist(s) + 1e-9, `${first.id} paling dekat, bukan ${s.id}`);
  const second = assignValet(new Set([first.id]));
  assert.notEqual(second.id, first.id);
  assert.equal(assignValet(new Set(guestSlots().map((s) => s.id))), null);
});

test('parkir: statistik blok dan warna lampu slot', () => {
  const occ = occupancy(guestSlots(), 0.4);
  const st = guestStats(occ);
  assert.equal(st.total, 500);
  assert.equal(st.occupied + st.free, 500);
  assert.equal(st.occupied, occ.size);
  const car = guestSlots().find((s) => !s.ev);
  const ev = guestSlots().find((s) => s.ev);
  assert.notEqual(slotLightColor(car, false), slotLightColor(car, true));
  assert.notEqual(slotLightColor(ev, false), slotLightColor(car, false), 'slot listrik kosong berwarna beda');
  assert.equal(slotLightColor(ev, true), slotLightColor(car, true));
  assert.notEqual(slotLightColor(bikeSlots()[0], false), slotLightColor(ownerSlots()[0], false));
});
