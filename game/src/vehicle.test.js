import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, createVehicle, stepVehicle, seatWorld, exitPose, findBoardable, boardVehicle, leaveVehicle, forward, driverOf, occupants } from './vehicle.js';
import { getVillaWorld } from './villa-layout.js';
import { ROAD, HOTEL_FORECOURT, surfaceAt } from './hotel-layout.js';

const DT = 1 / 30;
const drive = (v, input, seconds, env = {}) => { for (let t = 0; t < seconds; t += DT) stepVehicle(v, input, DT, env); return v; };

test('mobil: mesin mati tidak bisa dijalankan; pengemudi naik = mesin hidup, turun = mati', () => {
  const v = createVehicle({ id: 'c1', x: 0, z: 0 });
  drive(v, { throttle: 1 }, 2);
  assert.equal(v.speed, 0);
  assert.equal(boardVehicle(v, 0, 'ani'), true);
  assert.equal(v.engine, true);
  drive(v, { throttle: 1 }, 2, {});
  assert.ok(v.speed > 5, `melaju: ${v.speed}`);
  const out = leaveVehicle(v, 'ani');
  assert.equal(out.seat, 0);
  assert.equal(v.engine, false);
  drive(v, {}, 12);
  assert.equal(v.speed, 0, 'berhenti sendiri setelah pengemudi turun');
});

test('mobil: maju ke selatan di heading 0, gas penuh mencapai batas kecepatan jalan, belok ke kanan memutar searah jarum jam', () => {
  const v = createVehicle({ id: 'c', x: 0, z: 100, heading: 0 });
  boardVehicle(v, 0, 'p');
  drive(v, { throttle: 1 }, 8, {});
  assert.ok(v.z > 100 + 40, `maju ke +z: ${v.z}`);
  assert.ok(Math.abs(v.x) < 1e-6, 'lurus');
  assert.ok(v.speed <= CAR.maxSpeed + 1e-9);
  const heading0 = v.heading;
  drive(v, { throttle: 0.6, steer: 1 }, 1.5);
  assert.ok(v.heading > heading0, 'setir kanan menambah heading');
});

test('mobil: kecepatan dibatasi permukaan (tanah/halaman villa lebih pelan daripada jalan raya)', () => {
  const compound = createVehicle({ id: 'a', x: 0, z: 50 });
  boardVehicle(compound, 0, 'p');
  drive(compound, { throttle: 1 }, 2, { surfaceAt: () => 'compound' });
  drive(compound, { throttle: 1 }, 3, { surfaceAt: () => 'compound' });
  assert.ok(compound.speed <= 8.5, `compound ${compound.speed}`);
  const road = createVehicle({ id: 'b', x: 0, z: 100 });
  boardVehicle(road, 0, 'p');
  drive(road, { throttle: 1 }, 10, { surfaceAt: () => 'road' });
  assert.ok(road.speed > 20, `jalan ${road.speed}`);
});

test('mobil: mundur lebih lambat, rem menghentikan, tembok menghentikan dan tidak ditembus', () => {
  const v = createVehicle({ id: 'c', x: 0, z: 0, heading: 0 });
  boardVehicle(v, 0, 'p');
  drive(v, { throttle: -1 }, 5, { surfaceAt: () => 'road' });
  assert.ok(v.speed < 0 && v.speed >= -CAR.reverseMax - 1e-9);
  drive(v, { brake: true }, 2, { surfaceAt: () => 'road' });
  assert.equal(v.speed, 0);
  const wall = [{ minX: -10, maxX: 10, minZ: 30, maxZ: 31 }];
  const w = createVehicle({ id: 'w', x: 0, z: 0, heading: 0 });
  boardVehicle(w, 0, 'p');
  let hit = 0;
  for (let t = 0; t < 8; t += DT) { stepVehicle(w, { throttle: 1 }, DT, { colliders: wall, surfaceAt: () => 'road' }); hit = Math.max(hit, w.hit); }
  assert.ok(hit > 5, 'ada benturan');
  assert.ok(w.z < 30 - CAR.circleOffset, `tidak menembus tembok: z=${w.z}`);
});

