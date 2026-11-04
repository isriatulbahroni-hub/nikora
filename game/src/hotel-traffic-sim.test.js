import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HONK_AFTER, MIN_IMPACT, carObstacle, circleVsObb, collideDrivenCar, collideWalker, createTrafficSim, obbOf, resolveCarHits, safeSpeed, shapesFrom, walkerObstacle,
} from './hotel-traffic-sim.js';

// Salinan VEHICLE_HITBOX (hotel-life-data.js); hotel-traffic-sim.hitbox.test.js menjaga agar tetap sama dengan aslinya.
const HITBOX = Object.freeze({
  car: { front: 2.35, back: 2.35, half: 0.98 },
  motor: { front: 0.95, back: 0.95, half: 0.3 },
  bus: { front: 5.75, back: 5.75, half: 1.27 },
  truck: { front: 3.7, back: 4.1, half: 1.2 },
});
const BODY = shapesFrom(HITBOX);

// Jalan lurus 1000 m ke timur (heading PI/2: maju = +x), melingkar. Cukup untuk menguji perilaku tanpa jalan hotel yang sebenarnya.
const L = 1000;
const laneAt = () => ({ length: L, at: (u) => ({ x: ((u % L) + L) % L, z: 0, heading: Math.PI / 2 }) });
const sim3 = (specs) => createTrafficSim(specs, laneAt, HITBOX);
const spec = (id, kind, u0, speed = 20) => ({ id, kind, lane: 0, ccw: false, speed, u0, color: 0xffffff });
const run = (sim, seconds, obstacles = [], dt = 1 / 30) => {
  const events = [];
  for (let t = 0; t < seconds; t += dt) events.push(...sim.step(dt, obstacles));
  return events;
};
const bumperGap = (a, b) => b.u - a.u - a.shape.halfL - b.shape.halfL; // a di belakang b (tanpa lompatan keliling)

test('obbOf: sumbu mengikuti heading (maju = (sin h, cos h)) dan ukuran per jenis', () => {
  const o = obbOf(BODY.car, 10, 20, Math.PI / 2);
  assert.ok(Math.abs(o.fx - 1) < 1e-9 && Math.abs(o.fz) < 1e-9);
  assert.equal(o.halfL, BODY.car.halfL);
  assert.equal(o.halfW, BODY.car.halfW);
  assert.ok(BODY.bus.halfL > BODY.truck.halfL && BODY.truck.halfL > BODY.car.halfL && BODY.car.halfL > BODY.motor.halfL);
  const t = obbOf(BODY.truck, 0, 0, 0); // heading 0 = maju ke +z; pusat badan truk digeser ke belakang
  assert.ok(t.z < 0);
});

test('circleVsObb: tidak menyentuh, menyentuh sisi, dan pusat di dalam kotak', () => {
  const o = obbOf(BODY.car, 0, 0, 0); // memanjang di sumbu z
  assert.equal(circleVsObb(5, 0, 1, o), null);
  const side = circleVsObb(BODY.car.halfW + 0.5, 0, 1, o); // sisi kanan (+x), tembus 0,5
  assert.ok(side && Math.abs(side.depth - 0.5) < 1e-9 && side.nx > 0.99);
  const nose = circleVsObb(0, BODY.car.halfL + 0.4, 1, o);
  assert.ok(nose && Math.abs(nose.depth - 0.6) < 1e-9 && nose.nz > 0.99);
  const inside = circleVsObb(0.1, 0.2, 0.5, o); // di dalam: didorong keluar lewat sisi terdekat (samping)
  assert.ok(inside && inside.depth > 0.5 && Math.abs(inside.nx) > 0.99);
});

test('safeSpeed: nol di jarak berhenti, naik menurut jarak', () => {
  assert.equal(safeSpeed(0), 0);
  assert.equal(safeSpeed(2.5), 0);
  assert.ok(safeSpeed(30) > safeSpeed(10));
  assert.ok(safeSpeed(40) > 12);
});

test('lalu lintas bebas: maju sesuai kecepatan dan tetap di jalur', () => {
  const sim = sim3([spec(1, 'car', 100, 20)]);
  run(sim, 2);
  const v = sim.vehicles[0];
  assert.ok(Math.abs(v.x - 140) < 1, `x=${v.x}`);
  assert.equal(v.z, 0);
  assert.ok(Math.abs(v.v - 20) < 1e-9);
});

test('kendaraan sejalur tidak menembus kendaraan di depannya yang berhenti', () => {
  const sim = sim3([spec(1, 'car', 100, 22), spec(2, 'car', 260, 22)]);
  const [rear, front] = sim.vehicles;
  sim.bump(front, 12, 1); // depan ditabrak: berhenti beberapa detik
  let minGap = Infinity;
  for (let t = 0; t < 12; t += 1 / 30) {
    sim.step(1 / 30);
    minGap = Math.min(minGap, bumperGap(rear, front));
  }
  assert.ok(minGap > 0.5, `jarak terkecil ${minGap}`);
  run(sim, 15);
  assert.ok(front.v > 5 && rear.v > 5, 'keduanya jalan lagi sesudah berhenti');
});

