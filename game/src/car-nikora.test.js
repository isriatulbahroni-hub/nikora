import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { CAR_MODELS, GLB_MODELS, MODEL_IDS, gearFor, modelOf, rpmFor } from './car-models.js';
import { createVehicle, stepVehicle, specOf } from './vehicle.js';
import { BUGATTI_SPOT, Fleet, NIKORA_SPOT, carSitId, hotelCars } from './vehicle-fleet.js';
import { engineLayers, engineSound } from './car-audio.js';
import { fitCar } from './car-glb.js';
import { getHotelWorld } from './hotel-layout.js';
import { HIGHWAY_LIMIT } from './highway.js';
import { resolveMove } from './villa-layout.js';

const road = { surfaceAt: () => 'road', colliders: [] };
const DT = 1 / 60;
const KMH = 1 / 3.6;
const nikora = () => {
  const v = createVehicle({ id: 'n', x: 0, z: 0, heading: 0, model: 'nikora' });
  v.engine = true;
  return v;
};

test('katalog: NIKORA W16 model GLB terpisah dari empat model prosedural; spesifikasi bisa dicari lewat modelOf/specOf', () => {
  assert.deepEqual([...MODEL_IDS].sort(), ['argent', 'noir', 'royale', 'rubis'], 'katalog prosedural tidak berubah');
  assert.equal(modelOf('nikora'), GLB_MODELS.nikora);
  assert.equal(modelOf('royale'), CAR_MODELS.royale);
  assert.equal(modelOf('tidak-ada'), null);
  const spec = specOf('nikora');
  assert.equal(spec.model, 'nikora');
  assert.match(spec.glb.file, /\.glb$/);
  assert.equal(spec.seatCount, 2);
});

test('NIKORA W16: kelas hypercar 16 silinder, 420 km/j, tujuh gigi menutup kecepatan puncak, kursi di dalam badan', () => {
  const m = GLB_MODELS.nikora;
  assert.equal(m.engine.cylinders, 16);
  assert.equal(m.engine.turbo, true);
  assert.ok(Math.abs(m.maxSpeed * 3.6 - 420) < 1, `kecepatan puncak ${m.maxSpeed * 3.6} km/j`);
  assert.equal(m.engine.gears.length, 7);
  assert.ok(m.engine.gears.every((g, i, a) => i === 0 || g > a[i - 1]), 'gigi menaik');
  assert.ok(m.engine.gears.at(-1) >= m.maxSpeed - 1e-9, 'gigi terakhir menutup kecepatan puncak');
  assert.ok(m.seats[0].side > 0, 'setir kanan');
  for (const s of m.seats) assert.ok(Math.abs(s.fwd) < m.length / 2 && Math.abs(s.side) < m.width / 2);
  for (let v = 0; v <= m.maxSpeed; v += 0.5) {
    const r = rpmFor(m, v, 1);
    assert.ok(r >= m.engine.idleRpm - 1 && r <= m.engine.maxRpm, `v=${v} rpm=${r}`);
  }
  assert.equal(gearFor(m, 0), 0);
  assert.equal(gearFor(m, m.maxSpeed), 7);
});

test('NIKORA W16: 0-100 km/j sekitar 2,4 detik, 0-300 km/j sekitar 9 detik, mencapai kecepatan puncaknya di jalan', () => {
  const v = nikora();
  let t = 0;
  let t100 = null;
  let t300 = null;
  for (let i = 0; i < 60 * 60; i++) {
    stepVehicle(v, { throttle: 1, steer: 0 }, DT, road);
    v.x = 0;
    v.z = 0; // tetap di tempat: yang diuji laju, bukan batas dunia
    t += DT;
    if (t100 === null && v.speed >= 100 * KMH) t100 = t;
    if (t300 === null && v.speed >= 300 * KMH) t300 = t;
  }
  assert.ok(t100 > 2.2 && t100 < 2.8, `0-100: ${t100}`);
  assert.ok(t300 > 8 && t300 < 9.6, `0-300: ${t300}`);
  assert.ok(v.speed >= GLB_MODELS.nikora.maxSpeed * 0.95 && v.speed <= GLB_MODELS.nikora.maxSpeed + 1e-9, `puncak: ${v.speed}`);
});

test('NIKORA W16: gas dilepas di kecepatan puncak melambat pelan (hambatan udara), rem 100-0 km/j sekitar 31 m', () => {
  const m = GLB_MODELS.nikora;
  const v = nikora();
  v.speed = m.maxSpeed;
  for (let i = 0; i < 60; i++) { stepVehicle(v, { throttle: 0, steer: 0 }, DT, road); v.x = 0; v.z = 0; }
  const drop = m.maxSpeed - v.speed;
  assert.ok(drop > 3 && drop < 6, `turun ${drop} m/s dalam 1 detik tanpa gas`);

  const b = nikora();
  b.speed = 100 * KMH;
  let dist = 0;
  for (let i = 0; i < 600 && b.speed > 0; i++) {
    stepVehicle(b, { throttle: 0, brake: true, steer: 0 }, DT, road);
    dist += b.speed * DT;
    b.x = 0;
    b.z = 0;
  }
  assert.equal(b.speed, 0);
  assert.ok(dist > 27 && dist < 35, `jarak berhenti ${dist} m`);
});

