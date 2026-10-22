import test from 'node:test';
import assert from 'node:assert/strict';
import { TYRE, G, gripFactor, gripLimit, limitYaw, longSlip, stepTyreTemp, SURFACE_MU } from './tyre-model.js';
import { tyreSound } from './car-audio.js';
import { createVehicle, stepVehicle } from './vehicle.js';

test('ban: grip puncak di suhu ideal, turun saat dingin dan terlalu panas', () => {
  assert.ok(Math.abs(gripFactor(TYRE.optTemp) - 1) < 1e-9);
  assert.ok(gripFactor(TYRE.ambient) < gripFactor(TYRE.optTemp));
  assert.ok(gripFactor(140) < gripFactor(TYRE.optTemp));
  assert.ok(gripFactor(-50) >= TYRE.coldGrip - 1e-9);
});

test('ban: permukaan licin mengurangi batas grip', () => {
  const road = gripLimit(85, 'road');
  assert.ok(gripLimit(85, 'compound') < road);
  assert.ok(gripLimit(85, 'ground') < gripLimit(85, 'compound'));
  assert.ok(Math.abs(road - TYRE.mu * G) < 1e-9);
  assert.equal(SURFACE_MU.road, 1);
});

test('limitYaw: di bawah batas tidak berubah, di atas batas dipotong dan ada selip, arah tetap', () => {
  const ok = limitYaw({ speed: 10, wantedYaw: 0.5, limit: 10 }); // 5 m/s^2 < 10
  assert.equal(ok.yawRate, 0.5);
  assert.equal(ok.slip, 0);
  const over = limitYaw({ speed: 20, wantedYaw: -1, limit: 10 }); // 20 m/s^2 diminta
  assert.ok(Math.abs(over.yawRate * 20 - -10) < 1e-9);
  assert.ok(over.yawRate < 0 && over.slip > 0.4 && over.slip < 0.6);
  assert.equal(limitYaw({ speed: 0.2, wantedYaw: 3, limit: 1 }).slip, 0); // diam: tidak ada selip
});

test('limitYaw: gas/rem keras menghabiskan grip samping (lingkaran gesek)', () => {
  const free = limitYaw({ speed: 20, wantedYaw: 0.4, aLong: 0, limit: 10 });
  const braking = limitYaw({ speed: 20, wantedYaw: 0.4, aLong: 9, limit: 10 });
  assert.ok(Math.abs(braking.yawRate) < Math.abs(free.yawRate));
});

test('longSlip: roda berputar hanya saat gas melebihi grip', () => {
  assert.equal(longSlip(5, 10), 0);
  assert.ok(longSlip(15, 10) > 0);
});

test('suhu ban: selip memanaskan, jalan lurus mendinginkan ke suhu udara, dibatasi', () => {
  let t = TYRE.ambient;
  for (let i = 0; i < 600; i++) t = stepTyreTemp(t, { slip: 0.6, speed: 20, dt: 1 / 60 });
  assert.ok(t > 60 && t <= TYRE.maxTemp);
  for (let i = 0; i < 60 * 600; i++) t = stepTyreTemp(t, { slip: 0, speed: 0, dt: 1 / 60 });
  assert.ok(t < TYRE.ambient + 1);
});

test('mobil: belok keras di kecepatan tinggi menyelip, melambat, dan memanaskan ban; belok lembut tidak', () => {
  const road = { surfaceAt: () => 'road' };
  const run = (steer, speed) => {
    const v = createVehicle({ id: 'a', x: 0, z: 0, model: 'noir' });
    v.engine = true;
    v.speed = speed;
    let maxSlip = 0;
    for (let i = 0; i < 120; i++) { stepVehicle(v, { throttle: 0, steer }, 1 / 60, road); maxSlip = Math.max(maxSlip, v.slip); }
    return { v, maxSlip };
  };
  const hard = run(1, 35);
  const soft = run(0.05, 35);
  assert.ok(hard.maxSlip > 0.1);
  assert.ok(hard.v.tyreTemp > soft.v.tyreTemp);
  assert.ok(hard.v.speed < soft.v.speed);
  assert.equal(soft.maxSlip, 0);
  // percepatan samping nyata tidak melewati batas grip
  const u = createVehicle({ id: 'b', x: 0, z: 0, model: 'noir' });
  u.engine = true; u.speed = 30;
  let prev = u.heading; let peak = 0;
  for (let i = 0; i < 120; i++) { stepVehicle(u, { throttle: 0, steer: 1 }, 1 / 60, road); const d = Math.atan2(Math.sin(u.heading - prev), Math.cos(u.heading - prev)); prev = u.heading; peak = Math.max(peak, Math.abs(d * 60 * u.speed)); }
  assert.ok(peak <= TYRE.mu * G * 1.01, `a_lat puncak ${peak.toFixed(1)}`);
});

test('mobil: ban dingin awal lebih licin daripada ban hangat', () => {
  const road = { surfaceAt: () => 'road' };
  const turn = (temp) => {
    const v = createVehicle({ id: 'c', x: 0, z: 0, model: 'noir' });
    v.engine = true; v.speed = 25; v.tyreTemp = temp;
    stepVehicle(v, { throttle: 0, steer: 1 }, 1 / 60, road);
    return Math.abs(v.heading);
  };
  assert.ok(turn(28) < turn(85));
});

test('suara ban: hening saat menempel, makin keras dan tinggi dengan selip dan laju, dibatasi', () => {
  assert.equal(tyreSound(0, 30).gain, 0);
  assert.equal(tyreSound(0.03, 30).gain, 0);
  const a = tyreSound(0.3, 10); const b = tyreSound(0.8, 30);
  assert.ok(b.gain > a.gain && b.freq > a.freq);
  assert.ok(tyreSound(1, 99).gain <= 0.14);
});
