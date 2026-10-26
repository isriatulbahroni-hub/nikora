import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES } from './highway.js';
import { buildJourney, frameAt } from './journey.js';
import { gatePsi, localToWorld, onRoute } from './hotel-journey-math.js';
import { SURFACE_CAP, createVehicle, setRoadProbe, stepVehicle } from './vehicle.js';

// Lorong perjalanan dipasang di luar jalan raya hotel, jadi surfaceAt() bawaan menganggapnya tanah (batas 10 m/s = 36 km/jam).
// onRoute() + setRoadProbe() membuat aspal lorong dikenali sebagai 'road' supaya mobil tidak melambat setelah gerbang.

test('aspal rute dikenali: sumbu dan 12 m dari sumbu ya, 60 m dari sumbu bukan', () => {
  for (const g of GATES) {
    const j = buildJourney(g.id);
    for (const s of [20, 300, 1500, 4000, j.length - 100]) {
      const f = frameAt(j, s);
      const p = localToWorld(g, f.x, f.z);
      assert.ok(onRoute(g, j, p.x, p.z), `${g.id} s=${s} di sumbu jalan`);
      const lx = Math.cos(f.heading);
      const lz = -Math.sin(f.heading);
      const q = localToWorld(g, f.x + lx * 12, f.z + lz * 12); // masih di dalam 42 m aspal
      assert.ok(onRoute(g, j, q.x, q.z), `${g.id} s=${s} 12 m dari sumbu`);
      const far = localToWorld(g, f.x + lx * 60, f.z + lz * 60);
      assert.ok(!onRoute(g, j, far.x, far.z), `${g.id} s=${s} 60 m dari sumbu bukan aspal`);
    }
    assert.ok(!onRoute(g, j, g.x - g.dir.x * 30, g.z - g.dir.z * 30), `${g.id}: jauh sebelum gerbang diserahkan ke jalan raya hotel`);
  }
});

test('fisika: di aspal rute mobil tetap kencang; tanpa penanda jalan dibatasi seperti tanah', () => {
  const g = GATES.find((x) => x.id === 'villa');
  const j = buildJourney('villa');
  const f = frameAt(j, 600);
  const p = localToWorld(g, f.x, f.z);
  const drive = () => {
    const v = createVehicle({ id: 'u', x: p.x, z: p.z, heading: gatePsi(g) + f.heading, model: 'royale' });
    v.engine = true;
    v.speed = 25;
    for (let i = 0; i < 120; i++) stepVehicle(v, { throttle: 1, steer: 0 }, 1 / 60, { surfaceAt: () => 'ground', colliders: [], limit: { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 } });
    return v.speed;
  };
  setRoadProbe(null);
  assert.ok(drive() <= SURFACE_CAP.ground + 1, 'tanpa penanda: dibatasi seperti tanah');
  setRoadProbe((x, z) => onRoute(g, j, x, z));
  const kencang = drive();
  setRoadProbe(null);
  assert.ok(kencang > 20, `di aspal rute tetap kencang (${kencang.toFixed(1)} m/s)`);
});
