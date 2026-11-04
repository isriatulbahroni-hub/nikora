import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildVillaParking } from './villa-parking-world.js';
import { guestOccupied, guestSlots, mulberry32 } from './villa-parking.js';

const source = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const instancedCount = (root) => {
  let n = 0;
  root.traverse((o) => { if (o.isInstancedMesh) n++; });
  return n;
};
/** Math.random yang bisa diulang (kejadian mobil datang/pergi memakainya) supaya tes tidak acak. */
const withSeededRandom = (seed, fn) => {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
};

test('parkir villa 3D: dibangun ke dalam induk (tanpa DOM), isinya InstancedMesh murah, dan dibuang bersih', () => {
  const parent = new THREE.Group();
  const parking = buildVillaParking(parent);
  assert.equal(parent.children.length, 1);
  assert.equal(parking.root.name, 'villa-parking');
  assert.equal(parking.stats.total, 300);
  assert.equal(parking.freeGuestSlots(), 300 - guestOccupied().size, 'sisa slot awal = 300 dikurangi yang terisi');
  const meshes = instancedCount(parking.root);
  assert.ok(meshes >= 10, `cukup banyak bagian ter-instancing (${meshes})`);
  assert.ok(meshes <= 60, `tetap sedikit draw call (${meshes})`);
  parking.dispose();
  assert.equal(parent.children.length, 0, 'akar parkir dilepas dari induk');
});

test('parkir villa 3D: sepuluh menit simulasi, mobil datang dan pergi tanpa galat, sisa slot tetap wajar dan berubah', () => {
  withSeededRandom(2026, () => {
    const parking = buildVillaParking(new THREE.Group());
    const first = parking.freeGuestSlots();
    let min = first;
    let max = first;
    for (let i = 0; i < 30 * 600; i++) {
      parking.update(1 / 30);
      const free = parking.freeGuestSlots();
      assert.ok(free >= 0 && free <= guestSlots().length, `sisa slot ${free} di luar 0..300`);
      min = Math.min(min, free);
      max = Math.max(max, free);
    }
    assert.ok(max > min, 'jumlah sisa slot berubah: ada mobil yang datang atau pergi');
    assert.ok(max - min <= 40, `perubahan wajar (${min}..${max})`);
    parking.dispose();
  });
});

test('parkir villa 3D: hasil tiap seed konsisten (tanpa kejadian saat delta nol)', () => {
  withSeededRandom(7, () => {
    const parking = buildVillaParking(new THREE.Group());
    const before = parking.freeGuestSlots();
    for (let i = 0; i < 100; i++) parking.update(0);
    assert.equal(parking.freeGuestSlots(), before);
    parking.dispose();
  });
});

test('parkir villa: villa-world.js memasang parkir 3D, memanggil update tiap bingkai, dan semak menghindari lahan parkir', () => {
  const world = source('villa-world.js');
  assert.match(world, /import \{ buildVillaParking \} from '\.\/villa-parking-world\.js';/);
  assert.match(world, /import \{ inParkingKeepOut \} from '\.\/villa-parking\.js';/);
  // parkir bisa dimatikan lewat { parking: false } (dunia hotel memakai halaman depan sendiri, lihat hotel-villa.js)
  assert.match(world, /const parking = withParking \? buildVillaParking\(root\) : null;/);
  assert.match(world, /parking\?\.update\(delta\);/);
  assert.match(world, /if \(!inParkingKeepOut\(bush\.x, bush\.z, 1\.5\)\) bushes\.push\(bush\);/);
});

test('parkir villa: dunia hotel mematikan parkir luas villa (parking: false), villa mandiri tetap memasangnya', () => {
  assert.match(source('hotel-villa.js'), /buildVillaWorld\(staging, noTrees, \{ parking: false \}\)/);
  assert.match(source('villa-world.js'), /parking: withParking = true/);
});

test('parkir villa: villa-layout.js menolak pohon di lahan parkir; modul 3D hanya bergantung pada three dan villa-parking.js', () => {
  assert.match(source('villa-layout.js'), /if \(inParkingKeepOut\(x, z, 3\)\) continue;/);
  const imports = [...source('villa-parking-world.js').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['./villa-parking.js', 'three']);
});
