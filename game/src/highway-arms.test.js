import test from 'node:test';
import assert from 'node:assert/strict';
import { ARM_LENGTH, BARRIER_HALF, GATES, HIGHWAY_ARMS, HIGHWAY_HALF, HIGHWAY_LIMIT, HUB, RING, armAt, gateAt, highwayName, onHighway, roadBarrier } from './highway.js';
import { HOTEL_FORECOURT, surfaceAt } from './hotel-layout.js';
import { createVehicle, boardVehicle, stepVehicle } from './vehicle.js';
import { driveRoad } from './test-drive.js';

const DT = 1 / 60;
const env = { colliders: [], surfaceAt, limit: HIGHWAY_LIMIT, barrier: roadBarrier };
const armOf = (venue) => HIGHWAY_ARMS.find((a) => a.venue === venue);
const left = (p, t) => ({ x: p.x + p.tz * t, z: p.z - p.tx * t });

test('lengan: empat, panjang 3,5-4,2 km, berkelok (radius terkecil > 60 m, simpangan > 150 m), di dalam batas dunia', () => {
  assert.equal(HIGHWAY_ARMS.length, 4);
  for (const a of HIGHWAY_ARMS) {
    const L = a.road.length;
    assert.ok(L > 3500 && L < 4200, `${a.id} panjang ${L.toFixed(0)}`);
    assert.ok(a.road.minRadius > 60, `${a.id} radius terkecil ${a.road.minRadius.toFixed(0)}`);
    const dev = Math.max(...a.road.points.map((p) => Math.abs((p.x - a.start.x) * Math.abs(a.dir.z) + (p.z - a.start.z) * Math.abs(a.dir.x))));
    assert.ok(dev > 150, `${a.id} simpangan ${dev.toFixed(0)}`);
    for (const p of a.road.points) assert.ok(p.x - HIGHWAY_HALF > HIGHWAY_LIMIT.minX && p.x + HIGHWAY_HALF < HIGHWAY_LIMIT.maxX && p.z - HIGHWAY_HALF > HIGHWAY_LIMIT.minZ && p.z + HIGHWAY_HALF < HIGHWAY_LIMIT.maxZ, `${a.id} di dalam batas`);
    assert.ok(a.road.points.length > ARM_LENGTH / 9);
  }
});

test('lengan: pangkal menyambung lurus ke tepi Lingkar, ujung lurus 200 m menuju gerbang di tengah aspal', () => {
  const edges = { villa: { x: 0, z: RING.minZ - HIGHWAY_HALF }, hall: { x: RING.minX - HIGHWAY_HALF, z: HUB.z }, royal: { x: RING.maxX + HIGHWAY_HALF, z: HUB.z }, masjid: { x: 0, z: RING.maxZ + HIGHWAY_HALF } };
  for (const a of HIGHWAY_ARMS) {
    const e = edges[a.venue];
    assert.ok(Math.hypot(a.road.points[0].x - e.x, a.road.points[0].z - e.z) < 1e-6, `${a.id} pangkal`);
    const g = GATES.find((x) => x.venue === a.venue);
    assert.ok(Math.hypot(g.x - a.end.x, g.z - a.end.z) < 1e-6, `${a.id} gerbang di ujung`);
    assert.equal(surfaceAt(g.x, g.z), 'road');
    for (const p of a.road.points.filter((q) => q.s > a.road.length - 200)) assert.ok(Math.abs((p.x - a.end.x) * Math.abs(a.dir.z) + (p.z - a.end.z) * Math.abs(a.dir.x)) < 1e-6, `${a.id} 200 m terakhir lurus`);
  }
});

test('lengan tidak saling mendekat (> 150 m setelah 700 m pertama) dan nama jalan sesuai arah', () => {
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    let min = Infinity;
    for (const p of HIGHWAY_ARMS[i].road.points) {
      if (p.s < 700) continue;
      for (const q of HIGHWAY_ARMS[j].road.points) { if (q.s < 700) continue; min = Math.min(min, Math.hypot(p.x - q.x, p.z - q.z)); }
    }
    assert.ok(min > 150, `${HIGHWAY_ARMS[i].id} vs ${HIGHWAY_ARMS[j].id}: ${min.toFixed(0)} m`);
  }
  for (const a of HIGHWAY_ARMS) {
    const p = a.road.points[Math.floor(a.road.points.length / 2)];
    assert.equal(highwayName(p.x, p.z), a.name);
  }
});

test('permukaan: aspal selebar 34,5 m di sepanjang lengan, di luar itu tanah', () => {
  for (const a of HIGHWAY_ARMS) {
    for (let k = 20; k < a.road.points.length - 1; k += 37) {
      const p = a.road.points[k];
      assert.equal(surfaceAt(p.x, p.z), 'road', `${a.id} garis tengah`);
      const edge = left(p, HIGHWAY_HALF - 0.4);
      assert.equal(onHighway(edge.x, edge.z), true, `${a.id} tepi`);
      const out = left(p, HIGHWAY_HALF + 1.5);
      assert.equal(armAt(out.x, out.z), null, `${a.id} di luar aspal`);
      assert.equal(surfaceAt(out.x, out.z), 'ground');
    }
  }
});

