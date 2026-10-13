import test from 'node:test';
import assert from 'node:assert/strict';
import { TIER_COUNT, createQualityGovernor, settingsFor } from './quality.js';

const run = (gov, frameMs, count, start) => {
  let t = start;
  let change = null;
  for (let i = 0; i < count; i++) { t += frameMs; change = gov.tick(t) ?? change; }
  return { t, change };
};

test('settingsFor: resolusi turun bertahap, bayangan mati di tingkat terendah, tak pernah melebihi perangkat', () => {
  assert.deepEqual(settingsFor(0, 3, 1.75), { tier: 0, ratio: 1.75, shadows: true });
  assert.equal(settingsFor(1, 3, 1.75).ratio, 1.25);
  assert.equal(settingsFor(2, 3, 1.75).ratio, 1);
  assert.deepEqual(settingsFor(3, 3, 1.75), { tier: 3, ratio: 0.75, shadows: false });
  assert.equal(settingsFor(1, 1, 1.75).ratio, 1, 'layar 1x tidak dinaikkan');
});

test('governor: bingkai lambat menurunkan kualitas sampai lancar, lalu stabil', () => {
  const gov = createQualityGovernor({ deviceRatio: 2, cap: 1.75 });
  gov.tick(0);
  let { t, change } = run(gov, 40, 200, 0); // 25 fps
  assert.ok(gov.tier >= 1, `tier=${gov.tier}`);
  assert.ok(change.ratio < 1.75);
  ({ t } = run(gov, 40, 3000, t));
  assert.equal(gov.tier, TIER_COUNT - 1, 'tidak melewati tingkat terendah');
});

test('governor: perangkat cepat tetap di tingkat 0; hentakan/tab tersembunyi tidak dihitung', () => {
  const gov = createQualityGovernor({ deviceRatio: 2 });
  gov.tick(0);
  let { t } = run(gov, 16.7, 600, 0);
  assert.equal(gov.tier, 0);
  gov.tick(t + 5000); // tab tersembunyi 5 detik
  run(gov, 16.7, 100, t + 5000);
  assert.equal(gov.tier, 0);
});

test('governor: naik lagi pelan-pelan setelah perangkat lancar, tidak di bawah batas bawah (video aktif)', () => {
  const gov = createQualityGovernor({ deviceRatio: 2 });
  gov.tick(0);
  let { t } = run(gov, 40, 400, 0);
  const low = gov.tier;
  assert.ok(low >= 1);
  ({ t } = run(gov, 10, 8000, t));
  assert.ok(gov.tier < low, 'kualitas naik kembali');
  const floorChange = gov.setFloor(1);
  assert.ok(gov.tier >= 1);
  run(gov, 10, 20000, t);
  assert.ok(gov.tier >= 1, 'tidak turun di bawah batas bawah');
  assert.equal(gov.setFloor(1), null);
  assert.equal(floorChange === null || floorChange.tier >= 1, true);
});
