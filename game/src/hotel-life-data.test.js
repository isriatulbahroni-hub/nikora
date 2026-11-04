import test from 'node:test';
import assert from 'node:assert/strict';
import { CARRIAGE_HALF, RING } from './highway.js';
import {
  KNOCKDOWN, LOOP, VEHICLE_HITBOX, birdPose, birdSpecs, birdVisibility, hitVehicle, knockDistance, knockdownPose, laneOffset, lanePath, lightLevel, makePath, roundedLoop, trafficPose, trafficSpecs,
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

test('hitVehicle: pemain di depan, samping, dan belakang badan kendaraan', () => {
  const car = { x: 100, z: 200, heading: 0 }; // maju = +z
  assert.deepEqual(hitVehicle(car, 'car', { x: 100, z: 200 }), { dirX: 0, dirZ: 1 }, 'tepat di badan: kena, didorong searah laju');
  assert.ok(hitVehicle(car, 'car', { x: 100, z: 202.5 }), 'di depan hidung mobil (dalam jari-jari pemain)');
  assert.equal(hitVehicle(car, 'car', { x: 100, z: 203.5 }), null, 'masih jauh di depan');
  assert.ok(hitVehicle(car, 'car', { x: 100 + 1.2, z: 200 }), 'menempel di samping badan');
  assert.equal(hitVehicle(car, 'car', { x: 100 + 2, z: 200 }), null, 'sudah di luar lebar mobil');
  assert.ok(hitVehicle(car, 'car', { x: 100, z: 197.5 }), 'di bumper belakang');
  assert.equal(hitVehicle(car, 'car', { x: 100, z: 196 }), null, 'di belakang bumper');
});

test('hitVehicle: mengikuti arah kendaraan (heading) dan arah dorong searah laju', () => {
  const east = { x: 0, z: 0, heading: Math.PI / 2 }; // maju = +x
  const hit = hitVehicle(east, 'car', { x: 2, z: 0 });
  assert.ok(hit);
  assert.ok(Math.abs(hit.dirX - 1) < 1e-9 && Math.abs(hit.dirZ) < 1e-9);
  assert.equal(hitVehicle(east, 'car', { x: 0, z: 2.5 }), null, 'di samping kendaraan yang menghadap timur, di luar lebar badan');
  assert.ok(hitVehicle(east, 'car', { x: 0, z: 1 }));
});

test('hitVehicle: bus dan truk lebih panjang daripada mobil dan motor', () => {
  const at = (kind, along) => hitVehicle({ x: 0, z: 0, heading: 0 }, kind, { x: 0, z: along });
  assert.equal(at('motor', 3), null);
  assert.equal(at('car', 4), null);
  assert.ok(at('bus', 5));
  assert.ok(at('truck', 4));
  assert.ok(VEHICLE_HITBOX.bus.front > VEHICLE_HITBOX.car.front);
  assert.ok(VEHICLE_HITBOX.motor.half < VEHICLE_HITBOX.car.half);
});

test('knockDistance: kendaraan cepat melempar lebih jauh, dibatasi 3..8 m', () => {
  assert.equal(knockDistance(1), 3);
  assert.equal(knockDistance(100), 8);
  assert.ok(knockDistance(15) < knockDistance(24));
});

test('knockdownPose: terlempar, terbaring, bangun, lalu selesai', () => {
  const { fly, lie, rise } = KNOCKDOWN;
  assert.equal(knockdownPose(0).phase, 'fly');
  assert.equal(knockdownPose(0).slide, 0);
  assert.equal(knockdownPose(fly - 0.01).phase, 'fly');
  assert.ok(knockdownPose(fly * 0.5).slide > 0.5, 'lemparan melambat: separuh waktu sudah lebih dari separuh jarak');
  assert.equal(knockdownPose(fly + 0.1).phase, 'lie');
  assert.equal(knockdownPose(fly + 0.1).lie, 1);
  assert.equal(knockdownPose(fly + lie + 0.1).phase, 'rise');
  assert.ok(knockdownPose(fly + lie + rise * 0.5).lie < 1);
  assert.equal(knockdownPose(fly + lie + rise + 0.01).phase, 'done');
  assert.equal(knockdownPose(fly + lie + rise + 0.01).lie, 0);
  let prev = 0;
  for (let t = 0; t <= fly; t += 0.05) {
    const p = knockdownPose(t);
    assert.ok(p.slide >= prev, 'slide tidak pernah mundur');
    prev = p.slide;
  }
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
