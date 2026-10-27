import test from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_OFF, NIGHT_ON, RAIN_OFF, RAIN_ON, createAutoLights, envFromGlobals } from './car-auto-lights.js';

test('siang terang: lampu padam', () => {
  const lights = createAutoLights();
  assert.equal(lights(-1, 0), false);
});
	est('menjelang senja: lampu menyala, dan bertahan di antara dua ambang (tidak berkedip)', () => {
  const lights = createAutoLights();
  assert.equal(lights(NIGHT_ON + 0.05, 0), true);
  assert.equal(lights((NIGHT_ON + NIGHT_OFF) / 2, 0), true); // sudah menyala: tetap menyala
  assert.equal(lights(NIGHT_OFF - 0.05, 0), false); // terang lagi: padam
  assert.equal(lights((NIGHT_ON + NIGHT_OFF) / 2, 0), false); // sudah padam: tidak menyala sebelum melewati NIGHT_ON
});

test('malam penuh: menyala', () => {
  assert.equal(createAutoLights()(1, 0), true);
});

test('hujan di siang hari menyalakan lampu, reda memadamkannya (histeresis)', () => {
  const lights = createAutoLights();
  assert.equal(lights(-1, RAIN_ON - 0.05), false);
  assert.equal(lights(-1, RAIN_ON + 0.05), true);
  assert.equal(lights(-1, (RAIN_ON + RAIN_OFF) / 2), true);
  assert.equal(lights(-1, RAIN_OFF - 0.05), false);
});

test('tiap mobil punya keputusan sendiri (tidak berbagi keadaan)', () => {
  const a = createAutoLights();
  const b = createAutoLights();
  a(1, 0);
  assert.equal(b(-1, 0), false);
});

test('envFromGlobals: tanpa langit hotel = null (vila tidak berubah)', () => {
  assert.equal(envFromGlobals({}), null);
  assert.equal(envFromGlobals({ __hotel: { sky: () => ({}) } }), null);
  assert.equal(envFromGlobals({ __hotel: { sky: () => { throw new Error('x'); } } }), null);
});

test('envFromGlobals: membaca fase dan hujan; hujan yang tidak ada dianggap 0', () => {
  assert.deepEqual(envFromGlobals({ __hotel: { sky: () => ({ phase: 0.5 }) }, __weather: { intensity: () => 0.3 } }), { phase: 0.5, rain: 0.3 });
  assert.deepEqual(envFromGlobals({ __hotel: { sky: () => ({ phase: -1 }) } }), { phase: -1, rain: 0 });
});
