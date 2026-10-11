import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDamage,
  clampArenaPosition,
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