import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARKING_ZONES, PARKING_KEEP_OUT, PARKING_ROAD, GUEST_ENTRY, GUEST_LOT, GUEST_PROMENADE, STAFF_ENTRY, STAFF_LOT, SERVICE_LANE, BUS_LOT, GUIDE_LANES, CANOPIES,
  GUEST_FILL, STAFF_FILL, BUS_FILL, VALET_POINT, CAR_COLORS, BUS_COLORS,
  guestSlots, staffSlots, busBays, slotRect, parkingZoneAt, inParkingKeepOut, occupancy, guestOccupied, staffOccupied, busOccupied, slotLightColor,
  assignValet, valetStandPoint, routeToSlot, routeFromSlot, routeLength, guestStats, pickParkingEvent, parkedCars, parkedBuses, mulberry32,
} from './villa-parking.js';

// Batas kompleks villa dan lebar jalan tanah di villa-layout.js (BOUNDS.maxZ, COUNTRYSIDE.roadHalf); dicocokkan dengan layout di villa-parking-layout.test.js.
const VILLA_MAX_Z = 84;
const ROAD_HALF = 3.2;

const E = 1e-9;
const inside = (r, outer) => r[0] >= outer[0] - E && r[2] <= outer[2] + E && r[1] >= outer[1] - E && r[3] <= outer[3] + E;
const overlap = (a, b) => a[0] < b[2] - E && a[2] > b[0] + E && a[1] < b[3] - E && a[3] > b[1] + E;
const touch = (a, b) => overlap([a[0] - 0.01, a[1] - 0.01, a[2] + 0.01, a[3] + 0.01], b);
const pointIn = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

test('parkir villa: semua zona di selatan gerbang (di luar kompleks), tidak menimpa jalan tanah, dan tidak saling menimpa', () => {
  const all = PARKING_ZONES.flatMap((z) => z.rects.map((r) => ({ zone: z.id, r })));
  for (const { zone, r } of all) {
    assert.ok(r[1] > VILLA_MAX_Z + 10, `${zone} ${r} jauh di selatan pagar villa`);
    assert.ok(!overlap(r, PARKING_ROAD), `${zone} ${r} tidak menimpa jalan beraspal`);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].zone === all[j].zone) continue;
      assert.ok(!overlap(all[i].r, all[j].r), `${all[i].zone} ${all[i].r} menimpa ${all[j].zone} ${all[j].r}`);
    }
  }
  assert.equal(PARKING_KEEP_OUT.length, all.length + 1, 'keep-out = semua persegi zona + ruas jalan beraspal');
  assert.deepEqual([...PARKING_ROAD], [-ROAD_HALF, 104, ROAD_HALF, 196]);
});