test('kursi: empat kursi, pengemudi kanan depan, tidak boleh dobel, penumpang ikut posisi mobil, turun di sisi pintu', () => {
  const v = createVehicle({ id: 'c', x: 50, z: 60, heading: Math.PI / 2 });
  assert.equal(boardVehicle(v, 0, 'ani'), true);
  assert.equal(boardVehicle(v, 0, 'budi'), false, 'kursi terisi');
  assert.equal(boardVehicle(v, 1, 'ani'), false, 'satu orang satu kursi');
  assert.equal(boardVehicle(v, 1, 'budi'), true);
  assert.equal(boardVehicle(v, 2, 'cici'), true);
  assert.equal(boardVehicle(v, 3, 'dedi'), true);
  assert.equal(findBoardable([v], { x: 50, z: 60 }), null, 'penuh');
  assert.deepEqual(occupants(v).length, 4);
  assert.equal(driverOf(v), 'ani');
  // heading timur: maju = +x. Pengemudi di sisi kanan mobil = selatan (+z) saat menghadap timur.
  const s0 = seatWorld(v, 0);
  const s1 = seatWorld(v, 1);
  assert.ok(s0.z > s1.z, 'kanan (selatan) > kiri (utara) saat menghadap timur');
  assert.ok(s0.x > v.x, 'kursi depan di depan pusat');
  v.x += 10;
  assert.ok(Math.abs(seatWorld(v, 0).x - (s0.x + 10)) < 1e-9, 'penumpang ikut bergerak');
  const out = leaveVehicle(v, 'budi');
  assert.equal(out.seat, 1);
  const e = exitPose(v, 1);
  assert.ok(e.z < seatWorld(v, 1).z, 'kursi kiri turun ke sisi kiri (utara)');
  assert.equal(findBoardable([v], { x: v.x + 1, z: v.z }).seat, 1);
  assert.equal(findBoardable([v], { x: v.x + 30, z: v.z }), null, 'terlalu jauh');
});

test('perjalanan villa -> hotel: dari gerbang villa menyusuri jalan raya ke halaman hotel, kurang dari 40 detik, tetap di jalan', () => {
  const villa = getVillaWorld();
  const env = { colliders: villa.colliders, surfaceAt };
  // mulai di luar gerbang selatan (z=90) menghadap selatan di lajur kiri (x = -3)
  const v = createVehicle({ id: 'tamu', x: -3, z: 90, heading: 0 });
  boardVehicle(v, 0, 'p');
  let t = 0;
  let offRoad = 0;
  while (v.z < HOTEL_FORECOURT[3] - 25 && t < 60) {
    stepVehicle(v, { throttle: 1, steer: 0 }, DT, env);
    if (surfaceAt(v.x, v.z) !== 'road') offRoad++;
    t += DT;
  }
  assert.ok(v.z >= HOTEL_FORECOURT[3] - 25, `sampai di hotel (z=${v.z.toFixed(1)})`);
  assert.ok(t < 40, `waktu tempuh ${t.toFixed(1)} dtk`);
  assert.ok(t > 10, `tidak teleport: ${t.toFixed(1)} dtk`);
  assert.equal(offRoad, 0);
  assert.ok(Math.abs(v.x + 3) < 0.5, 'tetap lurus di lajur');
});

test('mobil keluar gerbang villa: lebar mobil muat melewati bukaan gerbang (6,4 m)', () => {
  const villa = getVillaWorld();
  const v = createVehicle({ id: 'g', x: 0, z: 76, heading: 0 });
  boardVehicle(v, 0, 'p');
  // jalur lurus dari halaman game center ke gerbang bisa terhalang tembok arena; di sini hanya periksa bukaan gerbang
  v.z = 82;
  let t = 0;
  while (v.z < 92 && t < 10) { stepVehicle(v, { throttle: 1 }, DT, { colliders: villa.colliders }); t += DT; }
  assert.ok(v.z >= 92, `lolos gerbang, z=${v.z}`);
  assert.equal(v.hit, 0);
});

test('forward: heading 0 ke selatan, PI ke utara, PI/2 ke timur', () => {
  assert.ok(Math.abs(forward(0).z - 1) < 1e-12);
  assert.ok(Math.abs(forward(Math.PI).z + 1) < 1e-12);
  assert.ok(Math.abs(forward(Math.PI / 2).x - 1) < 1e-12);
});

test('jalan raya: 42 m (setengah lebar 21 m), sambung dari gerbang villa ke halaman hotel', () => {
  assert.equal(surfaceAt(0, 200), 'road');
  assert.equal(surfaceAt(20, 200), 'road'); // masih di dalam setengah lebar 21 m
  assert.equal(surfaceAt(22, 200), 'ground'); // di luar bahu
  assert.equal(surfaceAt(0, HOTEL_FORECOURT[1] + 5), 'road');
  assert.equal(surfaceAt(0, 40), 'compound');
  assert.ok(ROAD.toZ - ROAD.fromZ > 250, 'hotel cukup jauh dari villa');
});
