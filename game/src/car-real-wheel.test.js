import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLB_MODELS } from './car-models.js';
import { alignSpecToWheel, cockpitSpec, seatsForWheel } from './cockpit.js';
import { Fleet, carSitId } from './vehicle-fleet.js';
import { exitPose, seatWorld, specOf } from './vehicle.js';
import { fitCar } from './car-glb.js';

// Setir asli model GLB menentukan kursi pengemudi: avatar duduk tepat di belakang setir itu (bukan di titik tetap katalog), dan setir tidak dobel.

const boundsOf = (o) => new THREE.Box3().setFromObject(o);

function sceneWithWheel(name = 'Steering_Wheel', at = [0.4, 0.85, 0.6]) {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.5), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.y = 0.6;
  scene.add(body);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), new THREE.MeshStandardMaterial());
  wheel.name = name;
  wheel.position.set(...at);
  scene.add(wheel);
  return scene;
}

test('seatsForWheel: setir di kiri mobil (x +) memindahkan kursi pengemudi ke kiri dan tepat di belakang setir', () => {
  const seats = seatsForWheel(GLB_MODELS.bugatti.seats, { x: 0.4, z: 0.55 }, 2.04);
  assert.ok(Math.abs(seats[0].side + 0.4) < 1e-9, 'x + = kiri, side + = kanan: pengemudi di sisi kiri (side negatif)');
  assert.ok(Math.abs(seats[0].fwd - (0.55 - 0.62)) < 1e-9, 'kursi 0,62 m di belakang setir');
  assert.ok(Math.abs(seats[1].side - 0.4) < 1e-9, 'penumpang di seberang');
  assert.equal(seats[1].fwd, seats[0].fwd);
});

test('seatsForWheel: setir di kanan tetap di kanan; setir di tengah atau tidak valid = null (pakai kursi katalog)', () => {
  const right = seatsForWheel(GLB_MODELS.nikora.seats, { x: -0.45, z: 0.6 }, 2.04);
  assert.ok(right[0].side > 0, 'setir kanan: pengemudi di kanan');
  assert.equal(seatsForWheel(GLB_MODELS.nikora.seats, { x: 0.05, z: 0.6 }, 2.04), null);
  assert.equal(seatsForWheel(GLB_MODELS.nikora.seats, { x: 1.5, z: 0.6 }, 2.04), null);
  assert.equal(seatsForWheel(GLB_MODELS.nikora.seats, { x: Number.NaN, z: 0.6 }, 2.04), null);
  assert.equal(seatsForWheel(GLB_MODELS.nikora.seats, null), null);
});

test('alignSpecToWheel: hanya spesifikasi mobil itu yang berubah, katalog tidak; kokpit dan setir ikut sisi setir asli', () => {
  const spec = specOf('bugatti');
  const catalogSeats = GLB_MODELS.bugatti.seats;
  const before = cockpitSpec(spec);
  assert.ok(before.eye.x < 0, 'katalog: pengemudi di kanan');
  assert.ok(alignSpecToWheel(spec, { center: { x: 0.4, y: 0.88, z: 0.55 }, radius: 0.19, tilt: -0.4 }));
  assert.equal(GLB_MODELS.bugatti.seats, catalogSeats, 'entri katalog tidak diubah');
  assert.ok(catalogSeats[0].side > 0, 'katalog tetap setir kanan');
  const after = cockpitSpec(spec);
  assert.ok(Math.abs(after.wheel.x - 0.4) < 1e-9 && Math.abs(after.wheel.z - 0.55) < 1e-9, 'setir kokpit tepat di setir asli');
  assert.equal(after.wheel.y, 0.88);
  assert.equal(after.wheel.r, 0.19);
  assert.equal(after.wheel.tilt, -0.4);
  assert.ok(after.eye.x > 0 && Math.abs(after.eye.x - 0.4) < 1e-9, 'mata pengemudi di belakang setir');
  assert.ok(after.eye.y >= after.wheel.y + 0.14 - 1e-9, 'mata di atas setir');
  assert.equal(alignSpecToWheel(specOf('bugatti'), { center: { x: 0, y: 0.9, z: 0.5 }, radius: 0.19, tilt: 0 }), false, 'setir di tengah: tidak diubah');
});

