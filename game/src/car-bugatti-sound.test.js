import test from 'node:test';
import assert from 'node:assert/strict';
import { GLB_MODELS, gearFor, rpmFor } from './car-models.js';
import { engineLayers, nextBoost } from './car-audio.js';

const bugatti = GLB_MODELS.bugatti;
const nikora = GLB_MODELS.nikora;
const KMH = 1 / 3.6;

test('Bugatti Chiron: W16 empat-turbo, 420 km/j, tujuh gigi, putaran 700-6700 rpm', () => {
  assert.equal(bugatti.engine.cylinders, 16);
  assert.equal(bugatti.engine.turbo, true);
  assert.equal(bugatti.engine.timbre, 'w16');
  assert.equal(bugatti.engine.idleRpm, 700);
  assert.equal(bugatti.engine.maxRpm, 6700);
  assert.equal(bugatti.engine.gears.length, 7);
  assert.ok(Math.abs(bugatti.maxSpeed * 3.6 - 420) < 1);
  assert.equal(gearFor(bugatti, bugatti.maxSpeed), 7);
  for (let v = 0; v <= bugatti.maxSpeed; v += 0.5) {
    const r = rpmFor(bugatti, v, 1);
    assert.ok(r >= bugatti.engine.idleRpm - 1 && r <= bugatti.engine.maxRpm, `v=${v} rpm=${r}`);
  }
});

test('watak suara: dua mobil bergaya Bugatti (NIKORA W16 dan Bugatti Chiron) sama-sama w16', () => {
  assert.equal(nikora.engine.timbre, 'w16', 'NIKORA W16 adalah mobil yang dikendarai pemain di hotel');
  assert.equal(bugatti.engine.timbre, 'w16');
  assert.deepEqual({ ...bugatti.engine }, { ...nikora.engine });
});

test('suara w16: dua nada turbo saat gas dalam, letupan knalpot saat gas dilepas di putaran tinggi, hening saat mesin mati', () => {
  for (const m of [nikora, bugatti]) {
    const full = engineLayers(m, { speed: 100 * KMH * 2, throttle: 1, boost: 1 });
    assert.ok(full.turboGain > 0 && full.turboGain2 > 0, 'dua turbo bersuara');
    assert.ok(full.turboFreq2 > full.turboFreq, 'turbo kedua di nada lebih tinggi');
    const lift = engineLayers(m, { speed: 80, throttle: 0 });
    assert.equal(lift.crackle, true, 'letupan saat gas dilepas dengan kecepatan tinggi');
    assert.equal(engineLayers(m, { speed: 5, throttle: 0 }).crackle, false, 'tidak ada letupan di kecepatan rendah');
    const off = engineLayers(m, { speed: 50, throttle: 1, engineOn: false });
    assert.equal(off.exhaustGain, 0);
    assert.equal(off.crackle, false);
  }
});

test('suara Bugatti: nada pembakaran naik tajam dengan putaran, boost turun cepat saat gas dilepas', () => {
  const idle = engineLayers(bugatti, { speed: 0, throttle: 0 });
  const fast = engineLayers(bugatti, { speed: 100, throttle: 1, boost: 1 });
  assert.ok(Math.abs(idle.rpm - 700) < 1);
  assert.ok(fast.fireHz > idle.fireHz * 4);
  let b = 1;
  for (let i = 0; i < 30; i++) b = nextBoost(b, 0, 0.9, 1 / 60);
  assert.ok(b < 0.2);
});
