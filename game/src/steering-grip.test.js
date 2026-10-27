import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_LOCK, STEER_RATE_MIN, createVehicle, setWetness, stepVehicle, wetness } from './vehicle.js';

const ROAD = { surfaceAt: () => 'road' };
const DT = 1 / 60;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Laju yaw (rad/dtk) pada 0,5 dtk pertama setelah setir penuh (kecepatan belum banyak terkikis selip). */
function yawRate(model, speed, steer = 1) {
  const v = createVehicle({ id: 'a', x: 0, z: 0, model });
  v.engine = true;
  v.speed = speed;
  for (let i = 0; i < 12; i++) stepVehicle(v, { throttle: 0, steer }, DT, ROAD); // setir sampai kunci
  const h0 = v.heading;
  for (let i = 0; i < 30; i++) stepVehicle(v, { throttle: 0, steer }, DT, ROAD);
  return Math.abs(wrap(v.heading - h0)) / (30 * DT);
}

test('setir penuh pelan-pelan: lingkaran putar balik sempit (radius <= 6 m) untuk semua model mewah', () => {
  for (const model of ['royale', 'noir', 'argent', 'rubis']) {
    const v = createVehicle({ id: model, x: 0, z: 0, model });
    v.engine = true;
    v.speed = 3;
    for (let i = 0; i < 20; i++) stepVehicle(v, { throttle: 0, steer: 1 }, DT, ROAD);
    const h0 = v.heading;
    let dist = 0;
    let px = v.x;
    let pz = v.z;
    for (let i = 0; i < 30; i++) {
      stepVehicle(v, { throttle: 0, steer: 1 }, DT, ROAD);
      dist += Math.hypot(v.x - px, v.z - pz);
      px = v.x;
      pz = v.z;
    }
    const radius = dist / Math.abs(wrap(v.heading - h0));
    assert.ok(radius <= 6, `${model}: radius ${radius.toFixed(2)} m`);
  }
});

test('setir penuh tercapai dalam sekitar 0,15 dtk (tidak terasa lambat)', () => {
  assert.ok(STEER_RATE_MIN >= 4);
  const v = createVehicle({ id: 'a', x: 0, z: 0, model: 'royale' });
  v.engine = true;
  v.speed = 10;
  for (let i = 0; i < 9; i++) stepVehicle(v, { throttle: 0, steer: 1 }, DT, ROAD); // 0,15 dtk
  assert.ok(v.steer >= 0.9 * 0.6 * (1 - 0.3 * 10 / 31), `steer ${v.steer.toFixed(3)}`);
  assert.ok(FULL_LOCK >= 0.58);
});

test('tikungan radius 50 m (tikungan tajam jalan perjalanan) bisa dilalui pada 80 km/j, kering maupun basah', () => {
  const need = 22.2 / 50; // rad/dtk untuk v = 22,2 m/s (80 km/j) di radius 50 m
  setWetness(0);
  assert.ok(yawRate('royale', 22.2) >= need, `kering ${yawRate('royale', 22.2).toFixed(2)}`);
  setWetness(1);
  assert.ok(yawRate('royale', 22.2) >= need, `basah ${yawRate('royale', 22.2).toFixed(2)}`);
  setWetness(0);
});

test('jalan basah mengurangi grip belok, dan setWetness dibatasi 0..1', () => {
  setWetness(0);
  const dry = yawRate('rubis', 26);
  setWetness(1);
  const wet = yawRate('rubis', 26);
  setWetness(0);
  assert.ok(wet < dry, `basah ${wet.toFixed(3)} < kering ${dry.toFixed(3)}`);
  setWetness(5);
  assert.equal(wetness(), 1);
  setWetness(-2);
  assert.equal(wetness(), 0);
  setWetness(Number.NaN);
  assert.equal(wetness(), 0);
});
