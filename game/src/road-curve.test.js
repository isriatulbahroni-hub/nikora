import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurvedRoad, smoothstep } from './road-curve.js';

const road = () => buildCurvedRoad({ start: { x: 100, z: 0 }, dir: { x: 0, z: -1 }, length: 2000, waves: [{ amp: 200, wl: 1100, phase: 0.5 }], taperIn: 400, taperOut: 400, flatEnd: 150 });

test('smoothstep: 0..1 dengan ujung datar', () => {
  assert.equal(smoothstep(-1), 0);
  assert.equal(smoothstep(2), 1);
  assert.equal(smoothstep(0.5), 0.5);
});

test('jalan lengkung: awal dan ujung lurus di sumbu, tengah menyimpang jauh', () => {
  const r = road();
  const p = r.points;
  assert.ok(Math.abs(p[0].x - 100) < 1e-9 && Math.abs(p[0].z) < 1e-9);
  assert.ok(Math.abs(p.at(-1).x - 100) < 1e-6, 'ujung kembali ke sumbu');
  assert.ok(p.filter((q) => q.s > r.length - 150).every((q) => Math.abs(q.x - 100) < 1e-6), '150 m terakhir lurus');
  assert.ok(Math.max(...p.map((q) => Math.abs(q.x - 100))) > 100, 'ada simpangan besar');
  assert.ok(Math.abs(p[0].tx) < 0.1 && p[0].tz < -0.99, 'awal searah sumbu');
  assert.ok(r.length > 2000 && r.length < 2600, `panjang ${r.length}`);
  assert.ok(r.minRadius > 50, `radius terkecil ${r.minRadius}`);
});

test('nearest: di garis tengah lateral 0, di sisi kiri + dan kanan -, jauh = null', () => {
  const r = road();
  const q = r.points[100];
  const on = r.nearest(q.x, q.z);
  assert.ok(on.dist < 1e-6 && Math.abs(on.lateral) < 1e-6 && Math.abs(on.s - q.s) < 1e-6);
  const left = { x: q.x + q.tz * 10, z: q.z - q.tx * 10 }; // (tz, -tx) = kiri
  assert.ok(Math.abs(r.nearest(left.x, left.z).lateral - 10) < 0.2);
  const right = { x: q.x - q.tz * 10, z: q.z + q.tx * 10 };
  assert.ok(Math.abs(r.nearest(right.x, right.z).lateral + 10) < 0.2);
  assert.equal(r.nearest(5000, 5000), null);
  assert.equal(r.nearest(q.x + q.tz * 400, q.z - q.tx * 400), null);
});

test('nearest: sama dengan pencarian brute-force pada titik acak', () => {
  const r = road();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 300; k++) {
    const p = r.points[Math.floor(rnd() * (r.points.length - 1))];
    const x = p.x + (rnd() - 0.5) * 60;
    const z = p.z + (rnd() - 0.5) * 60;
    const f = r.nearest(x, z);
    let best = Infinity;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i]; const b = r.points[i + 1];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
    assert.ok(f && Math.abs(f.dist - best) < 1e-6, `${f?.dist} vs ${best}`);
  }
});

test('radius bertanda: kiri positif, kanan negatif; mengikuti arah belokan', () => {
  const r = road();
  const signs = new Set();
  for (let i = 40; i < r.points.length - 40; i += 5) { const v = r.signedRadius(i); if (Number.isFinite(v) && Math.abs(v) < 2000) signs.add(Math.sign(v)); }
  assert.ok(signs.has(1) && signs.has(-1), 'ada tikungan kiri dan kanan');
});
