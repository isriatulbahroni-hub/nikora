import assert from 'node:assert/strict';
import test from 'node:test';
import { GARDEN, gardenProps, moonReflectionPoint, nearestFountain, poolInside, waterGain } from './masjid-garden-data.js';
import { getMasjidWorld } from './masjid-layout.js';

const world = getMasjidWorld();

test('pantulan bulan: titik jatuh searah bulan dari kamera, dan hilang bila bulan di bawah cakrawala', () => {
  const moon = { x: 0.64, y: 0.25, z: -0.76 };
  const p = moonReflectionPoint({ x: 40, y: 5, z: 232 }, moon, 0.62);
  assert.ok(p, 'ada titik pantul');
  // dari mata (tinggi 4,38 di atas air) ke titik pantul: sudut turun sama dengan sudut naik bulan
  const horiz = Math.hypot(p.x - 40, p.z - 232);
  const drop = (5 - 0.62) / horiz;
  const rise = moon.y / Math.hypot(moon.x, moon.z);
  assert.ok(Math.abs(drop - rise) < 1e-9, `sudut ${drop} vs ${rise}`);
  assert.ok(p.x > 40 && p.z < 232, 'ke arah timur laut (searah bulan)');
  assert.equal(moonReflectionPoint({ x: 0, y: 5, z: 0 }, { x: 1, y: -0.2, z: 0 }, 0), null);
  assert.equal(moonReflectionPoint({ x: 0, y: 0.3, z: 0 }, moon, 0.62), null, 'kamera di bawah permukaan air');
});

test('pantulan di kolam: penuh di dalam air, memudar di tepi, nol di luar', () => {
  assert.equal(poolInside(GARDEN.pool.x, GARDEN.z), 1);
  assert.equal(poolInside(-GARDEN.pool.x, GARDEN.z), 1, 'kolam kembar di barat');
  const edge = poolInside(GARDEN.pool.x + GARDEN.pool.waterHx + 1, GARDEN.z);
  assert.ok(edge > 0 && edge < 1, `tepi memudar: ${edge}`);
  assert.equal(poolInside(0, 100), 0);
});

test('suara air: penuh dekat pancuran, mengecil dengan jarak, hening jauh', () => {
  assert.ok(waterGain(5) > waterGain(30) && waterGain(30) > waterGain(55));
  assert.equal(waterGain(60), 0);
  assert.equal(waterGain(500), 0);
  assert.equal(waterGain(Number.NaN), 0);
  assert.ok(waterGain(0, 0.1) <= 0.1);
  assert.ok(Math.abs(nearestFountain(52, 202)) < 1e-9);
  assert.ok(nearestFountain(0, 0) > 150, 'jauh dari taman = hening');
});

test('bangku gazebo: ada dua per gazebo, saling berhadapan, tengah dan pintu masuk tetap lapang', () => {
  for (const sx of [-1, 1]) {
    const seats = gardenProps().filter((p) => p.type === 'gseat' && Math.sign(p.x) === sx);
    assert.equal(seats.length, 2);
    assert.equal(seats[0].face, -seats[1].face);
    const gx = sx * GARDEN.gazebo.x;
    assert.ok(world.canStand(gx, GARDEN.z), 'pusat gazebo');
    assert.ok(!world.canStand(gx, GARDEN.z - 2.2), 'bangku utara menghalangi');
    assert.ok(!world.canStand(gx, GARDEN.z + 2.2), 'bangku selatan menghalangi');
    // masuk dari kolam: lewat sisi barat/timur gazebo antara dua tiang
    const entry = gx - sx * (GARDEN.gazebo.post + 2);
    assert.ok(world.canStand(entry, GARDEN.z), 'depan pintu gazebo');
    assert.ok(world.canStand(gx - sx * GARDEN.gazebo.post, GARDEN.z), 'di antara dua tiang');
  }
});