test('armada: sesudah diselaraskan, avatar pengemudi duduk di belakang setir asli dan turun lewat pintu sisi itu', () => {
  const fleet = new Fleet({ specs: [{ id: 'c', x: 0, z: 0, heading: 0, model: 'bugatti' }], selfId: 'ani' });
  const car = fleet.cars[0];
  assert.ok(alignSpecToWheel(car.spec, { center: { x: 0.4, y: 0.88, z: 0.55 }, radius: 0.19, tilt: -0.4 }));
  const p = fleet.seatPose(carSitId(0, 0));
  // heading 0: depan = +z, kiri mobil = +x
  assert.ok(Math.abs(p.x - 0.4) < 1e-9, `avatar di sisi kiri tempat setir: x=${p.x}`);
  assert.ok(Math.abs(p.z - (0.55 - 0.62)) < 1e-9, `0,62 m di belakang setir: z=${p.z}`);
  assert.ok(Math.abs(seatWorld(car, 0).x - 0.4) < 1e-9);
  assert.ok(exitPose(car, 0).x > 0.4, 'turun ke sisi kiri (sisi pintu pengemudi)');
  const q = fleet.seatPose(carSitId(0, 1));
  assert.ok(Math.abs(q.x + 0.4) < 1e-9, 'penumpang di kanan');
});

test('fitCar: setir asli dikenali dari nama, posisinya dilaporkan, dan berputar pada porosnya tanpa berpindah', () => {
  const scene = sceneWithWheel();
  const { steering, root } = fitCar(scene, { length: 4.5 });
  assert.ok(steering, 'setir asli ditemukan');
  assert.deepEqual(steering.names, ['Steering_Wheel']);
  assert.ok(Math.abs(steering.center.x - 0.4) < 0.02 && Math.abs(steering.center.y - 0.85) < 0.02 && Math.abs(steering.center.z - 0.6) < 0.02, `pusat (${steering.center.x}, ${steering.center.y}, ${steering.center.z})`);
  assert.ok(Math.abs(steering.radius - 0.2) < 0.02, `jari-jari ${steering.radius}`);
  assert.ok(steering.tilt <= 0 && steering.tilt >= -0.8);
  root.updateMatrixWorld(true);
  const mesh = root.getObjectByName('Steering_Wheel'); // sudah dipindah ke poros putar di bawah root, bukan lagi anak `scene`
  assert.ok(mesh, 'setir ada di bawah poros putar');
  assert.equal(mesh.parent, steering.spin, 'setir dipasang pada poros putar');
  const c0 = boundsOf(mesh).getCenter(new THREE.Vector3());
  steering.spin.rotation.z = 1.2;
  root.updateMatrixWorld(true);
  const c1 = boundsOf(mesh).getCenter(new THREE.Vector3());
  assert.ok(c0.distanceTo(c1) < 1e-3, 'pusat setir tetap di porosnya saat berputar');
});

test('fitCar: tanpa setir bernama, atau yang bukan seukuran/di kabin, = steering null (setir buatan kode dipakai)', () => {
  assert.equal(fitCar(sceneWithWheel('Interior_Part'), { length: 4.5 }).steering, null, 'nama tidak dikenali');
  assert.equal(fitCar(sceneWithWheel('Steering_Wheel', [0, 0.85, 0.6]), { length: 4.5 }).steering, null, 'di tengah, bukan di depan pengemudi');
  assert.equal(fitCar(sceneWithWheel('Steering_Wheel', [0.4, 0.1, 0.6]), { length: 4.5 }).steering, null, 'terlalu rendah untuk roda setir');
  assert.equal(fitCar(sceneWithWheel('Steering_Column', [0.4, 0.85, 0.6]), { length: 4.5 }).steering, null, 'kolom setir tidak ikut berputar');
});
