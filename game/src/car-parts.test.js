import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOpenings, getParts, partsFrom, setParts, tickOpenings, toggleOpening } from './car-parts.js';
import { applyParts, rigParts, signalLit } from './car-parts-rig.js';
import { createCarState } from './car-state.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const DEG = Math.PI / 180;
const IDLE = { doorL: false, doorR: false, roof: false, lights: false, hazard: false, indicator: 0, reverse: false };

const mat = (name) => new THREE.MeshStandardMaterial({ name });
const mesh = (name, material) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), material ?? mat(`${name}_m`));
  m.name = name;
  return m;
};

/** Mobil tiruan dengan nama node/bahan seperti di file Blender Chiron (pose tertutup). */
function fakeCar() {
  const root = new THREE.Group();
  const doorL = new THREE.Group();
  doorL.name = 'DOOR_L';
  doorL.position.set(0.47, 0.45, 0.46);
  doorL.add(mesh('DOOR_L_Cube006'));
  const doorR = new THREE.Group();
  doorR.name = 'DOOR_R';
  doorR.position.set(-0.47, 0.45, 0.46);
  doorR.add(mesh('DOOR_R_Cube006'));
  const roof = new THREE.Group();
  roof.name = 'ROOF';
  roof.position.set(0, 0.64, 0.03);
  roof.add(mesh('Cube.012'));
  const mats = {};
  for (const n of ['SIG_L_0', 'SIG_L_1', 'SIG_L_2', 'SIG_R_0', 'SIG_R_1', 'SIG_R_2', 'Headlight LED', 'Reverse Lamp']) mats[n] = mat(n);
  const lamps = new THREE.Group();
  for (const n of ['SIG_L_0', 'SIG_L_1', 'SIG_L_2', 'SIG_R_0', 'SIG_R_1', 'SIG_R_2']) {
    lamps.add(mesh(`SIG_front_${n}`, mats[n]), mesh(`SIG_rear_${n}`, mats[n])); // lensa depan dan belakang memakai bahan yang sama
  }
  lamps.add(mesh('HL_LED_L0', mats['Headlight LED']), mesh('REV_lamp_L', mats['Reverse Lamp']));
  root.add(doorL, doorR, roof, lamps);
  return { root, doorL, doorR, roof, mats };
}

test('rig mengenali pintu, atap, dan bahan lampu dari namanya (bahan bersama dihitung sekali)', () => {
  const { root, mats } = fakeCar();
  const rig = rigParts(root);
  assert.deepEqual(rig.doors.map((d) => d.side).sort(), [-1, 1]);
  assert.equal(rig.roofs.length, 1);
  assert.equal(rig.signals.length, 6);
  assert.equal(rig.heads.length, 1);
  assert.equal(rig.reverses.length, 1);
  assert.notEqual(mats['Headlight LED'].emissive.getHex(), 0, 'emissive hitam diberi warna cadangan');
  assert.equal(rigParts(new THREE.Group()).doors.length, 0, 'model tanpa bagian itu: rig kosong, tidak error');
});

test('nama mirip tidak ikut: INT_door_L, DOOR_L_Cube006, WHEEL, dan atap interior', () => {
  const root = new THREE.Group();
  for (const n of ['INT_door_L', 'DOOR_L_Cube006', 'LUX_door_upper_R', 'WHEEL_FL', 'IPAD_tile_roof', 'Roofline']) {
    const g = new THREE.Group();
    g.name = n;
    root.add(g);
  }
  const rig = rigParts(root);
  assert.equal(rig.doors.length, 0);
  assert.equal(rig.roofs.length, 0);
});

test('nama bersufiks hasil ekspor (DOOR_L001, ROOF001) tetap dikenali', () => {
  const root = new THREE.Group();
  for (const n of ['DOOR_L001', 'ROOF001']) {
    const g = new THREE.Group();
    g.name = n;
    root.add(g);
  }
  const rig = rigParts(root);
  assert.equal(rig.doors.length, 1);
  assert.equal(rig.roofs.length, 1);
});

test('pintu tertutup = pose berkas; terbuka = naik 68 derajat dan condong 28 derajat ke luar, kiri dan kanan berlawanan', () => {
  const { root, doorL, doorR } = fakeCar();
  const rig = rigParts(root);
  applyParts(rig, IDLE, 1, 0);
  near(doorL.quaternion.angleTo(new THREE.Quaternion()), 0);
  applyParts(rig, { ...IDLE, doorL: true }, 10, 0);
  const l = new THREE.Euler().setFromQuaternion(doorL.quaternion, 'ZXY');
  near(l.x, 68 * DEG, 1e-5);
  near(l.z, -28 * DEG, 1e-5);
  near(doorR.quaternion.angleTo(new THREE.Quaternion()), 0); // pintu kanan tidak ikut
  applyParts(rig, { ...IDLE, doorR: true }, 10, 0);
  const r = new THREE.Euler().setFromQuaternion(doorR.quaternion, 'ZXY');
  near(r.x, 68 * DEG, 1e-5);
  near(r.z, 28 * DEG, 1e-5);
  applyParts(rig, IDLE, 10, 0);
  near(doorL.quaternion.angleTo(new THREE.Quaternion()), 0);
});

test('pintu bergerak halus, bukan melompat', () => {
  const { root, doorL } = fakeCar();
  const rig = rigParts(root);
  applyParts(rig, { ...IDLE, doorL: true }, 0.1, 0);
  const a = doorL.quaternion.angleTo(new THREE.Quaternion());
  assert.ok(a > 0.05 && a < 1.0, `sebagian: ${a}`);
});

