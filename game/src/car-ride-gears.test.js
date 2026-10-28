import test from 'node:test';
import assert from 'node:assert/strict';
import { Fleet, villaCars } from './vehicle-fleet.js';
import { createCarRide } from './car-ride.js';

const env = { surfaceAt: () => 'road' };
const noopView = { update() {} };
const DT = 1 / 30;

/** HUD bertahap palsu: punya bind (mode bertahap), view (menyimpan model terakhir), pedals dan steer. */
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
const W = { x: 0, z: -1 };
const S = { x: 0, z: 1 };
const IDLE = { x: 0, z: 0 };

test('naik sebagai pengemudi: mesin belum menyala, mobil tidak bergerak walau gas ditekan, pemain diberi tahu', () => {
  const { ride, hud, toasts, car, me } = mk();
  assert.match(toasts.at(-1), /Nyalakan/);
  run(ride, me, 30, W);
  assert.equal(car.speed, 0);
  assert.match(toasts.at(-1), /Nyalakan mesin/);
  const m = hud.models.at(-1);
  assert.equal(m.stage, 'cabin');
  assert.equal(m.controls.wheel, false, 'setir tidak tampil saat mobil parkir');
  assert.equal(m.controls.pedals, false);
});

test('urutan: nyalakan mesin -> pilih D -> gas = maju; HUD berpindah ke tahap berkendara', () => {
  const { ride, hud, car, me } = mk();
  hud.act('engine');
  run(ride, me, 30, IDLE); // 1 detik > 0,7 detik menyala
  assert.equal(hud.models.at(-1).stage, 'stopped');
  assert.equal(hud.models.at(-1).controls.pedals, true);
  run(ride, me, 30, W);
  assert.equal(car.speed, 0, 'gigi masih P');
  hud.act('gear', 'D');
  run(ride, me, 60, W);
  assert.ok(car.speed > 3, `melaju: ${car.speed}`);
  assert.equal(hud.models.at(-1).stage, 'driving');
  assert.equal(hud.models.at(-1).controls.engine, false);
});

test('gigi R: gas = mundur; pindah gigi saat melaju diizinkan (tanpa syarat kecepatan)', () => {
  const { ride, hud, car, toasts, me } = mk();
  hud.act('engine');
  run(ride, me, 30, IDLE);
  hud.act('gear', 'R');
  run(ride, me, 45, W);
  assert.ok(car.speed < -1, `mundur: ${car.speed}`);
  run(ride, me, 60, S); // rem sampai berhenti
  assert.equal(car.speed, 0);
  hud.act('gear', 'D');
  run(ride, me, 60, W);
  assert.ok(car.speed > 3);
  hud.act('gear', 'R');
  assert.equal(ride.state().gear, 'R', 'R langsung dipilih walau mobil masih melaju');
  assert.doesNotMatch(toasts.at(-1), /Berhenti dulu/);
});

test('keluar hanya setelah berhenti; mesin dan keadaan dibersihkan sesudah turun', () => {
  const { ride, hud, fleet, toasts, car, me } = mk();
  hud.act('engine');
  run(ride, me, 30, IDLE);
  hud.act('gear', 'D');
  run(ride, me, 60, W);
  assert.equal(ride.leave(me), false);
  assert.match(toasts.at(-1), /Hentikan mobil/);
  assert.ok(fleet.mine, 'masih di dalam mobil');
  run(ride, me, 60, S);
  assert.equal(car.speed, 0);
  assert.equal(ride.leave(me), true);
  assert.equal(fleet.mine, null);
  run(ride, me, 2, IDLE);
  assert.equal(ride.state(), null);
  // naik lagi: mulai dari awal (mesin mati, gigi P)
  me.x = car.x + 2;
  me.z = car.z;
  assert.equal(ride.board(me), true);
  assert.equal(ride.state().eng, 'off');
  assert.equal(ride.state().gear, 'P');
});

test('rem tangan menahan mobil walau gigi D dan gas penuh; melepasnya membuat mobil jalan', () => {
  const { ride, hud, car, toasts, me } = mk();
  hud.act('engine');
  run(ride, me, 30, IDLE);
  hud.act('gear', 'D');
  hud.act('handbrake');
  run(ride, me, 30, W);
  assert.equal(car.speed, 0);
  assert.match(toasts.at(-1), /rem tangan/i);
  hud.act('handbrake');
  run(ride, me, 45, W);
  assert.ok(car.speed > 2);
});

test('lampu, hazard, sein, AC, sabuk lewat HUD; mesin tidak boleh dimatikan saat melaju', () => {
  const { ride, hud, toasts, me } = mk();
  hud.act('lights');
  hud.act('hazard');
  hud.act('belt');
  hud.act('indicator', -1);
  hud.act('ac');
  assert.match(toasts.at(-1), /AC butuh mesin/);
  const s = ride.state();
  assert.deepEqual([s.lights, s.hazard, s.belt, s.indicator, s.ac], [true, true, true, -1, false]);
  hud.act('engine');
  run(ride, me, 30, IDLE);
  hud.act('ac');
  hud.act('gear', 'D');
  run(ride, me, 60, W);
  hud.act('engine');
  assert.match(toasts.at(-1), /Hentikan mobil/);
  assert.equal(ride.state().eng, 'on');
  const m = hud.models.at(-1);
  assert.deepEqual([m.lights, m.hazard, m.belt, m.indicator, m.ac], [true, true, true, -1, true]);
});

test('penumpang tidak punya kontrol kendaraan: HUD tidak menerima model dan perintah diabaikan', () => {
  const fleet = new Fleet({ specs: villaCars(), selfId: 'aku', env });
  const hud = gearedHud();
  const ride = createCarRide({ fleet, view: noopView, hud, toast: () => {} });
  const car = fleet.cars[0];
  car.seats[0] = 'orang-lain';
  const me = { x: car.x + 2, z: car.z, level: 0, stair: null, y: 0 };
  assert.equal(ride.board(me), true);
  assert.equal(fleet.driving, null);
  run(ride, me, 3, W);
  assert.equal(hud.models.at(-1), null);
  assert.doesNotThrow(() => hud.act('engine'));
  assert.equal(ride.state(), null);
  assert.equal(ride.leave(me), true, 'penumpang boleh turun saat mobil diam');
});
