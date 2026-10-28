import test from 'node:test';
import assert from 'node:assert/strict';
import { CRASH_COOLDOWN, CRASH_MIN_HIT, crashDuration, createCrashHaptics } from './haptics.js';

test('benturan lemah tidak bergetar', () => {
  assert.equal(crashDuration(0), 0);
  assert.equal(crashDuration(CRASH_MIN_HIT), 0);
  assert.equal(crashDuration(NaN), 0);
});

test('makin keras makin lama, dibatasi 35..260 ms', () => {
  const a = crashDuration(8);
  const b = crashDuration(15);
  assert.ok(a >= 35 && b > a);
  assert.equal(crashDuration(500), 260);
});

test('jeda: tabrakan beruntun tidak memicu getar berulang', () => {
  const calls = [];
  const buzz = createCrashHaptics({ vibrate: (ms) => calls.push(ms) });
  assert.ok(buzz(12, 10) > 0);
  assert.equal(buzz(12, 10 + CRASH_COOLDOWN / 2), 0);
  assert.ok(buzz(12, 10 + CRASH_COOLDOWN + 0.01) > 0);
  assert.equal(calls.length, 2);
});

test('tanpa navigator.vibrate atau vibrate melempar galat: aman', () => {
  assert.doesNotThrow(() => createCrashHaptics({ vibrate: undefined })(12, 1));
  assert.doesNotThrow(() => createCrashHaptics({ vibrate: () => { throw new Error('x'); } })(12, 1));
});
