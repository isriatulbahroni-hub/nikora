import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienceLevels, createHotelAmbience } from './hotel-ambience.js';

test('siang cerah: burung dan angin, tanpa jangkrik', () => {
  const l = ambienceLevels({ night: 0, rain: 0 });
  assert.equal(l.birds, 1);
  assert.equal(l.crickets, 0);
  assert.ok(l.wind > 0 && l.traffic > 0);
});

test('malam: jangkrik, tanpa burung', () => {
  const l = ambienceLevels({ night: 1, rain: 0 });
  assert.equal(l.birds, 0);
  assert.equal(l.crickets, 1);
});

test('hujan lebat: burung dan jangkrik diam, angin menguat', () => {
  const clear = ambienceLevels({ night: 0, rain: 0 });
  const rain = ambienceLevels({ night: 0, rain: 0.9 });
  assert.equal(rain.birds, 0);
  assert.ok(rain.wind > clear.wind);
  assert.equal(ambienceLevels({ night: 1, rain: 0.9 }).crickets, 0);
});

test('di dalam ruangan dan kabin mobil suara meredup', () => {
  const out = ambienceLevels({ night: 0 });
  const inside = ambienceLevels({ night: 0, indoor: 1 });
  const cabin = ambienceLevels({ night: 0, cabin: true });
  assert.ok(inside.birds < out.birds * 0.25);
  assert.ok(cabin.birds < out.birds && cabin.birds > inside.birds);
});

test('semua tingkat tetap di 0..1 walau masukan di luar jangkauan', () => {
  for (const a of [{ night: -5, rain: -1, indoor: -2 }, { night: 9, rain: 9, indoor: 9 }, {}]) {
    for (const v of Object.values(ambienceLevels(a))) assert.ok(v >= 0 && v <= 1);
  }
});

test('?suara=0 atau tanpa WebAudio: pembungkus kosong yang aman', () => {
  const a = createHotelAmbience({ search: '?suara=0' });
  assert.doesNotThrow(() => a.update({ night: 1 }));
  assert.equal(a.info().on, false);
  assert.doesNotThrow(() => a.dispose());
  const b = createHotelAmbience({ search: '' }); // Node tidak punya AudioContext
  assert.equal(b.info().on, false);
});