test('pagar pengaman: bebas di aspal dan bahu, terbuka di pangkal (30 m) dan ujung (6 m), menahan di luar', () => {
  const a = armOf('villa');
  const p = a.road.points[Math.round(a.road.points.length / 2)];
  assert.equal(roadBarrier(p.x, p.z), null);
  const shoulder = left(p, HIGHWAY_HALF + 0.6);
  assert.equal(roadBarrier(shoulder.x, shoulder.z), null);
  const through = left(p, BARRIER_HALF + 5);
  const r = roadBarrier(through.x, through.z);
  assert.ok(r && Math.abs(r.depth - 5) < 0.2);
  assert.ok(Math.abs(Math.hypot(r.x - p.x, r.z - p.z) - BARRIER_HALF) < 0.5, 'dikoreksi ke garis pagar');
  assert.ok(r.nx * (p.x - through.x) + r.nz * (p.z - through.z) > 0, 'normal menghadap jalan');
  const q = left(a.road.points[2], BARRIER_HALF + 5);
  assert.equal(roadBarrier(q.x, q.z), null, 'terbuka di pangkal');
  const e = left(a.road.points.at(-1), BARRIER_HALF + 5);
  assert.equal(roadBarrier(e.x, e.z), null, 'terbuka di ujung (gerbang)');
  const far = left(p, 300);
  assert.equal(roadBarrier(far.x, far.z), null, 'jauh dari jalan: bebas');
});

test('menabrak pagar: mobil tidak menembus, melambat, dan terdorong sejajar jalan', () => {
  const a = armOf('hall');
  const p = a.road.points[Math.round(a.road.points.length * 0.4)];
  const v = createVehicle({ id: 'b', x: p.x, z: p.z, heading: Math.atan2(p.tz * 1, 0) });
  boardVehicle(v, 0, 'p');
  v.heading = Math.atan2(p.tz, -p.tx); // tegak lurus jalan, menuju sisi kiri jalan
  v.speed = 25;
  let hit = 0;
  for (let i = 0; i < 60 * 4; i++) {
    stepVehicle(v, { throttle: 1, steer: 0 }, DT, env);
    hit = Math.max(hit, v.hit);
    const n = a.road.nearest(v.x, v.z);
    if (n) assert.ok(Math.abs(n.lateral) <= BARRIER_HALF + 0.6, `menembus pagar: ${n.lateral.toFixed(1)}`);
  }
  assert.ok(hit > 5, 'ada benturan');
});

for (const venue of ['villa', 'hall', 'royal', 'masjid']) {
  test(`menyusuri lengan ${venue} dari Lingkar ke gerbang pada 22 m/s: tetap di aspal, memicu gerbang, 2-5 menit`, () => {
    const a = armOf(venue);
    const p0 = a.road.points[1];
    const v = createVehicle({ id: `d_${venue}`, x: p0.x, z: p0.z, heading: Math.atan2(a.dir.x, a.dir.z) });
    boardVehicle(v, 0, 'p');
    v.speed = 15;
    const stat = driveRoad(v, a.road, env, { speed: 22, done: (c) => gateAt(c.x, c.z)?.venue === venue });
    assert.ok(stat.finished, `sampai gerbang ${venue} dalam ${stat.t.toFixed(0)} dtk`);
    assert.equal(stat.offRoad, 0);
    assert.equal(stat.hits, 0, 'tidak menyentuh pagar');
    assert.ok(stat.t > 120 && stat.t < 300, `waktu ${stat.t.toFixed(0)} dtk`);
    assert.ok(stat.maxSlip < 0.15, `selip ${stat.maxSlip.toFixed(2)}`);
  });
}

test('pulang dari gerbang villa ke halaman drop-off hotel menyusuri lengan berkelok lalu Lingkar, tetap di aspal', () => {
  const a = armOf('villa');
  const g = a.road.points.at(-2);
  const v = createVehicle({ id: 'pulang', x: g.x, z: g.z, heading: Math.atan2(-a.dir.x, -a.dir.z) });
  boardVehicle(v, 0, 'p');
  v.speed = 15;
  const stat = driveRoad(v, a.road, env, { speed: 22, dir: -1, done: (c) => c.z > RING.minZ - HIGHWAY_HALF });
  assert.ok(stat.finished, `tiba di Lingkar (${stat.t.toFixed(0)} dtk)`);
  assert.equal(stat.offRoad, 0);
  assert.ok(v.z < HOTEL_FORECOURT[1], 'masih sebelum halaman drop-off');
});

test('terlalu kencang di tikungan: ban menyelip dan mobil menggesek pagar, tidak menembus', () => {
  const a = armOf('royal');
  const p0 = a.road.points[1];
  const v = createVehicle({ id: 'ngebut', x: p0.x, z: p0.z, heading: Math.atan2(a.dir.x, a.dir.z), model: 'argent' });
  boardVehicle(v, 0, 'p');
  v.speed = 30;
  const stat = driveRoad(v, a.road, env, { speed: 55, maxTime: 120, onStep: () => {} });
  assert.ok(stat.maxSlip > 0.2, `selip ${stat.maxSlip.toFixed(2)}`);
  assert.ok(stat.maxLateral < BARRIER_HALF + 1, `lateral ${stat.maxLateral.toFixed(1)}`);
});
