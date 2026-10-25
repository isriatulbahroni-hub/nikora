import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AUTO_CLOSE_M, accessZone, anyOpen, closeDoorsAndTrunk, createAccess, doorOfSeat, findAccess, planAccess, seatForDoor, sideSeats, tickAccess, toggleAccess } from './car-access.js';
import { applyParts, rigParts, TRUNK_OPEN_DEG } from './car-parts-rig.js';
import { createVehicle } from './vehicle.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const DEG = Math.PI / 180;
// Sedan bawaan: panjang 4,3 m, lebar 1,82 m, kursi 0 = kanan depan (pengemudi), 1 = kiri depan, 2 = kanan belakang, 3 = kiri belakang.
// heading 0 = menghadap +z; kanan mobil = -x.
const car = (over = {}) => createVehicle({ id: 'c', x: 0, z: 0, heading: 0, ...over });
const AT_RIGHT = { x: -1.9, z: 0.4 };

test('zona: samping kanan, samping kiri, bagasi di belakang, dan di luar jangkauan', () => {
  const c = car();
  assert.equal(accessZone(c, AT_RIGHT)?.zone, 'doorR');
  assert.equal(accessZone(c, { x: 1.9, z: 0.4 })?.zone, 'doorL');
  assert.equal(accessZone(c, { x: 0, z: -3 })?.zone, 'trunk');
  assert.equal(accessZone(c, { x: 0, z: 3.5 }), null, 'depan mobil: bukan pintu dan bukan bagasi');
  assert.equal(accessZone(c, { x: -6, z: 0 }), null, 'terlalu jauh');
});

test('zona mengikuti arah mobil (heading PI/2: kanan mobil = +z)', () => {
  const c = car({ heading: Math.PI / 2 });
  assert.equal(accessZone(c, { x: 0.4, z: 1.9 })?.zone, 'doorR');
  assert.equal(accessZone(c, { x: 0.4, z: -1.9 })?.zone, 'doorL');
  assert.equal(accessZone(c, { x: -3, z: 0 })?.zone, 'trunk');
});

test('kursi per sisi dan pintu kursi', () => {
  const c = car();
  assert.deepEqual(sideSeats(c, 'doorR'), [0, 2]);
  assert.deepEqual(sideSeats(c, 'doorL'), [1, 3]);
  assert.equal(doorOfSeat(c, 0), 'doorR');
  assert.equal(doorOfSeat(c, 1), 'doorL');
  c.seats[0] = 'a';
  assert.equal(seatForDoor(c, 'doorR'), 2);
  c.seats[2] = 'b';
  assert.equal(seatForDoor(c, 'doorR'), -1);
});

test('pintu: buka dulu, baru Naik ke kursi kosong di sisi itu; sisi penuh = Tutup pintu', () => {
  const c = car();
  const o = createAccess();
  let p = planAccess(c, AT_RIGHT, o);
  assert.deepEqual([p.kind, p.label], ['open', 'Buka pintu kanan']);
  assert.equal(toggleAccess(o, p.key, 0).ok, true);
  p = planAccess(c, AT_RIGHT, o);
  assert.deepEqual([p.kind, p.label, p.seat], ['board', 'Naik', 0], 'pengemudi lebih dulu');
  c.seats[0] = 'a';
  assert.equal(planAccess(c, AT_RIGHT, o).seat, 2);
  c.seats[2] = 'b';
  p = planAccess(c, AT_RIGHT, o);
  assert.deepEqual([p.kind, p.label], ['close', 'Tutup pintu kanan']);
});

test('pintu kiri melayani kursi kiri', () => {
  const c = car();
  const o = createAccess();
  const left = { x: 1.9, z: 0.4 };
  assert.equal(planAccess(c, left, o).label, 'Buka pintu kiri');
  toggleAccess(o, 'doorL', 0);
  assert.equal(planAccess(c, left, o).seat, 1);
});

test('tanpa tombol: pintu tertutup dan kursi di sisi itu penuh, atau mobil sedang melaju', () => {
  const c = car();
  c.seats[0] = 'a';
  c.seats[2] = 'b';
  assert.equal(planAccess(c, AT_RIGHT, createAccess()), null);
  const m = car();
  m.speed = 3;
  assert.equal(planAccess(m, AT_RIGHT, createAccess()), null);
  assert.equal(planAccess(m, { x: 0, z: -3 }, createAccess()), null, 'bagasi mobil melaju juga tidak');
});

