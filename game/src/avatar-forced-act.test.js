import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPose, createAvatar } from './avatar.js';

const run = (g, act, frames = 60) => {
  for (let i = 0; i < frames; i += 1) applyPose(g, act, i / 60, 1 / 60);
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

test('forcedAct: berjalan menang atas gestur paksa', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  g.userData.forcedAct = 'wave';
  assert.ok(run(g, 'walk') < 1.0);
});

test('forcedAct: diabaikan saat avatar duduk', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  g.position.y = -0.5;
  g.userData.forcedAct = 'wave';
  assert.ok(run(g, null) < 0.5);
});
