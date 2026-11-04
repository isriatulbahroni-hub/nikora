import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOFS, coveredAt, eaveEdges, puddleSpots, roofCrossed, roofOver } from './rain-cover.js';
import { HOTEL_CANOPY } from './hotel-layout.js';

test('kanopi drop-off menaungi orang di bawahnya, area terbuka di sebelahnya tidak', () => {
  assert.equal(coveredAt(0, 1.7, 445), true, 'di bawah kanopi');
  assert.equal(coveredAt(0, 1.7, 420), false, 'halaman drop-off terbuka');
  assert.equal(coveredAt(0, HOTEL_CANOPY.height + 1, 445), false, 'di atas atap bukan di bawahnya');
  assert.equal(roofOver(0, 1.7, 445)?.id, 'dropoff');
});

test('kanopi parkir motor dan Royal Garage juga menaungi', () => {
  assert.equal(coveredAt(117, 1.5, 404), true, 'parkir motor');
  assert.equal(coveredAt(118, 1.5, 480), true, 'Royal Garage');
  assert.equal(coveredAt(60, 1.5, 404), false, 'parkir karyawan mobil tidak beratap');
});

test('tetes yang menembus atap tertangkap atap, tetes di bawah atap tidak lagi', () => {
  assert.equal(roofCrossed(0, 445, 7, 5)?.id, 'dropoff');
  assert.equal(roofCrossed(0, 420, 7, 5), null, 'area terbuka tidak ada atap');
  assert.equal(roofCrossed(0, 445, 3, 1), null, 'sudah di bawah atap');
});

test('setiap atap punya tinggi positif dan kanopi meneteskan di empat tepinya', () => {
  for (const r of ROOFS) assert.ok(r.y > 0 && r.rect.length === 4, r.id);
  const edges = eaveEdges();
  assert.equal(edges.length, 4 * ROOFS.filter((r) => r.drip).length);
  for (const e of edges) assert.ok(Math.hypot(e.nx, e.nz) === 1);
});

test('genangan deterministik, tidak di bawah atap, dan tidak berimpit', () => {
  const a = puddleSpots();
  assert.deepEqual(a, puddleSpots());
  assert.ok(a.length >= 12, `hanya ${a.length} genangan`);
  for (const p of a) assert.equal(coveredAt(p.x, 1, p.z), false);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) > a[i].r + a[j].r);
});