test('bagasi: Buka bagasi <-> Tutup bagasi', () => {
  const c = car();
  const o = createAccess();
  const behind = { x: 0, z: -3 };
  let p = planAccess(c, behind, o);
  assert.deepEqual([p.zone, p.kind, p.label], ['trunk', 'open', 'Buka bagasi']);
  assert.deepEqual(toggleAccess(o, 'trunk', 0), { ok: true, msg: 'Bagasi dibuka.' });
  p = planAccess(c, behind, o);
  assert.deepEqual([p.kind, p.label], ['close', 'Tutup bagasi']);
  assert.deepEqual(toggleAccess(o, 'trunk', 0), { ok: true, msg: 'Bagasi ditutup.' });
});

test('membuka saat melaju ditolak, semua menutup sendiri saat mobil melaju', () => {
  const o = createAccess();
  assert.equal(toggleAccess(o, 'trunk', 3).ok, false);
  assert.match(toggleAccess(o, 'trunk', 3).msg, /Hentikan mobil/);
  assert.equal(toggleAccess(o, 'doorL', 3).ok, false);
  toggleAccess(o, 'doorL', 0);
  toggleAccess(o, 'trunk', 0);
  assert.equal(anyOpen(o), true);
  assert.equal(tickAccess(o, 0.1), false);
  assert.equal(tickAccess(o, 4), true);
  assert.deepEqual(o, { doorL: false, doorR: false, roof: false, trunk: false });
  assert.equal(tickAccess(o, 4), false, 'tidak ada lagi yang ditutup');
  toggleAccess(o, 'trunk', 0);
  assert.equal(tickAccess(o, 4), true, 'bagasi saja pun menutup');
});

test('closeDoorsAndTrunk menutup pintu dan bagasi saja', () => {
  const o = createAccess();
  o.doorL = true;
  o.doorR = true;
  o.trunk = true;
  o.roof = true;
  closeDoorsAndTrunk(o);
  assert.deepEqual(o, { doorL: false, doorR: false, roof: true, trunk: false });
  assert.ok(AUTO_CLOSE_M > 3);
});

test('findAccess memilih mobil terdekat dan mengabaikan yang jauh', () => {
  const a = car({ id: 'a', x: 0, z: 0 });
  const b = car({ id: 'b', x: 10, z: 0 });
  const states = new Map();
  const accessOf = (v) => {
    if (!states.has(v)) states.set(v, createAccess());
    return states.get(v);
  };
  const hit = findAccess([a, b], { x: 8.1, z: 0.4 }, accessOf);
  assert.equal(hit.car, b);
  assert.equal(hit.plan.zone, 'doorR');
  assert.equal(findAccess([a, b], { x: 100, z: 100 }, accessOf), null);
});

test('rig: node TRUNK/BAGASI terbuka mengangkat sisi belakang, tertutup = pose berkas', () => {
  const root = new THREE.Group();
  const t = new THREE.Group();
  t.name = 'TRUNK';
  root.add(t);
  const rig = rigParts(root);
  assert.equal(rig.trunks.length, 1);
  const idle = { doorL: false, doorR: false, roof: false, trunk: false, lights: false, hazard: false, indicator: 0, reverse: false };
  applyParts(rig, idle, 1, 0);
  near(t.quaternion.angleTo(new THREE.Quaternion()), 0);
  applyParts(rig, { ...idle, trunk: true }, 0.1, 0);
  const part = t.quaternion.angleTo(new THREE.Quaternion());
  assert.ok(part > 0.05 && part < TRUNK_OPEN_DEG * DEG, 'bergerak halus, bukan melompat');
  applyParts(rig, { ...idle, trunk: true }, 10, 0);
  near(new THREE.Euler().setFromQuaternion(t.quaternion, 'XYZ').x, TRUNK_OPEN_DEG * DEG, 1e-5);
  applyParts(rig, idle, 10, 0);
  near(t.quaternion.angleTo(new THREE.Quaternion()), 0);
});

test('rig bagasi: nama Indonesia, sufiks ekspor, userData menimpa sudut; nama mirip tidak ikut', () => {
  const root = new THREE.Group();
  const b = new THREE.Group();
  b.name = 'BAGASI001';
  b.userData = { open_angle_deg: 30 };
  const other = new THREE.Group();
  other.name = 'Trunk_lid_mesh';
  root.add(b, other);
  const rig = rigParts(root);
  assert.equal(rig.trunks.length, 1);
  applyParts(rig, { doorL: false, doorR: false, roof: false, trunk: true, lights: false, hazard: false, indicator: 0, reverse: false }, 10, 0);
  near(new THREE.Euler().setFromQuaternion(b.quaternion, 'XYZ').x, 30 * DEG, 1e-5);
  assert.equal(rigParts(new THREE.Group()).trunks.length, 0, 'model tanpa bagasi: rig kosong, tidak error');
});
