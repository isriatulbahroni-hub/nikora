import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, leftOf } from './highway.js';
import { MIN_DURATION_S, buildJourney, frameAt } from './journey.js';
import { startState } from './journey-drive.js';
import { BOUNDS as VILLA_BOUNDS } from './villa-layout.js';
import { LANE, alongOf, endPoint, gatePsi, localToWorld, planeBeyond, planeBehind, poseAt, startCheck, stepRide, villaAnchor, worldToLocal, wrap } from './hotel-journey-math.js';

const APPROACH = { gap: 26, pad: 2.4 }; // sama dengan VILLA_APPROACH di hotel-villa.js

test('gerbang: lokal <-> dunia saling berbalik', () => {
  for (const g of GATES) {
    for (const [lx, lz] of [[0, 0], [3, 40], [-12, 900], [50, -20]]) {
      const w = localToWorld(g, lx, lz);
      const l = worldToLocal(g, w.x, w.z);
      assert.ok(Math.hypot(l.x - lx, l.z - lz) < 1e-6, `${g.id} ${lx},${lz}`);
    }
  }
});

test('rute dipasang di gerbang: awal rute = titik gerbang dan arahnya keluar dari hotel', () => {
  for (const g of GATES) {
    const j = buildJourney(g.id);
    const w = localToWorld(g, 0, 0);
    assert.ok(Math.hypot(w.x - g.x, w.z - g.z) < 1e-9);
    const p = poseAt(g, j, 0, 0); // sumbu jalan
    assert.ok(Math.hypot(p.x - g.x, p.z - g.z) < 1e-6);
    assert.ok(Math.abs(wrap(p.heading - gatePsi(g))) < 1e-6);
    const ahead = poseAt(g, j, 100, 0);
    const a = alongOf(g, ahead.x, ahead.z);
    assert.ok(a.s > 99 && Math.abs(a.lateral) < 1, `${g.id}: 100 m ke depan harus lurus keluar gerbang (${a.s}, ${a.lateral})`);
  }
});

test('jalan raya hotel menyambung ke rute tanpa loncatan (pose kontinu di s = 0)', () => {
  for (const g of GATES) {
    const j = buildJourney(g.id);
    const a = poseAt(g, j, -0.01);
    const b = poseAt(g, j, 0.01);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.05, g.id);
    assert.ok(Math.abs(wrap(a.heading - b.heading)) < 1e-6, g.id);
    const far = poseAt(g, j, -60);
    const al = alongOf(g, far.x, far.z);
    assert.ok(Math.abs(al.s + 60) < 1e-6, g.id);
    assert.ok(Math.abs(al.lateral + (-LANE)) < 1e-6 || Math.abs(Math.abs(al.lateral) - LANE) < 1e-6, `${g.id}: lajur kiri rute`);
  }
});

test('rute tidak berbalik melewati garis gerbang dalam 2 km pertama', () => {
  for (const g of GATES) {
    const j = buildJourney(g.id);
    for (let s = 0; s <= Math.min(2000, j.length); s += 20) {
      const p = poseAt(g, j, s, 0);
      assert.ok(alongOf(g, p.x, p.z).s > -5, `${g.id} s=${s}`);
    }
  }
});

test('villa di ujung rute: titik ujung jalan jatuh di (0, pagar + jarak) bingkai villa dan mobil menghadap pagar', () => {
  const g = GATES.find((x) => x.id === 'villa');
  const j = buildJourney('villa');
  const f = villaAnchor(g, j, VILLA_BOUNDS.maxZ, APPROACH);
  const end = endPoint(g, j);
  const lz = VILLA_BOUNDS.maxZ + APPROACH.gap;
  const w = { x: f.ox + lz * Math.sin(f.psi), z: f.oz + lz * Math.cos(f.psi) };
  assert.ok(Math.hypot(w.x - end.x, w.z - end.z) < 1e-6);
  // arah utara villa (-z lokal) di dunia harus sama dengan arah mobil di ujung rute
  const north = { x: -Math.sin(f.psi), z: -Math.cos(f.psi) };
  assert.ok(Math.hypot(north.x - Math.sin(end.heading), north.z - Math.cos(end.heading)) < 1e-6);
  assert.equal(f.y0, APPROACH.pad);
});

test('autopilot dari sebelum gerbang: tiba, tidak kurang dari 20 menit, dan tidak mundur', () => {
  for (const g of GATES) {
    const j = buildJourney(g.id);
    const st = startState(-80);
    st.v = 6;
    let last = st.s;
    let steps = 0;
    while (!st.arrived && st.t < 3600) {
      stepRide(j, st, 1 / 20);
      assert.ok(st.s >= last - 1e-9);
      last = st.s;
      steps++;
    }
    assert.ok(st.arrived, `${g.id} tidak tiba`);
    assert.ok(st.t >= MIN_DURATION_S, `${g.id}: ${(st.t / 60).toFixed(1)} menit`);
    assert.ok(steps > 0);
  }
});

test('syarat berangkat: dekat gerbang, searah, dan tidak terlalu ke samping', () => {
  const g = GATES.find((x) => x.id === 'hall');
  const left = leftOf(gatePsi(g));
  const base = { x: g.x - g.dir.x * 40, z: g.z - g.dir.z * 40, heading: gatePsi(g) };
  assert.equal(startCheck(g, base).ok, true);
  assert.ok(Math.abs(startCheck(g, base).s + 40) < 1e-6);
  assert.equal(startCheck(g, { ...base, heading: gatePsi(g) + Math.PI }).ok, false);
  assert.equal(startCheck(g, { ...base, x: base.x + left.x * 60, z: base.z + left.z * 60 }).ok, false);
  assert.equal(startCheck(g, { ...base, x: g.x - g.dir.x * 400, z: g.z - g.dir.z * 400 }).ok, false);
  assert.equal(startCheck(g, { ...base, x: g.x + g.dir.x * 200, z: g.z + g.dir.z * 200 }).ok, false);
});

test('bidang pemotong: sisi luar gerbang dan sisi hotel saling melengkapi', () => {
  for (const g of GATES) {
    const dist = (pl, x, z) => pl.nx * x + pl.nz * z + pl.c;
    const out = { x: g.x + g.dir.x * 10, z: g.z + g.dir.z * 10 };
    const inn = { x: g.x - g.dir.x * 10, z: g.z - g.dir.z * 10 };
    assert.ok(dist(planeBeyond(g), out.x, out.z) > 9.99 && dist(planeBehind(g), out.x, out.z) < -9.99);
    assert.ok(dist(planeBeyond(g), inn.x, inn.z) < -9.99 && dist(planeBehind(g), inn.x, inn.z) > 9.99);
  }
});

test('ujung rute tetap jauh dari hotel (perjalanan sungguhan) dan ketinggian ujung terhingga', () => {
  for (const g of GATES) {
    const j = buildJourney(g.id);
    const e = endPoint(g, j);
    assert.ok(Math.hypot(e.x - g.x, e.z - g.z) > 1500, g.id);
    assert.ok(Number.isFinite(frameAt(j, j.length).y));
  }
});
