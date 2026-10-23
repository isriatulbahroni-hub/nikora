import test from 'node:test';
import assert from 'node:assert/strict';
import { GLB_CARS, SHARE_ALIKE_FILES, fitToSpec, glbCreditId, glbUrl } from './glb-car-catalog.js';
import { MODEL_IDS } from './car-models.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Titik model asli -> dunia, memakai hasil fitToSpec (urutan: skala, putar y, geser). */
function toWorld(fit, p) {
  const c = Math.cos(fit.rotY);
  const s = Math.sin(fit.rotY);
  const x = fit.scale * p.x;
  const y = fit.scale * p.y;
  const z = fit.scale * p.z;
  return { x: fit.position.x + x * c + z * s, y: fit.position.y + y, z: fit.position.z - x * s + z * c };
}

test('tiap model mobil nikora punya GLB, dan berkasnya berakhiran .glb', () => {
  for (const id of MODEL_IDS) {
    assert.ok(GLB_CARS[id], `model ${id} belum dipetakan`);
    assert.match(GLB_CARS[id].file, /^[a-z0-9-]+\.glb$/);
  }
});

test('model CC BY-SA tidak dipakai', () => {
  for (const e of Object.values(GLB_CARS)) assert.ok(!SHARE_ALIKE_FILES.includes(e.file), e.file);
});

test('glbUrl dan glbCreditId', () => {
  assert.equal(glbUrl('royale'), '/cars/rolls-royce-phantom.glb');
  assert.equal(glbUrl('royale', '/cars/'), '/cars/rolls-royce-phantom.glb');
  assert.equal(glbUrl('royale', 'https://cdn.contoh.id/mobil'), 'https://cdn.contoh.id/mobil/rolls-royce-phantom.glb');
  assert.equal(glbUrl('tidak-ada'), null);
  assert.equal(glbCreditId('argent'), 'ferrari-laferrari');
  assert.equal(glbCreditId('tidak-ada'), null);
});

test('fitToSpec: panjang di sumbu z, pusat dan alas dinormalkan', () => {
  const min = { x: -1, y: 0.2, z: -3 };
  const max = { x: 1, y: 1.6, z: 2 };
  const fit = fitToSpec(min, max, 5.55);
  near(fit.scale, 1.11);
  near(fit.rotY, 0);
  near(toWorld(fit, { x: 0, y: 0.2, z: -0.5 }).z, 0); // pusat ke z = 0
  near(toWorld(fit, { x: 0, y: 0.2, z: -0.5 }).y, 0); // alas ke y = 0
  near(toWorld(fit, max).z - toWorld(fit, { ...min, z: -3 }).z, 5.55); // panjang = spec.length
  assert.ok(toWorld(fit, max).z > toWorld(fit, min).z); // +z tetap depan
});

test('fitToSpec: panjang di sumbu x diputar supaya +x menjadi depan (+z)', () => {
  const min = { x: -2.5, y: 0, z: -1 };
  const max = { x: 2.5, y: 1.4, z: 1 };
  const fit = fitToSpec(min, max, 5);
  near(fit.scale, 1);
  near(fit.rotY, -Math.PI / 2);
  const front = toWorld(fit, { x: 2.5, y: 0, z: 0 });
  const rear = toWorld(fit, { x: -2.5, y: 0, z: 0 });
  near(front.z, 2.5);
  near(rear.z, -2.5);
  near(front.x, 0);
});

test('fitToSpec: flip membalik arah depan', () => {
  const min = { x: -1, y: 0, z: -2.5 };
  const max = { x: 1, y: 1.4, z: 2.5 };
  const fit = fitToSpec(min, max, 5, { flip: true });
  near(Math.abs(fit.rotY), Math.PI);
  assert.ok(toWorld(fit, { x: 0, y: 0, z: 2.5 }).z < 0);
  const fitX = fitToSpec({ x: -2.5, y: 0, z: -1 }, { x: 2.5, y: 1, z: 1 }, 5, { flip: true });
  near(fitX.rotY, Math.PI / 2);
  assert.ok(toWorld(fitX, { x: 2.5, y: 0, z: 0 }).z < 0);
});

test('fitToSpec: kotak kosong atau panjang tidak valid mengembalikan null', () => {
  assert.equal(fitToSpec({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5), null);
  assert.equal(fitToSpec({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 3 }, 0), null);
});
