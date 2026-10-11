import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDamage,
  clampArenaPosition,
  getDashDirection,
  getMatchOutcome,
  isAttackReady,
  normalizeMovement,
} from './game-rules.js';

test('normalizes diagonal movement so it is not faster', () => {
  const movement = normalizeMovement(1, 1);
  assert.ok(Math.abs(Math.hypot(movement.x, movement.z) - 1) < 1e-10);
});

test('keeps movement inside arena bounds', () => {
  assert.deepEqual(clampArenaPosition({ x: 99, z: -99 }, 10), { x: 10, z: -10 });
});

test('clamps damage at zero and ignores negative damage', () => {
  assert.equal(applyDamage(10, 25), 0);
  assert.equal(applyDamage(10, -8), 10);
});

test('recognizes victory, defeat, draw, and active matches', () => {
  assert.equal(getMatchOutcome(100, 1), 'playing');
  assert.equal(getMatchOutcome(70, 0), 'victory');
  assert.equal(getMatchOutcome(0, 70), 'defeat');
  assert.equal(getMatchOutcome(0, 0), 'draw');
});

test('enforces attack cooldown timing', () => {
  assert.equal(isAttackReady(4.9, 5), false);
  assert.equal(isAttackReady(5, 5), true);
});

test('applyDamage handles invalid and out-of-range health safely', () => {
  assert.equal(applyDamage(NaN, 10), 0);
  assert.equal(applyDamage(500, 10), 90);
  assert.equal(applyDamage(50, Infinity), 50);
  assert.equal(applyDamage(0, 25), 0);
});

test('clampArenaPosition keeps extreme positions inside the arena', () => {
  const limit = 10.5;
  assert.deepEqual(clampArenaPosition({ x: 1e9, z: -1e9 }), { x: limit, z: -limit });
});

test('dash uses movement first, then facing, then a safe default', () => {
  assert.deepEqual(getDashDirection({ x: 2, z: 0 }, { x: 0, z: 1 }), { x: 1, z: 0 });
  assert.deepEqual(getDashDirection({ x: 0, z: 0 }, { x: 0, z: 3 }), { x: 0, z: 1 });
  assert.deepEqual(getDashDirection({ x: 0, z: 0 }, { x: 0, z: 0 }), { x: 0, z: -1 });
});
