import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAR_MODELS, MODEL_IDS } from './car-models.js';
import { bakeDoors, buildLuxuryCar, splitTub } from './luxury-cars.js';
import { loftGeometry } from './car-loft.js';
import { bodyTilt, steerFromYaw } from './vehicle-view.js';

const bounds = (c) => {
  const b = new THREE.Box3();
  for (const k of ['paint', 'trim', 'glass']) { c[k].computeBoundingBox(); b.union(c[k].boundingBox); }
  return b;
};
const tris = (g) => g.attributes.position.count / 3;

for (const id of MODEL_IDS) {
  test(`${id}: ukuran geometri sesuai spesifikasi, tanpa NaN, anggaran poligon`, () => {
    const m = CAR_MODELS[id];
    const c = buildLuxuryCar(id);
    const b = bounds(c);
    assert.ok(Math.abs(b.max.z - b.min.z - m.length) < 0.25, `panjang ${b.max.z - b.min.z}`);
    assert.ok(b.max.x - b.min.x < m.width + 0.4 && b.max.x - b.min.x > m.width - 0.2, 'lebar');
    assert.ok(b.max.y > m.height - 0.1 && b.max.y < m.height + 0.25, `tinggi ${b.max.y} (sayap/antena boleh sedikit lebih tinggi)`);
    for (const k of ['paint', 'trim', 'glass', 'head', 'tail', 'rev', 'wheel']) {
      const a = c[k].attributes.position.array;
      assert.ok(a.every(Number.isFinite), `${k} tanpa NaN`);
      assert.ok(c[k].attributes.color && c[k].attributes.normal, `${k} punya warna dan normal`);
    }
    const total = ['paint', 'trim', 'glass', 'head', 'tail', 'rev'].reduce((s, k) => s + tris(c[k]), 0) + 4 * tris(c.wheel);
    assert.ok(total < 14000, `${id}: ${total} segitiga per mobil (anggaran HP)`);
  });

  test(`${id}: 4 roda di sumbu benar, pintu per kursi, jangkar pelat`, () => {
    const m = CAR_MODELS[id];
    const c = buildLuxuryCar(id);
    assert.equal(c.wheels.length, 4);
    assert.equal(c.wheels.filter((w) => w.front).length, 2);
    for (const w of c.wheels) assert.ok(Math.abs(w.y - m.wheelRadius) < 1e-9, 'roda menyentuh tanah');
    const f = c.wheels.find((w) => w.front);
    const r = c.wheels.find((w) => !w.front);
    assert.ok(Math.abs(f.z - r.z - m.wheelBase) < 0.12, `jarak sumbu roda ${f.z - r.z} vs ${m.wheelBase}`);
    const covered = new Set(c.doorSpecs.flatMap((d) => d.seats));
    for (let s = 0; s < m.seats.length; s++) assert.ok(covered.has(s), `kursi ${s} punya pintu`);
    assert.equal(c.plates.length, 2);
  });

  test(`${id}: pintu memakai cat mobil (dibakar) dan sisi sesuai kursi`, () => {
    const m = CAR_MODELS[id];
    const c = buildLuxuryCar(id);
    const red = bakeDoors(m, c.doorSpecs, 0xff0000)[0].geometry.attributes.color;
    const blue = bakeDoors(m, c.doorSpecs, 0x0000ff)[0].geometry.attributes.color;
    assert.notDeepEqual(Array.from(red.array.slice(0, 3)), Array.from(blue.array.slice(0, 3)));
    for (const d of c.doors) {
      const seat = m.seats[d.seats[0]];
      assert.equal(Math.sign(d.pivot.x), Math.sign(-seat.side), 'pintu di sisi kursinya (kanan mobil = -x)');
    }
  });
}

test('loft: normal menghadap keluar dan tutup ujung; stasiun kurang dari dua ditolak', () => {
  const g = loftGeometry([{ z: -1, hw: 1, y0: 0, y1: 1 }, { z: 1, hw: 1, y0: 0, y1: 1 }], { segments: 16 });
  const p = g.attributes.position;
  const n = g.attributes.normal;
  let bad = 0;
  for (let i = 0; i < 32; i++) {
    const x = p.getX(i);
    const y = p.getY(i) - 0.5;
    if (n.getX(i) * x + n.getY(i) * y < 0) bad++;
  }
  assert.equal(bad, 0);
  assert.throws(() => loftGeometry([{ z: 0, hw: 1, y0: 0, y1: 1 }]));
  const open = loftGeometry([{ z: -1, hw: 1, y0: 0, y1: 1 }, { z: 1, hw: 1, y0: 0, y1: 1 }], { arc: [Math.PI * 0.6, Math.PI * 2.4], segments: 8 });
  assert.equal(open.index.count / 3, 16, 'penampang terbuka: tanpa tutup ujung');
});

test('splitTub: tiga bagian tersambung di z yang sama', () => {
  const tub = [{ z: -2, hw: 1, y0: 0, y1: 1 }, { z: 0, hw: 1, y0: 0, y1: 1 }, { z: 2, hw: 1, y0: 0, y1: 1 }];
  const s = splitTub(tub, -1, 1);
  assert.equal(s.rear.at(-1).z, -1);
  assert.equal(s.mid[0].z, -1);
  assert.equal(s.mid.at(-1).z, 1);
  assert.equal(s.front[0].z, 1);
});

test('animasi: setir roda dari laju yaw, kemiringan badan (menunduk saat mengerem, miring saat menikung)', () => {
  assert.equal(steerFromYaw(1, 0.1, 3), 0);
  assert.ok(steerFromYaw(0.4, 10, 3) > 0 && steerFromYaw(-0.4, 10, 3) < 0);
  assert.ok(steerFromYaw(5, 2, 3, 0.5) <= 0.5);
  assert.ok(bodyTilt(-12, 0).pitch > 0, 'mengerem: hidung turun');
  assert.ok(bodyTilt(8, 0).pitch < 0, 'gas: belakang turun');
  assert.ok(bodyTilt(0, 5).roll > 0);
});
