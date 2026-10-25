import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRANK_S, SAFE_STOP, blockedReason, canLeave, controlsFor, createCarState, displayGear, driveInput, hudModel, setIndicator, shift, stageOf,
  startEngine, stopEngine, tickEngine, toggle, toggleHandbrake,
} from './car-state.js';

const running = (gear = 'D') => {
  const s = createCarState();
  startEngine(s, 0);
  tickEngine(s, CRANK_S + 0.01);
  if (gear !== 'P') shift(s, gear, 0);
  return s;
};

test('keadaan awal: mesin mati, gigi P, semua fitur mati', () => {
  const s = createCarState();
  assert.deepEqual(s, { eng: 'off', crank: 0, gear: 'P', handbrake: false, lights: false, hazard: false, indicator: 0, ac: false, belt: false });
});

test('mesin menyala lewat tahap starting; gigi dan gas belum bisa dipakai sebelum siap', () => {
  const s = createCarState();
  assert.equal(startEngine(s, 0).ok, true);
  assert.equal(s.eng, 'starting');
  assert.equal(shift(s, 'D', 0).ok, false, 'belum siap');
  assert.equal(startEngine(s, 0).ok, false, 'sudah dalam proses');
  assert.equal(tickEngine(s, CRANK_S / 2), false);
  assert.equal(tickEngine(s, CRANK_S), true, 'selesai menyala');
  assert.equal(s.eng, 'on');
  assert.equal(tickEngine(s, 1), false, 'hanya sekali');
});

test('mesin hanya bisa dinyalakan saat diam dan gigi P atau N', () => {
  const moving = createCarState();
  assert.equal(startEngine(moving, 3).ok, false);
  const inD = createCarState();
  inD.gear = 'D';
  assert.equal(startEngine(inD, 0).ok, false);
  assert.match(startEngine(inD, 0).msg, /P atau N/);
  const inN = createCarState();
  inN.gear = 'N';
  assert.equal(startEngine(inN, 0).ok, true);
});

test('mematikan mesin: hanya saat berhenti; gigi kembali ke P, AC dan sein ikut mati', () => {
  const s = running('D');
  toggle(s, 'ac');
  setIndicator(s, 1);
  assert.equal(stopEngine(s, 5).ok, false);
  assert.equal(s.eng, 'on');
  assert.equal(stopEngine(s, 0).ok, true);
  assert.equal(s.eng, 'off');
  assert.equal(s.gear, 'P');
  assert.equal(s.ac, false);
  assert.equal(s.indicator, 0);
  assert.equal(stopEngine(s, 0).ok, false, 'sudah mati');
});

test('gigi: butuh mesin; P hanya saat berhenti total; R dan D hanya saat hampir berhenti; N kapan saja', () => {
  const off = createCarState();
  assert.equal(shift(off, 'D', 0).ok, false);
  assert.match(shift(off, 'D', 0).msg, /mesin/i);
  const s = running('P');
  assert.equal(shift(s, 'D', 0).ok, true);
  assert.equal(s.gear, 'D');
  assert.equal(shift(s, 'P', 4).ok, false, 'P saat melaju ditolak');
  assert.equal(shift(s, 'R', 4).ok, false, 'R saat melaju ditolak');
  assert.equal(s.gear, 'D');
  assert.equal(shift(s, 'N', 4).ok, true, 'N kapan saja');
  assert.equal(shift(s, 'D', 4).ok, true, 'D saat masih melaju maju');
  assert.equal(shift(s, 'D', -3).ok, false, 'D saat mundur ditolak');
  assert.equal(shift(s, 'X', 0).ok, false, 'gigi tidak dikenal');
  assert.equal(shift(s, 'P', 0.1).ok, true);
  assert.equal(s.gear, 'P');
});

test('masukan fisika mengikuti gigi: D maju, R mundur, N meluncur, P dan rem tangan menahan, rem mengalahkan gas', () => {
  const d = running('D');
  assert.deepEqual(driveInput(d, { gas: 1, steer: 0.3, speed: 2 }), { throttle: 1, steer: 0.3, brake: false });
  assert.deepEqual(driveInput(d, { gas: 1, brake: true, speed: 2 }), { throttle: 0, steer: 0, brake: true }, 'rem menang');
  const r = running('R');
  assert.equal(driveInput(r, { gas: 1 }).throttle, -1, 'gas di R = mundur');
  assert.equal(driveInput(r, { gas: 0 }).throttle, 0, 'tanpa gas tidak ada -0');
  assert.equal(Object.is(driveInput(r, { gas: 0 }).throttle, 0), true);
  const n = running('N');
  assert.deepEqual(driveInput(n, { gas: 1, speed: 3 }), { throttle: 0, steer: 0, brake: false });
  const p = running('P');
  assert.equal(driveInput(p, { gas: 1 }).throttle, 0);
  assert.equal(driveInput(p, { gas: 1 }).brake, false, 'parkir diam: lampu rem tidak menyala');
  assert.equal(driveInput(p, { gas: 1, speed: 1 }).brake, true, 'P saat masih bergerak = ditahan');
  d.handbrake = true;
  assert.equal(driveInput(d, { gas: 1, speed: 0 }).throttle, 0, 'rem tangan menahan gas');
  const off = createCarState();
  assert.equal(driveInput(off, { gas: 1 }).throttle, 0, 'mesin mati: tidak bergerak');
});

