import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { applyPose, createAvatar } from './avatar.js';
import { applySwimPose } from './swim-pose.js';

const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const headPos = (g) => {
  g.updateMatrixWorld(true);
  return g.userData.headPivot.getWorldPosition(new THREE.Vector3());
};
const settle = (g, name, from = 0) => {
  let lift = 0;
  for (let i = 0; i < 40; i++) {
    applyPose(g, null, from + i / 30, 1 / 30);
    lift = applySwimPose(g, name, from + i / 30, 1 / 30);
  }
  return lift;
};

test('avatar: berenang tengkurap sejajar air, tegak saat mengayuh, telentang saat mengapung, lalu dilepas', () => {
  const g = createAvatar({ name: 'Uji' });
  new THREE.Scene().add(g);
  settle(g, 'renang');
  let h = headPos(g);
  assert.ok(Math.abs(h.y - 0.82) < 0.1 && h.z < -0.4, `tengkurap: kepala di depan sejajar panggul ${h.toArray()}`);
  settle(g, 'mengapung', 2);
  h = headPos(g);
  assert.ok(Math.abs(h.y - 0.82) < 0.1 && h.z > 0.4, `telentang: kepala di belakang ${h.toArray()}`);
  settle(g, 'tegak_air', 4);
  assert.ok(headPos(g).y > 1.3, 'tegak');
  assert.equal(settle(g, null, 6), 0);
  assert.equal(g.userData.pivot.rotation.x, 0);
  assert.equal(g.userData.pivot.position.y, 0);
  assert.equal(g.userData.swim.on, false);
});

test('tanpa gerak renang, avatar tidak disentuh sama sekali', () => {
  const g = createAvatar({ name: 'Uji' });
  const before = g.userData.pivot.rotation.x;
  assert.equal(applySwimPose(g, 'sujud', 1, 1 / 30), 0);
  assert.equal(applySwimPose(g, null, 1, 1 / 30), 0);
  assert.equal(g.userData.pivot.rotation.x, before);
});

test('sambungan: hotel-main.js dan multiplayer-view.js memakai modul renang', () => {
  const hotel = src('./hotel-main.js');
  for (const re of [/from '\.\/swim\.js'/, /from '\.\/swim-pose\.js'/, /from '\.\/swim-fx\.js'/, /stepSwimmer\(swim,/, /applySwimPose\(avatar,/, /toggleAction\(swim,/, /setPose\?\.\(swimPoseName\)/, /swimFx\.update\(delta\)/, /\$\('dive-button'\)/]) assert.match(hotel, re);
  const mv = src('./multiplayer-view.js');
  assert.match(mv, /applySwimPose\(group, swimName/);
  assert.match(mv, /pose: p\.pose \?\? null/);
  assert.match(readFileSync(new URL('../hotel.html', import.meta.url), 'utf8'), /id="dive-button"/);
});