test('model lain tidak berubah: tanpa accelFade dan dragK fisika sama seperti semula', () => {
  for (const id of MODEL_IDS) {
    assert.equal(CAR_MODELS[id].accelFade, undefined);
    assert.equal(CAR_MODELS[id].dragK, undefined);
  }
  const v = createVehicle({ id: 'a', model: 'argent' });
  v.engine = true;
  v.speed = 30;
  stepVehicle(v, { throttle: 0, steer: 0 }, 1, road);
  assert.ok(Math.abs(30 - v.speed - (0.9 + 0.012 * 900)) < 1e-9, 'hambatan bawaan 0,9 + 0,012 v^2');
});

test('suara mesin NIKORA W16: 16 silinder, nada naik dengan RPM, turbo bersuara saat gas dalam, mati = hening', () => {
  const m = GLB_MODELS.nikora;
  const idle = engineLayers(m, { speed: 0, throttle: 0, engineOn: true, boost: 0 });
  const full = engineLayers(m, { speed: 100, throttle: 1, engineOn: true, boost: 1 });
  assert.ok(Math.abs(idle.rpm - m.engine.idleRpm) < 1);
  assert.ok(full.fireHz > idle.fireHz * 4, 'nada pembakaran naik tajam');
  assert.ok(full.turboGain > 0 && idle.turboGain === 0);
  assert.equal(engineLayers(m, { speed: 50, throttle: 1, engineOn: false }).exhaustGain, 0);
  assert.ok(engineSound(m, 100, 1).hz > engineSound(m, 2, 0).hz);
});

test('hotel: NIKORA W16 mobil ke-9 di bawah kanopi depan lobi, tidak menabrak apa pun, bisa dinaiki dari depannya', () => {
  const cars = hotelCars();
  const car = cars.find((c) => c.model === 'nikora');
  assert.ok(car, 'ada di armada hotel');
  assert.equal(cars.at(-2).id, car.id, 'tepat sebelum Bugatti Chiron: indeks mobil lain tidak bergeser');
  assert.equal(cars.length, 10);
  assert.deepEqual({ x: car.x, z: car.z, heading: car.heading }, { ...NIKORA_SPOT });
  const f = new Fleet({ specs: cars, selfId: 'ani' });
  const n = f.cars.find((c) => c.model === 'nikora');
  assert.equal(n.seats.length, 2);
  assert.ok(f.seatPose(carSitId(n.index, 0)) && f.seatPose(carSitId(n.index, 1)));
  assert.equal(f.seatPose(carSitId(n.index, 2)), null, 'hanya dua kursi');
  const colliders = getHotelWorld().levels[0].colliders;
  const fwd = { x: Math.sin(n.heading), z: Math.cos(n.heading) };
  for (const s of [n.spec.circleOffset, -n.spec.circleOffset]) {
    const p = { x: n.x + fwd.x * s, z: n.z + fwd.z * s };
    const q = resolveMove(p, n.spec.circleRadius, colliders, HIGHWAY_LIMIT);
    assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < 1e-6, 'lingkaran tabrakan mobil tidak tumpang tindih penghalang');
  }
  const hit = f.board({ x: n.x + 1.5, z: n.z });
  assert.equal(hit.car, n, 'mobil terdekat dari pemain di depannya');
  assert.equal(hit.seat, 0, 'pengemudi dulu');
});

test('hotel: Bugatti Chiron mobil ke-10 (model GLB sendiri) di bawah kanopi di samping NIKORA W16, tidak menabrak apa pun, bisa dinaiki', () => {
  assert.equal(modelOf('bugatti'), GLB_MODELS.bugatti);
  const spec = specOf('bugatti');
  assert.equal(spec.model, 'bugatti');
  assert.equal(spec.seatCount, 2);
  assert.match(spec.glb.file, /mobil-bugatti-chiron\.glb$/);
  assert.ok(existsSync(new URL(`../public/${spec.glb.file}`, import.meta.url)), 'berkas GLB ada di folder publik');
  const cars = hotelCars();
  const car = cars.find((c) => c.model === 'bugatti');
  assert.ok(car, 'ada di armada hotel');
  assert.equal(cars.at(-1).id, car.id, 'terakhir: indeks mobil lain tidak bergeser');
  assert.deepEqual({ x: car.x, z: car.z, heading: car.heading }, { ...BUGATTI_SPOT });
  const f = new Fleet({ specs: cars, selfId: 'ani' });
  const b = f.cars.find((c) => c.model === 'bugatti');
  const n = f.cars.find((c) => c.model === 'nikora');
  assert.ok(Math.hypot(b.x - n.x, b.z - n.z) > 5, 'tidak berimpit dengan NIKORA W16');
  const colliders = getHotelWorld().levels[0].colliders;
  const fwd = { x: Math.sin(b.heading), z: Math.cos(b.heading) };
  for (const s of [b.spec.circleOffset, -b.spec.circleOffset]) {
    const p = { x: b.x + fwd.x * s, z: b.z + fwd.z * s };
    const q = resolveMove(p, b.spec.circleRadius, colliders, HIGHWAY_LIMIT);
    assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < 1e-6, 'lingkaran tabrakan mobil tidak tumpang tindih penghalang');
  }
  const hit = f.board({ x: b.x + 1.5, z: b.z });
  assert.equal(hit.car, b, 'mobil terdekat dari pemain di depannya');
  assert.equal(hit.seat, 0, 'pengemudi dulu');
});

