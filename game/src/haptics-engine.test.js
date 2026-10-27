import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_GAP_IDLE, ENGINE_GAP_REDLINE, SHIFT_COOLDOWN, SHIFT_MS, createEngineHaptics, engineBeat, engineHapticsEnabled } from './haptics.js';

test('engineBeat: makin tinggi RPM makin rapat dan makin kuat, nilai di luar 0..1 dijepit', () => {
  const idle = engineBeat(0);
  const red = engineBeat(1);
  assert.equal(idle.gap, ENGINE_GAP_IDLE);
  assert.ok(Math.abs(red.gap - ENGINE_GAP_REDLINE) < 1e-9);
  assert.ok(red.ms > idle.ms);
  assert.deepEqual(engineBeat(-3), idle);
  assert.deepEqual(engineBeat(9), red);
  assert.deepEqual(engineBeat(NaN), idle);
});

test('engineHapticsEnabled: ?getar=0 dan "kurangi gerakan" mematikannya', () => {
  assert.equal(engineHapticsEnabled(''), true);
  assert.equal(engineHapticsEnabled('?getar=0'), false);
  assert.equal(engineHapticsEnabled('?getar=1'), true);
  assert.equal(engineHapticsEnabled('', true), false);
});

test('mesin mati: tidak bergetar', () => {
  const calls = [];
  const buzz = createEngineHaptics({ vibrate: (ms) => calls.push(ms) });
  assert.equal(buzz(0, { on: false, rpmFrac: 0.5, gear: '1' }), 0);
  assert.equal(calls.length, 0);
});

test('mesin menyala: denyut mengikuti jeda RPM', () => {
  const calls = [];
  const buzz = createEngineHaptics({ vibrate: (ms) => calls.push(ms) });
  assert.ok(buzz(0, { on: true, rpmFrac: 0, gear: 'N' }) > 0);
  assert.equal(buzz(ENGINE_GAP_IDLE / 2, { on: true, rpmFrac: 0, gear: 'N' }), 0); // belum waktunya
  assert.ok(buzz(ENGINE_GAP_IDLE + 0.01, { on: true, rpmFrac: 0, gear: 'N' }) > 0);
  assert.equal(calls.length, 2);
});

test('pindah gigi maju memberi sentakan, dengan jeda', () => {
  const buzz = createEngineHaptics({ vibrate: () => {} });
  buzz(0, { on: true, rpmFrac: 0.5, gear: '1' });
  assert.equal(buzz(0.05, { on: true, rpmFrac: 0.5, gear: '2' }), SHIFT_MS);
  assert.notEqual(buzz(0.05 + SHIFT_COOLDOWN / 2, { on: true, rpmFrac: 0.5, gear: '3' }), SHIFT_MS); // masih dalam jeda
});

test('N dan R bukan pindah gigi maju: tidak ada sentakan', () => {
  const buzz = createEngineHaptics({ vibrate: () => {} });
  buzz(0, { on: true, rpmFrac: 0.2, gear: 'N' });
  assert.notEqual(buzz(1, { on: true, rpmFrac: 0.2, gear: '1' }), SHIFT_MS); // N -> 1
  assert.notEqual(buzz(2, { on: true, rpmFrac: 0.2, gear: 'R' }), SHIFT_MS); // 1 -> R
});

test('dimatikan (enabled: false): tidak pernah bergetar', () => {
  const calls = [];
  const buzz = createEngineHaptics({ vibrate: (ms) => calls.push(ms), enabled: false });
  assert.equal(buzz(0, { on: true, rpmFrac: 1, gear: '1' }), 0);
  assert.equal(calls.length, 0);
});

test('tanpa navigator.vibrate atau vibrate melempar galat: aman', () => {
  assert.doesNotThrow(() => createEngineHaptics({ vibrate: undefined })(0, { on: true }));
  assert.doesNotThrow(() => createEngineHaptics({ vibrate: () => { throw new Error('x'); } })(0, { on: true }));
});