test('atap: naik dulu pada sepertiga pertama, lalu bergeser ke belakang (-z glTF); penuh = naik 0,085 dan mundur 0,42', () => {
  const { root, roof } = fakeCar();
  const rig = rigParts(root);
  applyParts(rig, { ...IDLE, roof: true }, 0.5, 0); // 0,4/detik x 0,5 = 0,2
  near(roof.position.y, 0.64 + 0.085 * 0.6);
  near(roof.position.z, 0.03, 1e-9);
  applyParts(rig, { ...IDLE, roof: true }, 10, 0);
  near(roof.position.y, 0.64 + 0.085);
  near(roof.position.z, 0.03 - 0.42);
  applyParts(rig, IDLE, 10, 0);
  near(roof.position.y, 0.64);
  near(roof.position.z, 0.03);
});

test('sein menyapu tiga lensa lalu padam, siklus 1 detik; sisi yang lain tidak ikut', () => {
  assert.deepEqual([0, 1, 2].map((i) => signalLit(i, 0)), [true, false, false]);
  assert.deepEqual([0, 1, 2].map((i) => signalLit(i, 0.2)), [true, true, false]);
  assert.deepEqual([0, 1, 2].map((i) => signalLit(i, 0.3)), [true, true, true]);
  assert.deepEqual([0, 1, 2].map((i) => signalLit(i, 0.75)), [false, false, false]);
  assert.deepEqual([0, 1, 2].map((i) => signalLit(i, 1.3)), [true, true, true], 'berulang tiap detik');
  const { root, mats } = fakeCar();
  const rig = rigParts(root);
  applyParts(rig, { ...IDLE, indicator: -1 }, 0.016, 0.3);
  assert.ok(mats.SIG_L_2.emissiveIntensity > 2);
  assert.ok(mats.SIG_R_2.emissiveIntensity < 1, 'sein kiri: sisi kanan tetap redup');
  applyParts(rig, { ...IDLE, indicator: -1 }, 0.016, 0.75);
  assert.ok(mats.SIG_L_0.emissiveIntensity < 1, 'fase padam');
  applyParts(rig, { ...IDLE, hazard: true }, 0.016, 0.3);
  assert.ok(mats.SIG_L_1.emissiveIntensity > 2 && mats.SIG_R_1.emissiveIntensity > 2, 'hazard: dua sisi');
});

test('lampu depan mengikuti tombol lampu, lampu mundur mengikuti gigi R', () => {
  const { root, mats } = fakeCar();
  const rig = rigParts(root);
  applyParts(rig, IDLE, 0.016, 0);
  assert.equal(mats['Headlight LED'].emissiveIntensity, 0);
  assert.equal(mats['Reverse Lamp'].emissiveIntensity, 0);
  applyParts(rig, { ...IDLE, lights: true, reverse: true }, 0.016, 0);
  assert.ok(mats['Headlight LED'].emissiveIntensity > 1);
  assert.ok(mats['Reverse Lamp'].emissiveIntensity > 1);
});

test('custom property Blender (userData) menimpa nilai bawaan', () => {
  const root = new THREE.Group();
  const d = new THREE.Group();
  d.name = 'DOOR_L';
  d.userData = { open_angle_deg: 40, lean_deg: 10, arah_lean: 1 };
  root.add(d);
  const rig = rigParts(root);
  applyParts(rig, { ...IDLE, doorL: true }, 10, 0);
  const e = new THREE.Euler().setFromQuaternion(d.quaternion, 'ZXY');
  near(e.x, 40 * DEG, 1e-5);
  near(e.z, -10 * DEG, 1e-5);
});

test('pintu dan atap: buka hanya saat berhenti, menutup sendiri saat melaju', () => {
  const o = createOpenings();
  assert.deepEqual(o, { doorL: false, doorR: false, roof: false });
  assert.equal(toggleOpening(o, 'doorL', 0).ok, true);
  assert.equal(o.doorL, true);
  assert.equal(toggleOpening(o, 'terbang', 0).ok, false);
  assert.equal(toggleOpening(o, 'roof', 3).ok, false, 'membuka saat melaju ditolak');
  assert.match(toggleOpening(o, 'roof', 3).msg, /Hentikan mobil/);
  assert.equal(o.roof, false);
  assert.equal(toggleOpening(o, 'doorL', 3).ok, true, 'menutup saat melaju boleh');
  assert.equal(o.doorL, false);
  toggleOpening(o, 'doorR', 0);
  toggleOpening(o, 'roof', 0);
  assert.equal(tickOpenings(o, 0.1), false);
  assert.equal(tickOpenings(o, 4), true);
  assert.deepEqual(o, { doorL: false, doorR: false, roof: false });
  assert.equal(tickOpenings(o, 4), false, 'tidak ada lagi yang ditutup');
});

test('partsFrom: lampu mundur hanya bila mesin menyala dan gigi R', () => {
  const s = createCarState();
  s.lights = true;
  s.hazard = true;
  s.indicator = -1;
  s.handbrake = true;
  s.gear = 'R';
  const o = createOpenings();
  o.roof = true;
  const p = partsFrom(s, o);
  assert.deepEqual([p.lights, p.hazard, p.indicator, p.handbrake, p.roof, p.reverse, p.engine], [true, true, -1, true, true, false, false]);
  s.eng = 'on';
  assert.equal(partsFrom(s, o).reverse, true);
  s.gear = 'D';
  assert.equal(partsFrom(s, o).reverse, false);
});

test('registry keadaan tampilan: pasang, baca, hapus', () => {
  const car = {};
  assert.equal(getParts(car), null);
  setParts(car, { lights: true });
  assert.equal(getParts(car).lights, true);
  setParts(car, null);
  assert.equal(getParts(car), null);
});