// ---- pemasangan model GLB: skala, pusat, arah moncong, roda
function fakeCarScene() {
  // Dibuat "salah" dengan sengaja: 100x lebih besar dan panjang mobil searah sumbu x; moncong di +x. Roda bernama wheel di empat sudut.
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(450, 120, 204), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.set(0, 80, 0);
  scene.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  nose.name = 'Nose';
  nose.position.set(222, 80, 0);
  scene.add(nose);
  for (const [name, x, z] of [['Wheel_FL', 135, 85], ['Wheel_FR', 135, -85], ['Wheel_RL', -135, 85], ['Wheel_RR', -135, -85]]) {
    const geo = new THREE.CylinderGeometry(37, 37, 30, 16);
    geo.rotateX(Math.PI / 2);
    const w = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    w.name = name;
    w.position.set(x, 37, z);
    scene.add(w);
  }
  return scene;
}
const boundsOf = (o) => new THREE.Box3().setFromObject(o);

test('fitCar: diskalakan ke panjang spesifikasi, panjang searah z, pusat di nol, roda menyentuh tanah', () => {
  const { root } = fitCar(fakeCarScene(), { length: 4.55 });
  root.updateMatrixWorld(true);
  const b = boundsOf(root);
  const size = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 4.55) < 0.05, `panjang ${size.z}`);
  assert.ok(size.x < size.z, 'lebar lebih kecil dari panjang');
  assert.ok(Math.abs(c.x) < 0.05 && Math.abs(c.z) < 0.05, `pusat (${c.x}, ${c.z})`);
  assert.ok(Math.abs(b.min.y) < 0.01, `dasar y=${b.min.y}`);
});

test('fitCar: yaw membalik moncong (contoh menghadap +x berarti moncong di -z; yaw PI memindahkannya ke +z)', () => {
  const noseZ = (yaw) => {
    const scene = fakeCarScene();
    const { root } = fitCar(scene, { length: 4.55, yaw });
    root.updateMatrixWorld(true);
    return scene.getObjectByName('Nose').getWorldPosition(new THREE.Vector3()).z;
  };
  assert.ok(noseZ(0) < -1.5, 'tanpa yaw moncong di belakang (-z)');
  assert.ok(noseZ(Math.PI) > 1.5, 'yaw PI memindahkan moncong ke depan (+z)');
});

test('fitCar: empat roda dikenali, dua di depan, berputar dan membelok tanpa berpindah dari porosnya', () => {
  const scene = fakeCarScene();
  const { root, wheels } = fitCar(scene, { length: 4.55, yaw: Math.PI });
  assert.equal(wheels.length, 4);
  assert.equal(wheels.filter((w) => w.front).length, 2);
  root.updateMatrixWorld(true);
  const before = new Map(wheels.map((w) => [w, w.pivot.position.clone()]));
  for (const w of wheels) assert.ok(Math.abs(w.pivot.position.y - 0.37) < 0.02, 'poros setinggi jari-jari roda');
  for (const w of wheels) { w.pivot.rotation.x = 1.3; if (w.front) w.pivot.rotation.y = 0.4; }
  root.updateMatrixWorld(true);
  for (const w of wheels) {
    const mesh = w.pivot.children[0];
    const c = boundsOf(mesh).getCenter(new THREE.Vector3());
    assert.ok(c.distanceTo(before.get(w)) < 1e-6, 'pusat roda tetap di porosnya setelah berputar');
  }
});

test('fitCar: nama roda tidak dikenali atau tidak lengkap = mobil tetap tampil tanpa roda berputar', () => {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4.5), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.y = 0.6;
  scene.add(body);
  const lone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.7), new THREE.MeshStandardMaterial());
  lone.name = 'Wheel_FL';
  lone.position.set(0.9, 0.37, 1.3);
  scene.add(lone);
  const { wheels } = fitCar(scene, { length: 4.5 });
  assert.equal(wheels.length, 0, 'hanya satu sudut: tidak diputar');
  assert.throws(() => fitCar(new THREE.Group(), { length: 4.5 }), /kosong/);
});
