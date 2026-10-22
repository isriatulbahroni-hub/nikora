import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_MODELS, MODEL_IDS, firingHz, gearFor, hotelModelFor, rpmFor } from './car-models.js';
import { engineSound, hearGain } from './car-audio.js';
import { createVehicle, seatWorld, stepVehicle, specOf } from './vehicle.js';
import { hudInfo } from './car-ride.js';

const road = { surfaceAt: () => 'road' };

test('katalog: empat model, kursi 2-4, offset kursi di dalam badan, kursi 0 = pengemudi kanan', () => {
  assert.deepEqual([...MODEL_IDS].sort(), ['argent', 'noir', 'royale', 'rubis']);
  for (const m of Object.values(CAR_MODELS)) {
    assert.ok(m.seats.length >= 2 && m.seats.length <= 4, m.id);
    assert.ok(m.seats[0].side > 0, 'setir kanan');
    for (const s of m.seats) assert.ok(Math.abs(s.fwd) < m.length / 2 && Math.abs(s.side) < m.width / 2, `${m.id} kursi di dalam badan`);
    assert.ok(m.engine.gears.every((g, i, a) => i === 0 || g > a[i - 1]) && m.engine.gears.at(-1) >= m.maxSpeed - 1e-9, `${m.id} gigi menutup kecepatan maksimum`);
  }
});

test('armada hotel: 8 mobil = tiap model dua kali', () => {
  const ids = Array.from({ length: 8 }, (_, k) => hotelModelFor(k));
  for (const id of MODEL_IDS) assert.equal(ids.filter((x) => x === id).length, 2);
});

test('fisika per model: tiap mobil mencapai kecepatan maksimumnya di jalan, hypercar lebih cepat dari SUV', () => {
  const top = {};
  for (const id of MODEL_IDS) {
    const v = createVehicle({ id, x: 0, z: 0, heading: 0, model: id });
    v.engine = true;
    for (let i = 0; i < 60 * 40; i++) { stepVehicle(v, { throttle: 1, steer: 0 }, 1 / 60, { ...road, colliders: [] }); v.z = 0; }
    top[id] = v.speed;
    assert.ok(v.speed > CAR_MODELS[id].maxSpeed * 0.95 && v.speed <= CAR_MODELS[id].maxSpeed + 1e-9, `${id}: ${v.speed}`);
  }
  assert.ok(top.argent > top.rubis);
});

test('rem: berhenti total, lampu rem (braking) menyala hanya saat mengerem', () => {
  const v = createVehicle({ id: 'a', model: 'noir' });
  v.engine = true;
  for (let i = 0; i < 300; i++) stepVehicle(v, { throttle: 1 }, 1 / 60, { ...road, colliders: [] });
  assert.equal(v.braking, false);
  stepVehicle(v, { throttle: 0, brake: true }, 1 / 60, { ...road, colliders: [] });
  assert.equal(v.braking, true);
  for (let i = 0; i < 300; i++) stepVehicle(v, { brake: true }, 1 / 60, { ...road, colliders: [] });
  assert.equal(v.speed, 0);
});

test('kursi: jumlah kursi mengikuti model dan posisi kursi di dalam kerangka mobil', () => {
  for (const id of MODEL_IDS) {
    const v = createVehicle({ id: 'x', x: 10, z: 10, heading: 0, model: id });
    assert.equal(v.seats.length, CAR_MODELS[id].seats.length);
    const w = seatWorld(v, 0);
    assert.ok(w.x < 10, 'kursi pengemudi di kanan mobil (x kecil saat menghadap selatan)');
  }
  assert.equal(specOf(null).seatCount, 4, 'sedan lama tetap 4 kursi');
});

test('gigi dan RPM: netral saat diam, gigi naik dengan kecepatan, RPM jatuh saat pindah gigi, 0 saat mesin mati', () => {
  const m = CAR_MODELS.royale;
  assert.equal(gearFor(m, 0), 0);
  assert.equal(gearFor(m, 8), 2);
  assert.equal(gearFor(m, 999), m.engine.gears.length);
  const before = rpmFor(m, m.engine.gears[0] - 0.01, 1);
  const after = rpmFor(m, m.engine.gears[0] + 0.01, 1);
  assert.ok(after < before, 'RPM turun setelah pindah gigi');
  assert.equal(rpmFor(m, 10, 1, false), 0);
  for (const mm of Object.values(CAR_MODELS)) for (let v = 0; v <= mm.maxSpeed; v += 0.5) {
    const r = rpmFor(mm, v, 1);
    assert.ok(r >= mm.engine.idleRpm - 1 && r <= mm.engine.maxRpm, `${mm.id} v=${v} rpm=${r}`);
  }
  assert.ok(firingHz(CAR_MODELS.argent, 6000) > 0);
});

test('suara mesin: nada naik dengan RPM, gain nol saat mesin mati; kekerasan menurun dengan jarak', () => {
  const m = CAR_MODELS.argent;
  assert.ok(engineSound(m, 30, 1).hz > engineSound(m, 2, 0).hz);
  assert.equal(engineSound(m, 0, 0, false).gain, 0);
  assert.ok(hearGain(5) > hearGain(30));
  assert.equal(hearGain(100), 0);
});

test('hudInfo: nama, gigi R/N/angka; sedan lama tanpa info', () => {
  const v = createVehicle({ id: 'x', model: 'rubis' });
  v.engine = true;
  assert.equal(hudInfo(v).gear, 'N');
  v.speed = 10;
  assert.equal(hudInfo(v).gear, 2);
  v.speed = -2;
  assert.equal(hudInfo(v).gear, 'R');
  assert.equal(hudInfo(createVehicle({ id: 'y' })), null);
});
