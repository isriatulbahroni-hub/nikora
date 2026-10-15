import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPose, createAvatar } from './avatar.js';

const run = (g, act, { frames = 60, speed } = {}) => {
  for (let i = 0; i < frames; i += 1) applyPose(g, act, i / 60, 1 / 60, speed);
  return g.userData.arms.r.rotation.x;
};

test('forcedAct: stiker menggerakkan tangan avatar (lambai mengangkat lengan kanan)', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  g.userData.forcedAct = 'wave';
  assert.ok(run(g, null) > 1.5);
});

test('forcedAct: tanpa gestur paksa, avatar diam tetap diam', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  assert.ok(Math.abs(run(g, null)) < 0.3);
});

test('forcedAct: berjalan menang atas gestur paksa (act walk maupun laju nyata)', () => {
  const a = createAvatar({ color: 0x70c7a2 });
  a.userData.forcedAct = 'wave';
  assert.ok(run(a, 'walk') < 1.5);
  const b = createAvatar({ color: 0x70c7a2 });
  b.userData.forcedAct = 'wave';
  assert.ok(run(b, null, { speed: 3 }) < 1.5);
});

test('forcedAct: diabaikan saat avatar duduk', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  g.userData.seated = true;
  g.userData.forcedAct = 'wave';
  assert.ok(run(g, null) < 1.5);
});

test('createAvatar: wajah dikelompokkan dan punya titik pasang ekspresi', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  assert.ok(g.userData.face?.isGroup);
  const { y, z, size } = g.userData.faceAnchor;
  assert.ok(y > 1 && z < 0 && size > 0);
});