test('mengerem untuk pemain di lajurnya, berhenti sebelum menyentuh, lalu jalan lagi bila pemain pergi', () => {
  const sim = sim3([spec(1, 'car', 100, 22)]);
  const v = sim.vehicles[0];
  const car = { x: 200, z: 0, heading: Math.PI / 2, spec: { length: 4.3, width: 1.82 } };
  const ob = [carObstacle(car)];
  let tooClose = false;
  for (let t = 0; t < 12; t += 1 / 30) {
    sim.step(1 / 30, ob);
    if (v.x + v.shape.halfL > ob[0].x - ob[0].halfL) tooClose = true;
  }
  assert.equal(tooClose, false);
  assert.ok(v.v < 0.2);
  run(sim, 8, []);
  assert.ok(v.v > 10, 'jalan lagi');
});

test('pemain di lajur lain tidak menghentikan kendaraan', () => {
  const sim = sim3([spec(1, 'car', 100, 22)]);
  const v = sim.vehicles[0];
  run(sim, 3, [walkerObstacle({ x: 200, z: 12 })]);
  assert.ok(v.v > 21);
});

test('dihalangi lama membunyikan klakson, lalu menunggu sebelum klakson lagi', () => {
  const sim = sim3([spec(7, 'bus', 100, 15)]);
  const ob = [walkerObstacle({ x: 160, z: 0 })];
  const ev = run(sim, HONK_AFTER + 8, ob).filter((e) => e.type === 'honk');
  assert.ok(ev.length >= 1 && ev.length <= 2, `klakson ${ev.length}`);
  assert.equal(ev[0].id, 7);
  assert.equal(ev[0].kind, 'bus');
});

test('bump: berhenti, miring lalu pulih, jeda antar tabrakan', () => {
  const sim = sim3([spec(1, 'car', 100, 20)]);
  const v = sim.vehicles[0];
  assert.equal(sim.bump(v, 10, 1), true);
  assert.equal(sim.bump(v, 10, 1), false, 'jeda tabrakan');
  assert.ok(v.kick > 0.2);
  run(sim, 0.5);
  assert.ok(v.v < 1);
  run(sim, 8);
  assert.equal(v.kick, 0);
  assert.ok(v.v > 15, 'melaju lagi');
});

test('motor yang ditabrak keras roboh lalu bangun; mobil tidak roboh', () => {
  const sim = sim3([spec(1, 'motor', 100, 18), spec(2, 'car', 400, 18)]);
  const [m, c] = sim.vehicles;
  sim.bump(m, 9, 1);
  sim.bump(c, 9, 1);
  run(sim, 1.5);
  assert.ok(m.roll > 1, `roll ${m.roll}`);
  assert.equal(c.roll, 0);
  run(sim, 8);
  assert.equal(m.roll, 0);
});

test('collideDrivenCar: mobil pemain didorong keluar dan kekuatan = laju mendekat', () => {
  const sim = sim3([spec(1, 'car', 500, 0)]);
  const other = sim.vehicles[0];
  other.v = 0;
  run(sim, 0.1);
  // mobil pemain dari barat menuju timur dengan 15 m/s, hidungnya menembus belakang kendaraan
  const car = { x: other.x - 4.1, z: 0, heading: Math.PI / 2, speed: 15, spec: { circleRadius: 1.05, circleOffset: 1.05 } };
  const hits = collideDrivenCar(car, sim.vehicles);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(hits[0].strength - 15) < 0.5, `kekuatan ${hits[0].strength}`);
  assert.ok(collideDrivenCar(car, sim.vehicles).every((h) => h.depth < 1e-6), 'sudah terdorong keluar');
  assert.ok(car.x < other.x - 3);
});

test('resolveCarHits: bus menahan lebih banyak daripada motor, sentuhan ringan tidak dihitung', () => {
  const mk = (kind) => [{ body: { shape: BODY[kind] }, strength: 10 }];
  const a = { speed: 20 };
  const b = { speed: 20 };
  assert.equal(resolveCarHits(a, mk('bus')), 10);
  resolveCarHits(b, mk('motor'));
  assert.ok(a.speed < b.speed && b.speed > 17);
  const c = { speed: 20 };
  let bumped = 0;
  assert.equal(resolveCarHits(c, [{ body: { shape: BODY.car }, strength: MIN_IMPACT / 2 }], () => bumped++), 0);
  assert.equal(c.speed, 20);
  assert.equal(bumped, 0);
});

test('collideWalker: pejalan kaki tidak bisa menembus badan kendaraan', () => {
  const sim = sim3([spec(1, 'bus', 300, 0)]);
  const bus = sim.vehicles[0];
  bus.v = 0;
  run(sim, 0.1);
  const p = { x: bus.x, z: 0.3 }; // di dalam badan bus
  const hits = collideWalker(p, sim.vehicles);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(p.z) > BODY.bus.halfW, `z=${p.z}`);
  assert.deepEqual(collideWalker({ x: bus.x, z: 20 }, sim.vehicles), []);
});

test('simulasi deterministik: dua simulasi yang sama menghasilkan keadaan yang sama', () => {
  const specs = [spec(1, 'car', 50, 21), spec(2, 'motor', 300, 18), spec(3, 'bus', 600, 15)];
  const a = sim3(specs);
  const b = sim3(specs);
  const ob = [walkerObstacle({ x: 400, z: 0 })];
  run(a, 20, ob);
  run(b, 20, ob);
  assert.deepEqual(a.vehicles.map((v) => [v.x, v.v]), b.vehicles.map((v) => [v.x, v.v]));
});
