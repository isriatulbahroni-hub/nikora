import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUS_SEATS, CAR_COUNT, ROAD_VENUE, STRETCH, journeyProfile, progressAt, roadSummary, trafficAt, tripDuration, tripList,
} from './villa-road-traffic.js';
import { COMMUTE_H, SHIFTS, VENUE_STAFF } from './venue-staff.js';

const DAY = 86400;
const WINDOW = COMMUTE_H * 3600;
const mod = (a) => ((a % DAY) + DAY) % DAY;
const staff = VENUE_STAFF[ROAD_VENUE];
const byId = new Map(staff.map((s) => [s.id, s]));
const tripsOf = (kind, dir) => tripList().filter((t) => t.kind === kind && t.dir === dir);

test('profil tempuh: rute villa panjang dan sekitar 20 menit', () => {
  const p = journeyProfile();
  assert.ok(p.length > 10000, `panjang ${p.length}`);
  assert.ok(p.duration >= 1000 && p.duration <= 1500, `durasi ${p.duration}`);
  for (const kind of Object.keys(STRETCH)) assert.ok(tripDuration(kind) < WINDOW, `${kind} muat dalam jendela shift`);
});

test('tiap karyawan bermotor punya satu perjalanan berangkat dan satu pulang', () => {
  const motors = staff.filter((s) => s.transport === 'motor');
  assert.ok(motors.length > 0);
  assert.equal(tripsOf('motor', 'out').length, motors.length);
  assert.equal(tripsOf('motor', 'back').length, motors.length);
  assert.deepEqual(new Set(tripsOf('motor', 'out').flatMap((t) => t.staff)), new Set(motors.map((s) => s.id)));
});

test('berangkat dan tiba tepat di jendela shift: tiba paling lambat satu menit sebelum shift, pulang selesai sebelum jendela berakhir', () => {
  for (const t of tripsOf('motor', 'out')) {
    const sh = SHIFTS[byId.get(t.staff[0]).shift];
    const start = mod(t.t0 - (sh.from * 3600 - WINDOW));
    assert.ok(start >= 0 && start <= WINDOW, `${t.id} berangkat di luar jendela`);
    assert.ok(start + tripDuration('motor') <= WINDOW - 60 + 1e-6, `${t.id} terlambat tiba`);
  }
  for (const t of tripsOf('motor', 'back')) {
    const sh = SHIFTS[byId.get(t.staff[0]).shift];
    const start = mod(t.t0 - sh.to * 3600);
    assert.ok(start >= 0 && start + tripDuration('motor') <= WINDOW + 1e-6, `${t.id} pulang melewati jendela`);
  }
});

test('karyawan tanpa kendaraan naik bus: tiap penumpang tepat satu bus per arah, muatan tidak melebihi kursi', () => {
  const riders = staff.filter((s) => s.transport === 'bus');
  assert.ok(riders.length > 0);
  for (const dir of ['out', 'back']) {
    const buses = tripsOf('bus', dir);
    const all = buses.flatMap((t) => t.staff);
    assert.equal(all.length, riders.length);
    assert.deepEqual(new Set(all), new Set(riders.map((s) => s.id)));
    for (const b of buses) assert.ok(b.staff.length > 0 && b.staff.length <= BUS_SEATS, b.id);
  }
  for (const b of tripsOf('bus', 'out')) {
    const sh = SHIFTS[byId.get(b.staff[0]).shift];
    const start = mod(b.t0 - (sh.from * 3600 - WINDOW));
    assert.ok(start >= 0 && start + tripDuration('bus') <= WINDOW - 60 + 1e-6, `${b.id} tiba terlambat`);
  }
});

test('enam mobil dinas villa dikemudikan bellboy villa dan berjalan bolak-balik sepanjang hari', () => {
  const cars = tripList().filter((t) => t.kind === 'car');
  assert.deepEqual([...new Set(cars.map((t) => t.car))].sort(), Array.from({ length: CAR_COUNT }, (_, k) => k));
  for (const c of cars) {
    assert.equal(byId.get(c.driver)?.role, 'bellboy', c.id);
    assert.equal(byId.get(c.driver)?.venue, 'villa');
  }
  assert.equal(tripsOf('car', 'out').length, tripsOf('car', 'back').length);
  let seen = 0;
  for (let h = 0; h < 24; h += 0.25) if (trafficAt(h * 3600).some((v) => v.kind === 'car')) seen++;
  assert.ok(seen >= 20, `mobil dinas terlihat di ${seen} dari 96 cuplikan`);
});

test('jalan ramai di pergantian shift, tanpa motor dan bus di tengah shift', () => {
  const dawn = trafficAt(5.75 * 3600);
  assert.ok(dawn.some((v) => v.kind === 'motor' && v.dir === 'out'), 'motor berangkat sebelum shift pagi');
  assert.ok(dawn.filter((v) => v.dir === 'out').length >= 10);
  const evening = trafficAt(14.1 * 3600);
  assert.ok(evening.some((v) => v.dir === 'back'), 'ada yang pulang sesudah shift pagi');
  for (const v of trafficAt(10 * 3600)) assert.equal(v.kind, 'car', 'tengah shift hanya mobil dinas di jalan');
});

test('posisi di dalam rute, arah out bertambah dan arah back berkurang', () => {
  const p = journeyProfile();
  for (const kind of Object.keys(STRETCH)) {
    let prevOut = -1;
    let prevBack = Infinity;
    for (let e = 0; e <= tripDuration(kind); e += 60) {
      const a = progressAt(kind, 'out', e);
      const b = progressAt(kind, 'back', e);
      assert.ok(a >= 0 && a <= p.length && b >= 0 && b <= p.length);
      assert.ok(a >= prevOut && b <= prevBack, `${kind} jam ke-${e}`);
      prevOut = a;
      prevBack = b;
    }
    assert.equal(progressAt(kind, 'out', 0), 0);
    assert.equal(progressAt(kind, 'back', 0), p.length);
    assert.equal(progressAt(kind, 'out', tripDuration(kind)), p.length);
  }
});

test('trafficAt deterministik dan semua kendaraan berada di rute', () => {
  const p = journeyProfile();
  for (let h = 0; h < 24; h += 0.5) {
    const a = trafficAt(h * 3600);
    const b = trafficAt(h * 3600);
    assert.deepEqual(a, b);
    for (const v of a) assert.ok(v.s >= 0 && v.s <= p.length, `${v.id} s=${v.s}`);
  }
});

test('ringkasan: jumlah perjalanan per jenis', () => {
  const r = roadSummary();
  assert.equal(r.trips, r.byKind.motor + r.byKind.bus + r.byKind.car);
  assert.equal(r.byKind.car, CAR_COUNT * 8 * 2);
});
