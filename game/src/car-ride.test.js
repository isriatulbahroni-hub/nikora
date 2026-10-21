import test from 'node:test';
import assert from 'node:assert/strict';
import { Fleet, villaCars, hotelCars } from './vehicle-fleet.js';
import { carControls, createCarRide } from './car-ride.js';
import { forward } from './vehicle.js';

const env = { surfaceAt: () => 'road' };
const noopView = { update() {} };
const hud = () => { const calls = []; return { set: (v) => calls.push(v), calls }; };
const mk = (extra = {}) => {
  const fleet = new Fleet({ specs: villaCars(), selfId: 'aku', env });
  const toasts = [];
  const h = hud();
  const ride = createCarRide({ fleet, view: noopView, hud: h, toast: (t) => toasts.push(t), role: 'owner', ...extra });
  return { fleet, ride, toasts, h };
};

test('daftar mobil per halaman: vila 6, hotel 8, tanpa tumpang tindih', () => {
  assert.equal(villaCars().length, 6);
  assert.equal(hotelCars().length, 8);
  assert.ok(villaCars().every((c) => c.id.startsWith('villa_')));
  assert.ok(hotelCars().every((c) => c.id.startsWith('hotel_')));
});

test('kontrol: atas = gas, bawah = rem/mundur, kanan = belok kanan (ke barat saat menghadap selatan)', () => {
  assert.equal(carControls({ x: 0, z: -1 }).throttle, 1);
  assert.equal(carControls({ x: 0, z: 1 }).throttle, -1);
  assert.equal(carControls({ x: 0.5, z: 0 }).steer, -0.5);
  const { fleet, ride } = mk();
  const me = { x: fleet.cars[0].x + 2, z: fleet.cars[0].z, level: 0, stair: null, y: 0 };
  assert.equal(ride.board(me), true);
  assert.ok(fleet.driving);
  for (let i = 0; i < 35; i++) ride.step(me, { delta: 1 / 30, rawInput: { x: 1, z: -1 } }); // ±1 detik: belum berputar penuh
  assert.ok(forward(fleet.driving.heading).x < -0.2, 'belok kanan = ke barat');
});

test('naik: pemain dipindah ke kursi, tampil sebagai penumpang/pengemudi; turun: kembali ke tanah di samping mobil', () => {
  const { fleet, ride, toasts } = mk();
  const car = fleet.cars[0];
  const me = { x: car.x + 2.5, z: car.z, level: 0, stair: null, y: 0 };
  assert.equal(ride.board(me), true);
  assert.match(toasts.at(-1), /mengemudi/);
  const r = ride.step(me, { delta: 1 / 30, rawInput: { x: 0, z: 0 } });
  assert.equal(r.riding, true);
  assert.ok(Math.hypot(me.x - car.x, me.z - car.z) < 1.6, 'avatar di dalam mobil');
  assert.equal(ride.leave(me), true);
  assert.equal(fleet.mine, null);
  assert.ok(Math.hypot(me.x - car.x, me.z - car.z) > 1.2, 'turun di luar mobil');
  assert.equal(ride.leave(me), false, 'sudah turun');
});

test('terlalu jauh dari mobil: tidak bisa naik', () => {
  const { ride } = mk();
  assert.equal(ride.board({ x: 0, z: 0, level: 0, stair: null, y: 0 }), false);
});

test('jaringan: sendCar dipasang, mobil orang lain diterima, pemain keluar dibersihkan; tanpa transport tetap jalan sendiri', () => {
  const { fleet, ride } = mk();
  const handlers = {};
  const sent = [];
  const net = { id: 'aku2', sendCar: (m) => sent.push(m), on: (e, f) => { handlers[e] = f; } };
  const me = { x: 0, z: 0, level: 0, stair: null, y: 0 };
  ride.wire(net, me);
  assert.equal(fleet.selfId, 'aku2');
  assert.equal(typeof handlers.car, 'function');
  assert.equal(typeof net.carSnapshot, 'function');
  const car = fleet.cars[1];
  fleet.board({ x: car.x + 2, z: car.z });
  assert.ok(sent.length >= 1, 'naik disiarkan');
  const bare = { id: 'x', on() {} }; // transport tanpa sendCar (?server=)
  assert.doesNotThrow(() => ride.wire(bare, me));
});

test('kamera ikut ke belakang mobil saat mengemudi, kecuali pemain sedang memutarnya', () => {
  const camState = { yaw: 0, dist: 5, pitch: 0.9 };
  let dragging = false;
  const { fleet, ride } = mk({ camState, isDragging: () => dragging });
  const car = fleet.cars[0];
  const me = { x: car.x + 2, z: car.z, level: 0, stair: null, y: 0 };
  ride.board(me);
  assert.ok(camState.dist >= 9 && camState.pitch <= 0.5);
  camState.yaw = 1;
  dragging = true;
  for (let i = 0; i < 30; i++) ride.step(me, { delta: 1 / 30, rawInput: { x: 0, z: 0 } });
  assert.equal(camState.yaw, 1, 'tidak ditarik saat diputar pemain');
  dragging = false;
  for (let i = 0; i < 120; i++) ride.step(me, { delta: 1 / 30, rawInput: { x: 0, z: 0 } });
  assert.ok(Math.abs(Math.atan2(Math.sin(camState.yaw - Math.PI), Math.cos(camState.yaw - Math.PI))) < 0.1, 'kamera di belakang mobil (menghadap selatan: yaw = PI)');
});

test('persetujuan admin: tamu dan offline ditolak, owner/MC boleh; di luar jangkauan mobil tidak ada pesan', () => {
  const near = (fleet) => ({ x: fleet.cars[0].x + 2, z: fleet.cars[0].z, level: 0, stair: null, y: 0 });
  for (const role of ['guest', null]) {
    const { fleet, ride, toasts } = mk({ role });
    assert.equal(ride.canUse(), false);
    assert.equal(ride.board(near(fleet)), false);
    assert.equal(fleet.mine, null, 'tidak naik');
    assert.match(toasts.at(-1), /disetujui admin/);
    const n = toasts.length;
    assert.equal(ride.board({ x: 0, z: 0, level: 0, stair: null, y: 0 }), false);
    assert.equal(toasts.length, n, 'jauh dari mobil: diam saja');
  }
  for (const role of ['owner', 'mc']) {
    const { fleet, ride } = mk({ role });
    assert.equal(ride.canUse(), true);
    assert.equal(ride.board(near(fleet)), true);
  }
});

test('wire() mengambil peran bertanda tangan dari jaringan: tamu ditolak, MC boleh', () => {
  const me = { x: 0, z: 0, level: 0, stair: null, y: 0 };
  const a = mk({ role: null });
  a.ride.wire({ id: 'x', role: 'guest', on() {} }, me);
  assert.equal(a.ride.canUse(), false);
  const b = mk({ role: null });
  b.ride.wire({ id: 'y', role: 'mc', on() {} }, me);
  assert.equal(b.ride.canUse(), true);
  const c = mk({ role: 'owner' });
  c.ride.wire({ id: 'z', on() {} }, me); // transport tanpa peran (?server=): dianggap tamu
  assert.equal(c.ride.canUse(), false);
});
