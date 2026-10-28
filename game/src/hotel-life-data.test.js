import test from 'node:test';
import assert from 'node:assert/strict';
import { CARRIAGE_HALF, RING } from './highway.js';
import {
  LOOP, birdPose, birdSpecs, birdVisibility, laneOffset, lanePath, lightLevel, makePath, proximityScale, roundedLoop, trafficPose, trafficSpecs,
} from './hotel-life-data.js';

const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p.x * q.z - q.x * p.z); }, 0) / 2;

test('LOOP mengikuti Lingkar NIKORA', () => {
  assert.equal(LOOP.cx, (RING.minX + RING.maxX) / 2);
  assert.equal(LOOP.cz, (RING.minZ + RING.maxZ) / 2);
  assert.equal(LOOP.a, 176);
});

test('pusat lajur ada di dalam badan jalan, lajur 0 terdekat median', () => {
  assert.ok(Math.abs(laneOffset(0) - 4.375) < 1e-9);
  assert.ok(laneOffset(3) < CARRIAGE_HALF);
  assert.ok(laneOffset(1) > laneOffset(0));
});

test('roundedLoop: searah jarum jam di peta (luas positif di x timur, z selatan); ccw kebalikannya', () => {
  assert.ok(area(roundedLoop(LOOP, false)) > 0);
  assert.ok(area(roundedLoop(LOOP, true)) < 0);
  assert.equal(roundedLoop(LOOP, false, 8).length, 36);
});

test('makePath: panjang mendekati keliling persegi bulat, dan melingkar', () => {
  const path = makePath(roundedLoop(LOOP, false, 16));
  const expected = 2 * (2 * LOOP.a - 2 * LOOP.r) + 2 * (2 * LOOP.b - 2 * LOOP.r) + 2 * Math.PI * LOOP.r;
  assert.ok(Math.abs(path.length - expected) / expected < 0.01);
  const a = path.at(10);
  const b = path.at(10 + path.length);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6);
  const c = path.at(-path.length + 10);
  assert.ok(Math.hypot(a.x - c.x, a.z - c.z) < 1e-6);
});

test('lalu lintas di sisi KIRI: garis tengah jalan ada di sisi kanan mobil, di kedua arah', () => {
  for (const ccw of [false, true]) {
    for (const k of [0, 3]) {
      const path = lanePath(k, ccw);
      const d = laneOffset(k);
      let straight = 0;
      for (let u = 0; u < path.length; u += 7) {
        const p = path.at(u);
        const aligned = Math.abs((p.heading * 2) / Math.PI - Math.round((p.heading * 2) / Math.PI)) < 1e-9;
        if (!aligned) continue;
        straight++;
        const right = { x: -Math.cos(p.heading), z: Math.sin(p.heading) }; // kebalikan leftOf(h) di highway.js
        const q = { x: p.x + right.x * d, z: p.z + right.z * d };
        const onCenter = Math.abs(Math.abs(q.z - LOOP.cz) - LOOP.b) < 1e-6 || Math.abs(Math.abs(q.x - LOOP.cx) - LOOP.a) < 1e-6;
        assert.ok(onCenter, `lajur ${k} ccw=${ccw} u=${u}`);
      }
      assert.ok(straight > 20);
    }
  }
});

test('trafficSpecs: 24 mobil bawaan, sejalur berkecepatan sama dan berjarak jauh', () => {
  const specs = trafficSpecs();
  assert.equal(specs.length, 24);
  assert.equal(trafficSpecs({ lanes: 2, perLane: 2 }).length, 8);
  for (const ccw of [false, true]) {
    for (let k = 0; k < 4; k++) {
      const lane = specs.filter((s) => s.lane === k && s.ccw === ccw);
      assert.equal(new Set(lane.map((s) => s.speed)).size, 1);
      const L = lanePath(k, ccw).length;
      const us = lane.map((s) => s.u0).sort((x, y) => x - y);
      for (let i = 0; i < us.length; i++) {
        const gap = i + 1 < us.length ? us[i + 1] - us[i] : us[0] + L - us[i];
        assert.ok(gap >= 60, `jarak antar mobil ${gap}`);
      }
    }
  }
  assert.ok(specs.find((s) => s.lane === 0).speed > specs.find((s) => s.lane === 3).speed);
});

test('trafficPose: bergerak maju sepanjang waktu dan tetap di jalur', () => {
  const s = trafficSpecs()[0];
  const a = trafficPose(s, 0);
  const b = trafficPose(s, 1);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - s.speed) < s.speed * 0.2);
  assert.ok(Number.isFinite(a.heading));
});

test('proximityScale: hilang dekat pemain, penuh jauh, naik teratur', () => {
  assert.equal(proximityScale(0), 0);
  assert.equal(proximityScale(34), 0);
  assert.equal(proximityScale(60), 1);
  assert.equal(proximityScale(500), 1);
  assert.ok(proximityScale(40) < proximityScale(50));
});

test('lightLevel: siang cerah padam, malam menyala, hujan lebat menyalakan', () => {
  assert.equal(lightLevel(0, 0), 0);
  assert.equal(lightLevel(1, 0), 1);
  assert.ok(lightLevel(0, 0.9) > 0.5);
  assert.ok(lightLevel(0, 0.1) < 0.05);
});

test('burung: di luar tapak hotel, jari-jari terjaga, hilang saat malam dan hujan', () => {
  const birds = birdSpecs();
  assert.equal(birds.length, 16);
  for (const b of birds) {
    assert.ok(b.radius >= 200 && b.radius <= 340);
    const p = birdPose(b, 123.4);
    assert.ok(Math.abs(Math.hypot(p.x, p.z - 448) - b.radius) < 1e-6);
    assert.ok(p.y > 20 && p.y < 110);
    assert.ok(Math.abs(p.flap) <= 0.7 + 1e-9);
  }
  assert.equal(birdVisibility(0, 0), 1);
  assert.equal(birdVisibility(1, 0), 0);
  assert.equal(birdVisibility(0, 0.5), 0);
});
