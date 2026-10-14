import test from 'node:test';
import assert from 'node:assert/strict';
import { MIRROR, classifyTilt, createMirrorMachine, requestSensorPermission, rollFrom, sensorAvailable, startMirror } from './motion-mirror.js';

test('classifyTilt: zona netral, sedang kiri/kanan, dan sangat miring', () => {
  assert.equal(classifyTilt(0), null);
  assert.equal(classifyTilt(MIRROR.enter - 1), null);
  assert.equal(classifyTilt(MIRROR.enter), 'wave');
  assert.equal(classifyTilt(-MIRROR.enter), 'bow');
  assert.equal(classifyTilt(MIRROR.hard), 'spin');
  assert.equal(classifyTilt(-MIRROR.hard - 5), 'spin');
  assert.equal(classifyTilt(NaN), null);
});

test('rollFrom: portrait memakai gamma, landscape memakai beta dengan tanda berbeda', () => {
  assert.equal(rollFrom({ gamma: 30, beta: 5 }, 0), 30);
  assert.equal(rollFrom({ gamma: 30, beta: 12 }, 90), -12);
  assert.equal(rollFrom({ gamma: 30, beta: 12 }, 270), 12);
  assert.equal(rollFrom({}, 0), 0);
});

test('mesin: baseline dari sampel pertama, gestur hanya setelah ditahan, lalu jeda dan harus netral dulu', () => {
  const m = createMirrorMachine();
  assert.equal(m.feed(10, 0), null); // baseline = 10
  assert.equal(m.feed(40, 100), null); // masuk zona wave (delta 30)
  assert.equal(m.feed(40, 200), null); // belum cukup lama
  assert.equal(m.feed(40, 100 + MIRROR.holdMs), 'wave');
  assert.equal(m.feed(40, 900), null); // jeda
  assert.equal(m.feed(10, 1000), null); // kembali netral
  assert.equal(m.feed(-20, 1100), null); // zona bow
  assert.equal(m.feed(-20, 1100 + MIRROR.holdMs), null, 'masih jeda cooldown');
  assert.equal(m.feed(-20, 2730), 'bow', 'tilt yang ditahan sampai jeda habis memicu satu kali');
  assert.equal(m.feed(-20, 2730 + MIRROR.cooldownMs + 500), null, 'menahan miring tidak memicu berulang');
  assert.equal(m.feed(10, 9000), null);
  assert.equal(m.feed(-20, 9100), null);
  assert.equal(m.feed(-20, 9100 + MIRROR.holdMs), 'bow', 'setelah kembali netral bisa memicu lagi');
});

test('mesin: miring sebentar (kurang dari waktu tahan) tidak memicu; guncangan mendadak diabaikan', () => {
  const m = createMirrorMachine();
  m.feed(0, 0);
  assert.equal(m.feed(30, 50), null);
  assert.equal(m.feed(0, 100), null); // kembali sebelum cukup lama
  assert.equal(m.feed(0, 5000), null);
  assert.equal(m.feed(160, 5100), null, 'lonjakan 160 derajat dianggap guncangan');
  assert.equal(m.feed(NaN, 5200), null);
  assert.equal(m.feed(30, NaN), null);
});

test('mesin: sangat miring menghasilkan spin, dan pergantian zona mengulang penahanan', () => {
  const m = createMirrorMachine();
  m.feed(0, 0);
  m.feed(30, 100); // wave
  assert.equal(m.feed(65, 300), null); // pindah ke spin: hitung ulang
  assert.equal(m.feed(65, 300 + MIRROR.holdMs), 'spin');
});

test('sensor: tidak tersedia di desktop, izin iOS ditolak/diberikan, startMirror memicu dan bisa dilepas', async () => {
  assert.equal(sensorAvailable({}), false);
  assert.equal(await requestSensorPermission({}), false);
  const ios = (result) => ({ DeviceOrientationEvent: { requestPermission: async () => result } });
  assert.equal(await requestSensorPermission(ios('granted')), true);
  assert.equal(await requestSensorPermission(ios('denied')), false);
  assert.equal(await requestSensorPermission({ DeviceOrientationEvent: { requestPermission: async () => { throw new Error('x'); } } }), false);
  assert.equal(await requestSensorPermission({ DeviceOrientationEvent: function () {} }), true); // Android

  const listeners = new Set();
  const win = { addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f), screen: { orientation: { angle: 0 } } };
  let t = 0;
  const got = [];
  const stop = startMirror({ win, onGesture: (g) => got.push(g), clock: () => t });
  const send = (gamma, at) => { t = at; for (const f of listeners) f({ gamma, beta: 0 }); };
  send(0, 0);
  send(40, 100);
  send(40, 100 + MIRROR.holdMs);
  assert.deepEqual(got, ['wave']);
  for (const f of listeners) f({ gamma: null, beta: null }); // event kosong dari desktop diabaikan
  stop();
  assert.equal(listeners.size, 0);
});