test('parkir villa: tepat 300 slot tamu (blok A-E masing-masing 60), id unik, di dalam lahan tamu, tidak saling menimpa', () => {
  const slots = guestSlots();
  assert.equal(slots.length, 300);
  assert.equal(new Set(slots.map((s) => s.id)).size, 300);
  assert.deepEqual(Object.fromEntries(Object.entries(guestStats(new Set()).blocks).map(([b, v]) => [b, v.total])), { A: 60, B: 60, C: 60, D: 60, E: 60 });
  const rects = slots.map(slotRect);
  rects.forEach((r, i) => {
    assert.ok(inside(r, GUEST_LOT), `${slots[i].id} di dalam lahan tamu`);
    assert.equal(parkingZoneAt(slots[i].x, slots[i].z).id, 'guest');
    assert.equal(slots[i].zone, 'guest');
  });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${slots[i].id} menimpa ${slots[j].id}`);
  assert.ok(slots.some((s) => s.ev) && slots.filter((s) => s.ev).every((s) => s.block === 'E'), 'hanya blok E yang listrik');
  assert.equal(slots.filter((s) => s.ev).length, 60);
  assert.ok(slots.every((s) => s.w >= 2.8 && s.d >= 5.6), 'slot lebar untuk mobil mewah');
});

test('parkir villa: lorong 6,4 m di antara dua baris tamu yang berhadapan dan titik tengah lorong (aisleX) benar', () => {
  for (const block of ['A', 'B', 'C', 'D', 'E']) {
    const heads = guestSlots().filter((s) => s.block === block && s.z < 113); // slot pertama tiap baris
    assert.equal(heads.length, 2, `blok ${block}`);
    const [left, right] = heads.sort((a, b) => a.x - b.x);
    assert.ok(Math.abs(right.x - left.x - (5.6 + 6.4)) < 1e-6, `blok ${block} jarak pusat ${right.x - left.x}`);
    const mid = (left.x + right.x) / 2;
    assert.ok(Math.abs(left.aisleX - mid) < 1e-6 && Math.abs(right.aisleX - mid) < 1e-6, `blok ${block}: aisleX di tengah lorong`);
    assert.equal(left.heading, 0);
    assert.equal(right.heading, Math.PI);
  }
});

test('parkir villa: 80 slot karyawan dan 10 bay bus, di dalam lahannya dan tidak saling menimpa', () => {
  const staff = staffSlots();
  assert.equal(staff.length, 80);
  assert.equal(new Set(staff.map((s) => s.id)).size, 80);
  const sr = staff.map(slotRect);
  sr.forEach((r, i) => {
    assert.ok(inside(r, STAFF_LOT), `${staff[i].id} di dalam lahan karyawan`);
    assert.equal(parkingZoneAt(staff[i].x, staff[i].z).id, 'staff');
  });
  for (let i = 0; i < sr.length; i++) for (let j = i + 1; j < sr.length; j++) assert.ok(!overlap(sr[i], sr[j]), `${staff[i].id} menimpa ${staff[j].id}`);

  const bays = busBays();
  assert.equal(bays.length, 10);
  assert.equal(new Set(bays.map((s) => s.id)).size, 10);
  const br = bays.map(slotRect);
  br.forEach((r, i) => {
    assert.ok(inside(r, BUS_LOT), `${bays[i].id} di dalam terminal bus`);
    assert.equal(parkingZoneAt(bays[i].x, bays[i].z).id, 'bus');
    assert.ok(bays[i].d >= 12.5 && bays[i].w >= 3.8, 'bay muat bus 12 m');
  });
  for (let i = 0; i < br.length; i++) for (let j = i + 1; j < br.length; j++) assert.ok(!overlap(br[i], br[j]), `${bays[i].id} menimpa ${bays[j].id}`);
  assert.ok(Math.min(...br.map((r) => r[3])) < BUS_LOT[3] - 9, 'sisa lorong manuver minimal 9 m di selatan bay');
});

test('parkir villa: jaringan lajur tersambung dari jalan ke semua blok (tamu di barat, karyawan dan bus di timur)', () => {
  assert.ok(touch(GUEST_ENTRY, PARKING_ROAD), 'lajur masuk tamu menempel jalan');
  assert.ok(touch(GUEST_ENTRY, GUEST_LOT));
  assert.ok(touch(GUEST_LOT, GUEST_PROMENADE));
  assert.ok(touch(GUEST_PROMENADE, PARKING_ROAD));
  assert.ok(touch(STAFF_ENTRY, PARKING_ROAD), 'lajur masuk karyawan menempel jalan');
  assert.ok(touch(STAFF_ENTRY, STAFF_LOT));
  assert.ok(touch(STAFF_ENTRY, SERVICE_LANE));
  assert.ok(touch(SERVICE_LANE, STAFF_LOT));
  assert.ok(touch(SERVICE_LANE, BUS_LOT));
  assert.ok(touch(SERVICE_LANE, PARKING_ROAD));
  assert.ok(GUEST_ENTRY[3] - GUEST_ENTRY[1] >= 6.4, 'lajur masuk tamu cukup lebar untuk dua arah');
  assert.ok(STAFF_ENTRY[3] - STAFF_ENTRY[1] >= 6.4);
  assert.ok(SERVICE_LANE[2] - SERVICE_LANE[0] >= 6.4);
  assert.ok(VALET_POINT.z > GUEST_ENTRY[1] && VALET_POINT.z < GUEST_ENTRY[3] && VALET_POINT.x < GUEST_ENTRY[2] && VALET_POINT.x > GUEST_ENTRY[0], 'titik valet di lajur masuk');
});

test('parkir villa: keterisian deterministik (tamu sekitar 60%), mobil digambar hanya di slot terisi, warna dari palet', () => {
  const slots = guestSlots();
  const a = occupancy(slots, GUEST_FILL, 2026);
  const b = occupancy(slots, GUEST_FILL, 2026);
  assert.deepEqual([...a], [...b]);
  assert.ok(a.size > 150 && a.size < 210, `terisi ${a.size}`);
  assert.equal(guestOccupied().size, a.size);
  assert.equal(guestOccupied(), guestOccupied(), 'di-cache');
  const cars = parkedCars(slots, a);
  assert.equal(cars.length, a.size);
  for (const c of cars) assert.ok(a.has(c.id) && CAR_COLORS.includes(c.color));
  assert.equal(occupancy(slots, 0).size, 0);
  assert.equal(occupancy(slots, 1).size, 300);
  assert.ok(staffOccupied().size > 40 && staffOccupied().size < 70, `karyawan terisi ${staffOccupied().size}`);
  assert.equal(STAFF_FILL, 0.7);
  assert.ok(busOccupied().size >= 3 && busOccupied().size <= 9);
  assert.equal(BUS_FILL, 0.6);
  const buses = parkedBuses();
  assert.equal(buses.length, busOccupied().size);
  for (const bus of buses) assert.ok(busOccupied().has(bus.id) && BUS_COLORS.includes(bus.color));
});

test('parkir villa: valet digital memilih slot kosong terdekat, melewati yang terisi dan yang sudah dituju, null bila penuh', () => {
  const first = assignValet(new Set());
  assert.ok(first);
  const dist = (s) => Math.abs(s.x - VALET_POINT.x) + Math.abs(s.z - VALET_POINT.z);
  for (const s of guestSlots()) assert.ok(dist(first) <= dist(s) + 1e-9, `${first.id} paling dekat, bukan ${s.id}`);
  const second = assignValet(new Set([first.id]));
  assert.notEqual(second.id, first.id);
  const third = assignValet(new Set(), VALET_POINT, new Set([first.id]));
  assert.equal(third.id, second.id, 'slot yang sedang dituju dilewati');
  assert.equal(assignValet(new Set(guestSlots().map((s) => s.id))), null);
  const slot = assignValet(guestOccupied());
  assert.ok(slot && !guestOccupied().has(slot.id));
});

test('parkir villa: titik berdiri valet ada di lorong depan slot (zona tamu, bukan di atas slot mana pun)', () => {
  const rects = guestSlots().map(slotRect);
  for (const s of guestSlots()) {
    const p = valetStandPoint(s);
    assert.equal(parkingZoneAt(p.x, p.z)?.id, 'guest', `${s.id}: titik berdiri di zona tamu`);
    assert.ok(rects.every((r) => !pointIn(r, p.x, p.z)), `${s.id}: titik berdiri tidak di atas slot`);
  }
});

test('parkir villa: rute mobil ke slot lewat lajur dan lorong (siku-siku), parkir mundur; rute pulang maju dan kembali ke titik keluar', () => {
  for (const s of [guestSlots()[0], guestSlots()[59], guestSlots()[60], guestSlots()[299]]) {
    const inn = routeToSlot(s);
    assert.deepEqual([inn[0].x, inn[0].z], [VALET_POINT.x, VALET_POINT.z]);
    assert.deepEqual([inn.at(-1).x, inn.at(-1).z], [s.x, s.z]);
    assert.ok(inn.at(-1).reverse, 'ruas terakhir mundur');
    assert.ok(inn.slice(0, -1).every((p) => !p.reverse));
    inn.slice(1).forEach((p, i) => assert.ok(Math.abs(p.x - inn[i].x) < E || Math.abs(p.z - inn[i].z) < E, `${s.id}: ruas ${i} siku-siku`));
    // titik belok di lorong: bukan di atas slot mana pun
    const rects = guestSlots().map(slotRect);
    assert.ok(rects.every((r) => !pointIn(r, inn[1].x, inn[1].z) && !pointIn(r, inn[2].x, inn[2].z)), `${s.id}: belokan di lorong`);
    const out = routeFromSlot(s);
    assert.deepEqual([out[0].x, out[0].z], [s.x, s.z]);
    assert.deepEqual([out.at(-1).x, out.at(-1).z], [VALET_POINT.x, VALET_POINT.z]);
    assert.ok(out.every((p) => !p.reverse), 'pulang maju');
    assert.ok(Math.abs(routeLength(inn) - routeLength(out)) < 1e-6, 'panjang rute pergi = pulang');
  }
  assert.ok(routeLength(routeToSlot(guestSlots()[299])) > routeLength(routeToSlot(guestSlots()[0])), 'slot terjauh = rute lebih panjang');
});

test('parkir villa: kejadian mobil datang/pergi deterministik dari rand, hormati slot sibuk dan terpesan', () => {
  const occ = new Set(guestOccupied());
  const r1 = mulberry32(1);
  const r2 = mulberry32(1);
  const e1 = pickParkingEvent(occ, r1);
  const e2 = pickParkingEvent(occ, r2);
  assert.deepEqual([e1.type, e1.slot.id], [e2.type, e2.slot.id]);
  let arrivals = 0;
  let leaves = 0;
  const rand = mulberry32(99);
  for (let i = 0; i < 200; i++) {
    const e = pickParkingEvent(occ, rand);
    assert.ok(e);
    if (e.type === 'arrive') { arrivals++; assert.ok(!occ.has(e.slot.id), 'datang ke slot kosong'); } else { leaves++; assert.ok(occ.has(e.slot.id), 'pergi dari slot terisi'); }
  }
  assert.ok(arrivals > 20 && leaves > 20, `campuran datang ${arrivals} / pergi ${leaves}`);
  const busy = new Set([...occ].slice(0, 5));
  for (let i = 0; i < 100; i++) {
    const e = pickParkingEvent(occ, rand, { busy });
    assert.ok(!busy.has(e.slot.id), 'slot sibuk dilewati');
  }
  const full = new Set(guestSlots().map((s) => s.id));
  assert.equal(pickParkingEvent(full, () => 0.01).type, 'leave', 'penuh: hanya bisa pergi');
  assert.equal(pickParkingEvent(new Set(), () => 0.99).type, 'arrive', 'kosong: hanya bisa datang');
  assert.equal(pickParkingEvent(new Set(), () => 0.5, { reserved: new Set(guestSlots().map((s) => s.id)) }), null, 'semua slot sudah dituju: tidak ada kejadian');
});

test('parkir villa: statistik blok dan warna lampu slot', () => {
  const occ = guestOccupied();
  const st = guestStats(occ);
  assert.equal(st.total, 300);
  assert.equal(st.occupied + st.free, 300);
  assert.equal(st.occupied, occ.size);
  const car = guestSlots().find((s) => !s.ev);
  const ev = guestSlots().find((s) => s.ev);
  assert.notEqual(slotLightColor(car, false), slotLightColor(car, true));
  assert.notEqual(slotLightColor(ev, false), slotLightColor(car, false), 'slot listrik kosong berwarna beda');
  assert.equal(slotLightColor(ev, true), slotLightColor(car, true));
  assert.notEqual(slotLightColor(staffSlots()[0], false), slotLightColor(busBays()[0], false));
  assert.notEqual(slotLightColor(staffSlots()[0], false), slotLightColor(car, false));
});

test('parkir villa: jalur LED penuntun ada di dalam kawasan parkir, melewati lorong tiap blok, dan tidak di atas slot', () => {
  assert.ok(GUIDE_LANES.length >= 10);
  assert.equal(new Set(GUIDE_LANES.map((g) => g.id)).size, GUIDE_LANES.length);
  const slotRects = [...guestSlots(), ...staffSlots(), ...busBays()].map(slotRect);
  for (const g of GUIDE_LANES) {
    assert.ok(g.axis === 'x' || g.axis === 'z');
    assert.ok(g.dir === 1 || g.dir === -1);
    const len = g.axis === 'x' ? g.rect[2] - g.rect[0] : g.rect[3] - g.rect[1];
    assert.ok(len > 8, `${g.id} cukup panjang`);
    assert.ok(PARKING_KEEP_OUT.some((r) => inside(g.rect, r)), `${g.id} di dalam kawasan parkir`);
    assert.ok(slotRects.every((r) => !overlap(g.rect, r)), `${g.id} tidak di atas slot`);
  }
  for (const block of ['A', 'B', 'C', 'D', 'E', 'S1', 'S2']) assert.ok(GUIDE_LANES.some((g) => g.id === `aisle-${block}`), `lorong ${block}`);
  assert.equal(GUIDE_LANES.find((g) => g.id === 'aisle-E').color, 0x39d0ff, 'lorong listrik berwarna biru muda');
});

test('parkir villa: kanopi panel surya menutupi blok listrik dan parkir karyawan, tiangnya di jalur tanaman (bukan di atas slot)', () => {
  assert.deepEqual(CANOPIES.map((c) => c.id), ['ev', 'staff']);
  const slotRects = [...guestSlots(), ...staffSlots()].map(slotRect);
  for (const c of CANOPIES) {
    assert.ok(c.height >= 4.2, 'cukup tinggi untuk SUV dan bus mini');
    const covered = (c.id === 'ev' ? guestSlots().filter((s) => s.ev) : staffSlots()).map(slotRect);
    for (const r of covered) assert.ok(inside(r, c.rect), 'slot di bawah kanopi');
    for (const px of c.pillarsX) {
      for (let z = c.rect[1] + 6; z < c.rect[3]; z += 14) {
        assert.ok(slotRects.every((r) => !pointIn(r, px, z)), `tiang kanopi ${c.id} di (${px}, ${z}) bukan di atas slot`);
      }
    }
  }
});

test('parkir villa: pemeriksaan keep-out dengan jarak aman', () => {
  assert.ok(inParkingKeepOut(-50, 150));
  assert.ok(inParkingKeepOut(0, 150), 'jalan beraspal di depan parkir');
  assert.ok(!inParkingKeepOut(0, 90), 'di depan gerbang masih jalan tanah biasa');
  assert.ok(!inParkingKeepOut(-120, 150));
  assert.ok(inParkingKeepOut(-107, 150, 3), 'dalam jarak aman 3 m dari tepi barat');
  assert.ok(!inParkingKeepOut(-107, 150, 0));
});
