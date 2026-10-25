import test from 'node:test';
import assert from 'node:assert/strict';
import { Fleet, villaCars } from './vehicle-fleet.js';
import { createCarRide } from './car-ride.js';
import { getParts } from './car-parts.js';

const env = { surfaceAt: () => 'road' };
const noopView = { update() {} };
const DT = 1 / 30;
const W = { x: 0, z: -1 };
const S = { x: 0, z: 1 };
const IDLE = { x: 0, z: 0 };

/** HUD bertahap palsu (sama dengan car-ride-gears.test.js). */
const gearedHud = () => {
  const h = { models: [], handler: null, gas: 0, brake: 0 };
  h.set = () => {};
  h.bind = (fn) => { h.handler = fn; };
  h.view = (m) => h.models.push(m);
  h.pedals = () => ({ gas: h.gas, brake: h.brake, reverse: 0 });
  h.steer = () => 0;
  h.act = (type, value) => h.handler({ type, value });
  return h;
};

const mk = () => {
  const fleet = new Fleet({ specs: villaCars(), selfId: 'aku', env });
  const toasts = [];
  const hud = gearedHud();
  const ride = createCarRide({ fleet, view: noopView, hud, toast: (t) => toasts.push(t) });
  const car = fleet.cars[0];
  const me = { x: car.x + 2, z: car.z, level: 0, stair: null, y: 0 };
  assert.equal(ride.board(me), true);
  return { fleet, ride, hud, toasts, car, me };
};
const run = (ride, me, frames, rawInput) => { for (let i = 0; i < frames; i++) ride.step(me, { delta: DT, rawInput }); };

test('pintu dan atap: terbuka saat berhenti, menutup sendiri saat melaju, ditolak dibuka saat melaju, dibersihkan saat turun', () => {
  const { ride, hud, toasts, car, me } = mk();
  hud.act('doorL');
  hud.act('roof');
  run(ride, me, 2, IDLE);
  const p = getParts(car);
  assert.deepEqual([p.doorL, p.doorR, p.roof], [true, false, true]);
  assert.deepEqual([hud.models.at(-1).doorL, hud.models.at(-1).doorR, hud.models.at(-1).roof], [true, false, true], 'HUD ikut menyala');
  hud.act('engine');
  run(ride, me, 30, IDLE);
  hud.act('gear', 'D');
  run(ride, me, 60, W);
  assert.ok(car.speed > 3);
  const moving = getParts(car);
  assert.deepEqual([moving.doorL, moving.roof], [false, false], 'menutup sendiri saat melaju');
  assert.ok(toasts.some((t) => /menutup otomatis/.test(t)));
  hud.act('roof');
  assert.match(toasts.at(-1), /Hentikan mobil/);
  assert.equal(getParts(car).roof, false);
  run(ride, me, 60, S);
  assert.equal(car.speed, 0);
  assert.equal(ride.leave(me), true);
  assert.equal(getParts(car), null, 'turun: tampilan kembali ke bawaan');
});

test('lampu, hazard, sein, rem tangan, dan gigi mundur sampai ke keadaan tampilan mobil', () => {
  const { ride, hud, car, me } = mk();
  hud.act('lights');
  hud.act('hazard');
  hud.act('indicator', 1);
  hud.act('handbrake');
  run(ride, me, 2, IDLE);
  let p = getParts(car);
  assert.deepEqual([p.lights, p.hazard, p.indicator, p.handbrake, p.reverse], [true, true, 1, true, false]);
  hud.act('handbrake');
  hud.act('lights');
  hud.act('engine');
  run(ride, me, 30, IDLE);
  hud.act('gear', 'R');
  run(ride, me, 2, IDLE);
  p = getParts(car);
  assert.deepEqual([p.lights, p.handbrake, p.reverse, p.engine], [false, false, true, true]);
});

test('penumpang tidak punya keadaan tampilan; perintah pintu diabaikan', () => {
  const fleet = new Fleet({ specs: villaCars(), selfId: 'aku', env });
  const hud = gearedHud();
  const ride = createCarRide({ fleet, view: noopView, hud, toast: () => {} });
  const car = fleet.cars[0];
  car.seats[0] = 'orang-lain';
  const me = { x: car.x + 2, z: car.z, level: 0, stair: null, y: 0 };
  assert.equal(ride.board(me), true);
  run(ride, me, 3, W);
  assert.equal(getParts(car), null);
  assert.doesNotThrow(() => hud.act('doorL'));
  assert.equal(getParts(car), null);
});

test('HUD lama (tanpa bind) tidak menyentuh keadaan tampilan: lampu tetap mengikuti perilaku lama', () => {
  const fleet = new Fleet({ specs: villaCars(), selfId: 'aku', env });
  const hud = { set() {}, pedals: () => ({ gas: 0, brake: 0, reverse: 0 }), steer: () => 0 };
  const ride = createCarRide({ fleet, view: noopView, hud, toast: () => {} });
  const car = fleet.cars[0];
  const me = { x: car.x + 2, z: car.z, level: 0, stair: null, y: 0 };
  assert.equal(ride.board(me), true);
  run(ride, me, 5, W);
  assert.equal(getParts(car), null);
});
