import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAR_MODELS, MODEL_IDS } from './car-models.js';
import { engineLayers, harmonicWeights, nextBoost } from './car-audio.js';
import { createCockpitRig, buildSteeringWheel, drawCluster } from './cockpit-view.js';
import { cockpitSpec } from './cockpit.js';
import { createVehicle } from './vehicle.js';

test('harmonik: ternormalisasi, menurun; menjerit lebih terang dari halus', () => {
  for (const t of ['smooth', 'deep', 'scream']) {
    const w = harmonicWeights(t, 8);
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(w[0] > w[5]);
  }
  const hi = (t) => harmonicWeights(t, 8).slice(3).reduce((a, b) => a + b, 0);
  assert.ok(hi('scream') > hi('smooth'));
});

test('lapisan: putaran mesin naik dengan laju, gas membuka suara, mesin mati = hening', () => {
  for (const id of MODEL_IDS) {
    const m = CAR_MODELS[id];
    const idle = engineLayers(m, { speed: 0, throttle: 0 });
    const fast = engineLayers(m, { speed: m.maxSpeed * 0.8, throttle: 1 });
    assert.ok(fast.fireHz > idle.fireHz && fast.rpm > idle.rpm, id);
    assert.ok(fast.exhaustGain > idle.exhaustGain && fast.intakeGain > idle.intakeGain && fast.drive > idle.drive, id);
    assert.ok(fast.windGain > idle.windGain && fast.cutoff > idle.cutoff, id);
    const off = engineLayers(m, { speed: 0, throttle: 0, engineOn: false });
    assert.equal(off.exhaustGain, 0);
    assert.equal(off.intakeGain, 0);
    for (const v of Object.values(fast)) assert.ok(typeof v === 'boolean' || Number.isFinite(v), `${id}: nilai terbatas`);
  }
});

test('lapisan: turbo hanya pada model bermesin turbo; kabin meredam angin dan menebalkan bunyi rendah', () => {
  const noir = CAR_MODELS.noir;
  const boosted = engineLayers(noir, { speed: 25, throttle: 1, boost: 1 });
  assert.ok(boosted.turboGain > 0 && boosted.turboFreq > engineLayers(noir, { speed: 25, throttle: 1, boost: 0 }).turboFreq);
  assert.equal(engineLayers(CAR_MODELS.argent, { speed: 25, throttle: 1, boost: 1 }).turboGain, 0);
  const out = engineLayers(noir, { speed: 30, throttle: 1 });
  const inn = engineLayers(noir, { speed: 30, throttle: 1, cabin: true });
  assert.ok(inn.windGain < out.windGain && inn.cutoff < out.cutoff && inn.cabinLow > out.cabinLow);
});

test('pemotong putaran: aktif hanya di putaran maksimum dengan gas dalam', () => {
  const m = CAR_MODELS.argent;
  assert.equal(engineLayers(m, { speed: 5, throttle: 1 }).limiter, false);
  assert.equal(engineLayers(m, { speed: m.maxSpeed, throttle: 1 }).limiter, true);
  assert.equal(engineLayers(m, { speed: m.maxSpeed, throttle: 0 }).limiter, false);
});

test('boost turbo: naik pelan, jatuh cepat saat gas dilepas, tetap 0..1', () => {
  let b = 0;
  for (let i = 0; i < 30; i++) b = nextBoost(b, 1, 0.9, 1 / 60);
  assert.ok(b > 0.2 && b <= 1);
  const up = b;
  for (let i = 0; i < 30; i++) b = nextBoost(b, 0, 0.9, 1 / 60);
  assert.ok(b < up * 0.2);
});

test('rig kokpit: roda setir, tangan, jam, tiga spion dibuat; mirrors=false memakai kaca gelap; update dan dispose tidak error', () => {
  const car = createVehicle({ id: 'k', model: 'royale' });
  const spec = cockpitSpec(car.spec);
  const sw = buildSteeringWheel(spec);
  assert.ok(Math.abs(sw.pivot.position.z - spec.wheel.z) < 1e-9);
  const tilt = new THREE.Group();
  for (const mirrors of [true, false]) {
    const rig = createCockpitRig({ car, tilt }, { mirrors });
    assert.equal(rig.mirrors.length, 3);
    assert.equal(rig.group.visible, false);
    rig.setActive(true);
    assert.equal(rig.group.visible, true);
    rig.update({ wheelRot: -0.8, hud: { rpm: 3000, rpmMax: 7000, gear: 2 }, time: 1 });
    assert.ok(rig.mirrors.every((m) => (m.rt !== null) === mirrors));
    // lengan terpasang dari siku ke tangan: tidak NaN
    rig.group.traverse((o) => { assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z + o.scale.y), 'posisi terbatas'); });
    rig.dispose();
  }
  sw.dispose();
});

test('jam spidometer menggambar tanpa error pada konteks tiruan', () => {
  const calls = [];
  const g = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? (...a) => calls.push(k) : undefined), set: () => true });
  drawCluster(g, { kmh: 120, rpmFrac: 0.6, gear: 4, maxKmh: 300 });
  assert.ok(calls.includes('fillText') && calls.includes('stroke'));
});
