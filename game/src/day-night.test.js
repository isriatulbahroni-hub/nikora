import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAY_MODES, DEMO_CYCLE_MS, blendSky, createPhaseTracker, hoursAt, phaseAtHour, skyModeFromSearch, skyPhase, splitPhase, zoneFromSearch,
} from './day-night.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} tidak mendekati ${b}`);
const utc = (h, m = 0) => Date.UTC(2026, 9, 16, h, m);

test('jam mengikuti zona waktu acara', () => {
  near(hoursAt(utc(0), 'WIB'), 7);
  near(hoursAt(utc(0), 'WITA'), 8);
  near(hoursAt(utc(0), 'WIT'), 9);
  near(hoursAt(utc(17, 30), 'WIB'), 0.5);
  near(hoursAt(utc(0), 7), 7);
  near(hoursAt(utc(0), 'XYZ'), 7);
  near(hoursAt(utc(0), undefined), 7);
  near(hoursAt(-3600000, 'WIB'), 6);
});

test('fase menurut jam: malam, fajar, pagi, siang, sore, senja', () => {
  assert.equal(phaseAtHour(2), 1);
  assert.equal(phaseAtHour(5), 1);
  near(phaseAtHour(5.75), 0.5);
  assert.equal(phaseAtHour(6.5), 0);
  near(phaseAtHour(7.5), -0.5);
  assert.equal(phaseAtHour(8.5), -1);
  assert.equal(phaseAtHour(12), -1);
  assert.equal(phaseAtHour(15.5), -1);
  near(phaseAtHour(16.5), -0.5);
  assert.equal(phaseAtHour(17.5), 0);
  assert.equal(phaseAtHour(17.9), 0);
  assert.equal(phaseAtHour(18), 0);
  near(phaseAtHour(18.625), 0.5);
  assert.equal(phaseAtHour(19.25), 1);
  assert.equal(phaseAtHour(23), 1);
  assert.equal(phaseAtHour(24), 1);
  assert.equal(phaseAtHour(-1), 1);
});

test('fase berubah mulus sepanjang hari dan selalu di dalam -1..1', () => {
  let prev = phaseAtHour(0);
  for (let h = 0.01; h <= 24; h += 0.01) {
    const p = phaseAtHour(h);
    assert.ok(p >= -1 && p <= 1, `di luar rentang pada jam ${h}`);
    assert.ok(Math.abs(p - prev) < 0.02, `loncatan pada jam ${h}: ${prev} -> ${p}`);
    prev = p;
  }
});

test('mode tetap dan mode otomatis memakai jam asli di zona yang dipilih', () => {
  assert.equal(skyPhase('day', 123), -1);
  assert.equal(skyPhase('sunset', 123), 0);
  assert.equal(skyPhase('night', 123), 1);
  assert.equal(skyPhase('auto', utc(5), { zone: 'WIB' }), -1); // 12.00 WIB
  assert.equal(skyPhase('auto', utc(11), { zone: 'WIB' }), 0); // 18.00 WIB
  assert.equal(skyPhase('auto', utc(11), { zone: 'WIT' }), 1); // 20.00 WIT
  near(skyPhase('auto', utc(11), { zone: 'WITA' }), 0.896, 1e-3); // 19.00 WITA
  assert.equal(skyPhase('mode-aneh', utc(5), { zone: 'WIB' }), -1);
});

test('mode siklus cepat memetakan satu hari penuh ke satu putaran', () => {
  assert.equal(skyPhase('cycle', 0, { cycle: 1000 }), 1); // jam 00
  assert.equal(skyPhase('cycle', 500, { cycle: 1000 }), -1); // jam 12
  near(skyPhase('cycle', 250, { cycle: 1000 }), phaseAtHour(6));
  assert.equal(skyPhase('cycle', 1500, { cycle: 1000 }), skyPhase('cycle', 500, { cycle: 1000 }));
  assert.equal(skyPhase('cycle', -500, { cycle: 1000 }), skyPhase('cycle', 500, { cycle: 1000 }));
  assert.ok(DEMO_CYCLE_MS > 0);
});

test('splitPhase memecah fase menjadi malam dan siang', () => {
  assert.deepEqual(splitPhase(-0.4), { night: 0, day: 0.4 });
  assert.deepEqual(splitPhase(0.3), { night: 0.3, day: 0 });
});

test('blendSky mencampur keyframe siang, senja, dan malam', () => {
  const frames = {
    day: { a: 0, v: [0, 10] },
    sunset: { a: 10, v: [10, 20] },
    night: { a: 20, v: [20, 40] },
  };
  assert.deepEqual(blendSky(frames, -1), frames.day);
  assert.deepEqual(blendSky(frames, 0), frames.sunset);
  assert.deepEqual(blendSky(frames, 1), frames.night);
  assert.deepEqual(blendSky(frames, -0.5), { a: 5, v: [5, 15] });
  assert.deepEqual(blendSky(frames, 0.5), { a: 15, v: [15, 30] });
  assert.deepEqual(blendSky(frames, 2), frames.night);
  assert.deepEqual(blendSky(frames, -3), frames.day);
});

test('pelacak fase bergerak halus dan melapor hanya saat berubah berarti', () => {
  const t = createPhaseTracker({ mode: 'day' });
  assert.equal(t.phase, -1);
  assert.equal(t.tick(0), true); // pemanggilan pertama selalu menerapkan
  assert.equal(t.tick(16), false);
  t.setMode('night');
  assert.equal(t.mode, 'night');
  assert.equal(t.tick(1016), true);
  near(t.phase, -0.75);
  for (let i = 0; i < 100; i++) t.tick(1016 + (i + 1) * 250);
  assert.equal(t.phase, 1);
});

test('parameter URL: zona waktu dan mode langit', () => {
  assert.equal(zoneFromSearch('?tz=WITA'), 'WITA');
  assert.equal(zoneFromSearch('?tz=wit'), 'WIT');
  assert.equal(zoneFromSearch('?tz=+8'), 8);
  assert.equal(zoneFromSearch('?tz=99'), undefined);
  assert.equal(zoneFromSearch('?tz=abc'), undefined);
  assert.equal(zoneFromSearch(''), undefined);
  assert.equal(skyModeFromSearch('?sky=night'), 'night');
  assert.equal(skyModeFromSearch('?sky=DAY'), 'day');
  assert.equal(skyModeFromSearch('?sky=hujan'), 'auto');
  assert.equal(skyModeFromSearch(''), 'auto');
  assert.equal(skyModeFromSearch('?sky=cycle', ['auto', 'night']), 'auto');
  assert.ok(DAY_MODES.includes('auto'));
});
