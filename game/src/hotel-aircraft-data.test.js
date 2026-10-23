import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, CITY_MAX_HEIGHT, clearanceToSatellite, orbitPose } from './hotel-aircraft-data.js';
import { SATELLITES } from './hotel-surroundings-data.js';

test('pesawat: semua terbang di atas gedung kota tertinggi', () => {
  for (const o of AIRCRAFT) assert.ok(o.altitude - o.bob > CITY_MAX_HEIGHT + 40, `${o.id} terlalu rendah: ${o.altitude - o.bob}`);
});

test('pesawat: tidak menembus menara satelit (jarak mendatar cukup atau di atas puncaknya)', () => {
  for (const o of AIRCRAFT) for (const s of SATELLITES) {
    const clear = clearanceToSatellite(o, s) >= 25 || o.altitude - o.bob > s.height + 40;
    assert.ok(clear, `${o.id} dekat ${s.id}: ${clearanceToSatellite(o, s).toFixed(0)} m`);
  }
});

test('orbit: posisi tepat pada jari-jari, periode penuh kembali ke titik awal, dan menghadap arah gerak', () => {
  for (const o of AIRCRAFT) {
    const p0 = orbitPose(o, 0);
    const p1 = orbitPose(o, Math.abs(o.period));
    assert.ok(Math.hypot(p0.x - p1.x, p0.z - p1.z) < 1e-6, `${o.id} tidak kembali`);
    for (const t of [0, 13, 77, 140]) {
      const p = orbitPose(o, t);
      assert.ok(Math.abs(Math.hypot(p.x - o.cx, p.z - o.cz) - o.radius) < 1e-6);
      const q = orbitPose(o, t + 0.01);
      const vx = q.x - p.x;
      const vz = q.z - p.z;
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      assert.ok((vx * fx + vz * fz) / Math.hypot(vx, vz) > 0.999, `${o.id} tidak menghadap arah gerak di t=${t}`);
      assert.ok(Math.abs(p.y - o.altitude) <= o.bob + 1e-9);
    }
  }
});

test('orbit: periode negatif berputar berlawanan arah dan kecepatan masuk akal', () => {
  const o = AIRCRAFT.find((x) => x.period < 0);
  assert.ok(o);
  const a = orbitPose(o, 0);
  const b = orbitPose(o, 1);
  const cross = (a.x - o.cx) * (b.z - o.cz) - (a.z - o.cz) * (b.x - o.cx);
  const pos = AIRCRAFT.find((x) => x.period > 0 && x.kind === 'heli');
  const c = orbitPose(pos, 0);
  const d = orbitPose(pos, 1);
  const cross2 = (c.x - pos.cx) * (d.z - pos.cz) - (c.z - pos.cz) * (d.x - pos.cx);
  assert.ok(cross * cross2 < 0, 'arah putar berlawanan');
  for (const x of AIRCRAFT) assert.ok(orbitPose(x, 0).speed > 3 && orbitPose(x, 0).speed < 120, `${x.id} ${orbitPose(x, 0).speed}`);
});
