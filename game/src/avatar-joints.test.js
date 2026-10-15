import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBody } from './avatar-body.js';

// Setiap ruas harus menyentuh/menumpuk dengan tetangganya: tidak boleh ada bagian yang mengambang atau celah di sendi.
const find = (root, name, parent) => { let hit = null; (parent ?? root).traverse((o) => { if (!hit && o.name === name) hit = o; }); return hit; };
const box = (o) => new THREE.Box3().setFromObject(o);
const touches = (a, b, eps = 0) => box(a).expandByScalar(eps).intersectsBox(box(b));

test('sambungan tubuh tidak terputus (pose diam)', () => {
  const { root, arms, legs } = buildBody({ color: 0x8c2f39, skin: 0xe8bf99 });
  root.updateMatrixWorld(true);
  const torso = find(root, 'torso'); const pelvis = find(root, 'pelvis');
  assert.ok(touches(torso, pelvis), 'badan-panggul');
  for (const side of ['l', 'r']) {
    const arm = arms[side]; const leg = legs[side];
    const shoulder = find(arm, 'shoulder'); const upper = find(arm, 'upperArm'); const fore = find(arm, 'forearm'); const hand = find(arm, 'hand');
    assert.ok(touches(shoulder, torso), `bahu-badan (${side})`);
    assert.ok(touches(shoulder, upper), `bahu-lengan atas (${side})`);
    assert.ok(touches(upper, fore), `lengan atas-lengan bawah (${side})`);
    assert.ok(touches(fore, hand), `lengan bawah-tangan (${side})`);
    const thigh = find(leg.hip, 'thigh'); const shin = find(leg.hip, 'shin'); const foot = find(leg.hip, 'foot');
    assert.ok(touches(thigh, pelvis), `paha-panggul (${side})`);
    assert.ok(touches(thigh, shin), `paha-betis (${side})`);
    assert.ok(touches(shin, foot), `betis-sepatu (${side})`);
  }
});

test('sambungan tetap terjaga saat berjalan dan duduk', () => {
  const { root, legs } = buildBody({ color: 0x8c2f39, skin: 0xe8bf99 });
  for (const side of ['l', 'r']) { legs[side].hip.rotation.x = 1.5; legs[side].knee.rotation.x = -1.5; }
  root.updateMatrixWorld(true);
  for (const side of ['l', 'r']) assert.ok(touches(find(legs[side].hip, 'thigh'), find(legs[side].hip, 'shin')), `paha-betis duduk (${side})`);
});

test('tinggi tubuh: kaki di lantai, kepala di 1,67', () => {
  const { root } = buildBody({ color: 0x8c2f39, skin: 0xe8bf99 });
  root.updateMatrixWorld(true);
  const b = box(root);
  assert.ok(Math.abs(b.min.y) < 0.03 && Math.abs(b.max.y - 1.67) < 0.03);
});