test('alasan gas tidak bekerja diberitahukan ke pemain', () => {
  const s = createCarState();
  assert.match(blockedReason(s), /mesin/i);
  startEngine(s, 0);
  assert.match(blockedReason(s), /Tunggu/);
  tickEngine(s, 1);
  assert.match(blockedReason(s), /gigi/i);
  shift(s, 'N', 0);
  assert.match(blockedReason(s), /N/);
  shift(s, 'D', 0);
  assert.equal(blockedReason(s), '');
  toggleHandbrake(s);
  assert.match(blockedReason(s), /rem tangan/i);
});

test('tahap berkendara menentukan kontrol yang tampil: kabin tanpa setir/gas/rem, berhenti dan melaju dengan kontrol kendaraan', () => {
  const s = createCarState();
  assert.equal(stageOf(s, 0), 'cabin');
  const cabin = controlsFor('cabin');
  assert.deepEqual([cabin.wheel, cabin.pedals, cabin.gear, cabin.engine], [false, false, false, true]);
  startEngine(s, 0);
  assert.equal(stageOf(s, 0), 'cabin', 'sedang menyala: belum siap');
  tickEngine(s, 1);
  assert.equal(stageOf(s, 0), 'stopped');
  const stopped = controlsFor('stopped');
  assert.deepEqual([stopped.wheel, stopped.pedals, stopped.gear, stopped.engine], [true, true, true, true]);
  assert.equal(stageOf(s, SAFE_STOP + 0.1), 'driving');
  const driving = controlsFor('driving');
  assert.deepEqual([driving.wheel, driving.pedals, driving.gear, driving.engine], [true, true, true, false], 'tombol mesin tersembunyi saat melaju');
  for (const st of ['cabin', 'stopped', 'driving']) {
    assert.equal(controlsFor(st).horn, true);
    assert.equal(controlsFor(st).panel, true);
  }
});

test('fitur: lampu, hazard, sabuk, AC (butuh mesin), sein bergantian dan bisa dimatikan', () => {
  const s = createCarState();
  assert.equal(toggle(s, 'lights').ok, true);
  assert.equal(s.lights, true);
  assert.equal(toggle(s, 'lights').msg, 'Lampu mati.');
  assert.equal(toggle(s, 'hazard').ok, true);
  assert.equal(toggle(s, 'belt').ok, true);
  assert.equal(toggle(s, 'ac').ok, false, 'AC butuh mesin');
  assert.equal(toggle(s, 'terbang').ok, false);
  startEngine(s, 0);
  tickEngine(s, 1);
  assert.equal(toggle(s, 'ac').ok, true);
  setIndicator(s, -1);
  assert.equal(s.indicator, -1);
  setIndicator(s, 1);
  assert.equal(s.indicator, 1);
  setIndicator(s, 1);
  assert.equal(s.indicator, 0, 'tekan lagi = mati');
});

test('keluar hanya saat berhenti; label gigi HUD dan model HUD', () => {
  assert.equal(canLeave(0), true);
  assert.equal(canLeave(SAFE_STOP - 0.01), true);
  assert.equal(canLeave(SAFE_STOP), false);
  assert.equal(canLeave(-6), false);
  const s = running('D');
  assert.equal(displayGear(s, '3'), '3');
  assert.equal(displayGear(s, 'N'), 'D', 'model N berarti belum melaju: tampilkan D');
  assert.equal(displayGear(s, null), 'D');
  shift(s, 'N', 0);
  assert.equal(displayGear(s, '3'), 'N');
  const m = hudModel(s, 0, null);
  assert.equal(m.stage, 'stopped');
  assert.equal(m.engineLabel, 'Matikan');
  assert.equal(hudModel(createCarState(), 0).engineLabel, 'Nyalakan');
  assert.equal(hudModel(s, 12).stage, 'driving');
});
