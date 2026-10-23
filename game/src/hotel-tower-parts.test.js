import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_TOP_Y, PODIUM_LEVELS, hotelLevelY, isSkyLobbyLevel } from './hotel-layout.js';
import { TOWER_ZONES, crownSpec, diagridSegments, edgeSegments, podiumWingTriangles, skinRings } from './hotel-tower-shape.js';
import { SATELLITES, satelliteRings } from './hotel-satellites.js';
import { BAY_WIDTH, beamTransform, capData, loftData, ridgeSegments, satelliteBodyBoxes, skyBeltBoxes, towerBodyBoxes, wingData } from './hotel-tower-parts.js';

const tri = (arr, i) => [0, 1, 2].map((k) => [arr[(i * 3 + k) * 3], arr[(i * 3 + k) * 3 + 1], arr[(i * 3 + k) * 3 + 2]]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('loft kulit: 8 bidang per zona, dua segitiga tiap bidang, atribut sama panjang', () => {
  const rings = skinRings();
  const d = loftData(rings);
  assert.equal(d.count, TOWER_ZONES * 8);
  assert.equal(d.positions.length, d.count * 6 * 3);
  assert.equal(d.normals.length, d.positions.length);
  assert.equal(d.uvs.length, d.count * 6 * 2);
  assert.ok(d.positions.every(Number.isFinite) && d.normals.every(Number.isFinite) && d.uvs.every(Number.isFinite));
});

test('loft kulit: setiap segitiga menghadap keluar (urutan titik dan normal) dari sumbu menara', () => {
  const rings = skinRings();
  const d = loftData(rings);
  const cx = rings[0].pts.reduce((s, p) => s + p[0], 0) / 8;
  const cz = rings[0].pts.reduce((s, p) => s + p[1], 0) / 8;
  for (let t = 0; t < d.count * 2; t++) {
    const [a, b, c] = tri(d.positions, t);
    const n = cross(sub(b, a), sub(c, a));
    const out = [(a[0] + b[0] + c[0]) / 3 - cx, 0, (a[2] + b[2] + c[2]) / 3 - cz];
    assert.ok(dot(n, out) > 0, `segitiga ${t} menghadap keluar menurut urutan titik`);
    const nn = tri(d.normals, t)[0];
    assert.ok(dot(nn, out) > 0, `normal segitiga ${t} menghadap keluar`);
    assert.ok(Math.abs(Math.hypot(...nn) - 1) < 1e-9, 'normal satuan');
  }
});

test('loft kulit: bay diulang dalam bilangan bulat, tinggi ruas 210 m = 50 lantai', () => {
  const d = loftData(skinRings());
  const us = d.uvs.filter((_, i) => i % 2 === 0);
  const vs = d.uvs.filter((_, i) => i % 2 === 1);
  for (const x of [...us, ...vs]) assert.ok(Number.isInteger(x) && x >= 0, `uv ${x}`);
  assert.equal(Math.max(...vs), 50, 'satu ruas = 210 m = 50 lantai');
  assert.equal(Math.min(...vs.filter((x) => x > 0)), Math.round((hotelLevelY(50) - hotelLevelY(PODIUM_LEVELS)) / HOTEL_LEVEL_HEIGHT), 'ruas pertama (di atas podium) lebih pendek');
  assert.ok(Math.max(...us) >= Math.round(150 / BAY_WIDTH), 'sisi lebar punya banyak bay');
});

test('loft mahkota dan menara pendamping: juga menghadap keluar dan berhingga', () => {
  const crown = crownSpec().rings;
  const dc = loftData(crown);
  assert.equal(dc.count, (crown.length - 1) * 8);
  for (const s of SATELLITES) {
    const rings = satelliteRings(s);
    const d = loftData(rings);
    assert.equal(d.count, (rings.length - 1) * 8);
    for (let t = 0; t < d.count * 2; t++) {
      const [a, b, c] = tri(d.positions, t);
      assert.ok(dot(cross(sub(b, a), sub(c, a)), [(a[0] + b[0] + c[0]) / 3 - s.x, 0, (a[2] + b[2] + c[2]) / 3 - s.z]) > 0, `${s.id} segitiga ${t}`);
    }
  }
});

test('tutup atap: kipas segi delapan menghadap ke atas di ketinggian yang diminta', () => {
  const ring = skinRings().at(-1);
  const cap = capData(ring.pts, HOTEL_TOP_Y);
  assert.equal(cap.count, 8);
  for (let t = 0; t < cap.count; t++) {
    const [a, b, c] = tri(cap.positions, t);
    assert.equal(a[1], HOTEL_TOP_Y);
    assert.ok(cross(sub(b, a), sub(c, a))[1] > 0, `segitiga tutup ${t} menghadap ke atas`);
  }
});

test('batang: titik tengah, panjang, dan arah satuan; rusuk menara pendamping satu per sudut per ruas', () => {
  const t = beamTransform({ a: [0, 0, 0], b: [3, 4, 0] });
  assert.deepEqual(t.mid, [1.5, 2, 0]);
  assert.equal(t.length, 5);
  assert.deepEqual(t.dir, [0.6, 0.8, 0]);
  assert.deepEqual(beamTransform({ a: [1, 2, 3], b: [1, 2, 3] }).dir, [0, 1, 0]);
  for (const s of [...diagridSegments(), ...edgeSegments()]) {
    const b = beamTransform(s);
    assert.ok(b.length > 0 && Math.abs(Math.hypot(...b.dir) - 1) < 1e-9);
  }
  for (const s of SATELLITES) assert.equal(ridgeSegments(satelliteRings(s)).length, 6 * 8);
});

test('sayap podium: satu normal satuan per titik, jumlah sama dengan segitiga', () => {
  const tris = podiumWingTriangles();
  const w = wingData(tris);
  assert.equal(w.count, tris.length);
  assert.equal(w.positions.length, tris.length * 9);
  assert.equal(w.normals.length, w.positions.length);
  for (let i = 0; i < w.normals.length; i += 3) {
    const l = Math.hypot(w.normals[i], w.normals[i + 1], w.normals[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-9 || l === 0, `normal satuan atau nol (segitiga rusak): ${l}`);
  }
});

test('penghalang kamera: satu kotak per zona yang menutup kulit, dan satu kotak per menara pendamping', () => {
  const rings = skinRings();
  const boxes = towerBodyBoxes(rings);
  assert.equal(boxes.length, TOWER_ZONES);
  assert.equal(boxes[0].minY, hotelLevelY(PODIUM_LEVELS));
  assert.equal(boxes.at(-1).maxY, HOTEL_TOP_Y);
  boxes.forEach((b, i) => {
    assert.ok(b.minY < b.maxY && b.minX < b.maxX && b.minZ < b.maxZ);
    for (const [x, z] of rings[i].pts) assert.ok(x >= b.minX - 1e-9 && x <= b.maxX + 1e-9 && z >= b.minZ - 1e-9 && z <= b.maxZ + 1e-9, `kotak ${i} menutup cincin bawahnya`);
    if (i > 0) assert.equal(b.minY, boxes[i - 1].maxY);
  });
  const sat = satelliteBodyBoxes();
  assert.equal(sat.length, SATELLITES.length);
  sat.forEach((b, i) => {
    assert.equal(b.minY, 0);
    assert.equal(b.maxY, SATELLITES[i].height);
  });
});

test('sabuk Sky Lobby: delapan balok per Sky Lobby, tepat di sisi kulit dan searah sisinya', () => {
  const lobi = Array.from({ length: HOTEL_LEVEL_COUNT }, (_, l) => l).filter((l) => l > 0 && isSkyLobbyLevel(l));
  assert.ok(lobi.length >= 15, 'banyak Sky Lobby');
  const belts = skyBeltBoxes();
  assert.equal(belts.length, lobi.length * 8);
  const rings = skinRings();
  for (const b of belts) {
    assert.ok(b.y > hotelLevelY(PODIUM_LEVELS) && b.y < HOTEL_TOP_Y);
    assert.ok(b.sx > 0 && b.sy > 0 && b.sz > 0);
    // ujung-ujung balok (sumbu x lokal diputar ry) jatuh pada garis kulit: arah (cos ry, -sin ry) sejajar sisi, dan tengahnya di dalam kotak kulit terbesar
    const dx = Math.cos(b.ry);
    const dz = -Math.sin(b.ry);
    assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-12);
    const bound = rings[0].shape;
    assert.ok(b.x >= bound.x0 - 1e-9 && b.x <= bound.x1 + 1e-9 && b.z >= bound.z0 - 1e-9 && b.z <= bound.z1 + 1e-9);
  }
  // sisi utara (z paling kecil) memanjang searah sumbu x
  const lantai = belts.slice(0, 8);
  const utara = lantai.reduce((a, b) => (b.z < a.z ? b : a));
  assert.ok(Math.abs(Math.cos(utara.ry)) > 0.999, 'sisi utara searah sumbu x');
});
