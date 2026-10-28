import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_S, JOURNEYS, MAX_GRADE, MIN_CLEARANCE, MIN_DURATION_S, MIN_RADIUS, ROAD, SEGMENTS, bridgeAt, buildJourney, distanceAt, eventsOf, frameAt,
  journeyIds, routeIsClear, searchAttempt, localClearance, BRIDGE_CLEARANCE, LAKE_CLEARANCE, nearestOnRoute, segmentAt, selfClearance, terrainHeight, timeAt, waterLevelOf,
} from './journey.js';

const ids = journeyIds();

test('ada rute untuk keempat tempat acara dan tiap rute berbeda', () => {
  assert.deepEqual(ids.sort(), ['hall', 'masjid', 'royal', 'villa']);
  const ends = new Set(ids.map((v) => { const j = buildJourney(v); return `${Math.round(j.xs[j.n - 1])},${Math.round(j.zs[j.n - 1])}`; }));
  assert.equal(ends.size, 4);
});

test('durasi pada kecepatan jelajah minimal 20 menit dan lima bagian berurutan menutup seluruh rute', () => {
  for (const v of ids) {
    const j = buildJourney(v);
    assert.ok(j.duration >= MIN_DURATION_S, `${v}: ${j.duration}`);
    assert.equal(j.bounds.length, SEGMENTS.length);
    assert.equal(j.bounds[0].s0, 0);
    for (let i = 1; i < j.bounds.length; i++) assert.equal(j.bounds[i].s0, j.bounds[i - 1].s1);
    assert.equal(j.bounds.at(-1).s1, j.length);
    assert.ok(Math.abs(timeAt(j, j.length) - j.duration) < 1e-6);
    assert.ok(Math.abs(distanceAt(j, timeAt(j, 5000)) - 5000) < 1e-6);
  }
});

test('tikungan tajam tetap aman: radius >= batas dan kemiringan <= 10%', () => {
  for (const v of ids) {
    const j = buildJourney(v);
    for (let i = 0; i < j.n; i++) {
      assert.ok(Math.abs(j.ks[i]) <= 1 / MIN_RADIUS + 1e-6, `${v} kelengkungan @${i}`);
      assert.ok(Math.abs(j.gs[i]) <= MAX_GRADE + 1e-6, `${v} kemiringan @${i}`);
    }
  }
});

test('rute banyak pengkolan: puluhan perubahan arah kiri-kanan dan beberapa tikungan tajam', () => {
  for (const v of ids) {
    const j = buildJourney(v);
    let flips = 0;
    let hairpins = 0;
    let prev = 0;
    let inHairpin = false;
    for (let i = 0; i < j.n; i++) {
      const sg = Math.abs(j.ks[i]) > 1 / 400 ? Math.sign(j.ks[i]) : 0;
      if (sg && prev && sg !== prev) flips++;
      if (sg) prev = sg;
      const tight = Math.abs(j.ks[i]) > 0.9 / MIN_RADIUS;
      if (tight && !inHairpin) hairpins++;
      inHairpin = tight;
    }
    assert.ok(flips >= 25, `${v}: ${flips} pergantian arah`);
    assert.ok(hairpins >= 3, `${v}: ${hairpins} tikungan tajam`);
  }
});

test('nomor percobaan benih yang tertanam adalah yang pertama lolos syarat ruang (berubah bila generator diubah: jalankan searchAttempt)', () => {
  for (const v of ids) {
    assert.ok(routeIsClear(buildJourney(v)), v);
    assert.equal(searchAttempt(v), JOURNEYS[v].attempt, v);
  }
});

test('rute tidak menabrak atau menempel pada dirinya sendiri', () => {
  for (const v of ids) assert.ok(selfClearance(buildJourney(v)) >= MIN_CLEARANCE, v);
});

test('rute deterministik: dua kali bangun hasilnya sama', () => {
  const a = buildJourney('villa');
  const again = JSON.stringify([...a.xs.slice(0, 50), ...a.zs.slice(3000, 3050)]);
  assert.equal(JSON.stringify([...buildJourney('villa').xs.slice(0, 50), ...buildJourney('villa').zs.slice(3000, 3050)]), again);
});

test('kerangka jalan kontinu: tidak ada lompatan posisi atau arah', () => {
  const j = buildJourney('royal');
  let prev = frameAt(j, 0);
  for (let s = 1; s <= j.length; s += 1) {
    const f = frameAt(j, s);
    assert.ok(Math.hypot(f.x - prev.x, f.z - prev.z) < 1.2, `lompat @${s}`);
    assert.ok(Math.abs(f.heading - prev.heading) < 0.04, `arah lompat @${s}`);
    prev = f;
  }
});

test('peristiwa: gerbang di awal, persimpangan dan jembatan di bukit/berkelok, danau di kawasan premium, area penurunan di akhir', () => {
  for (const v of ids) {
    const j = buildJourney(v);
    assert.equal(eventsOf(j, 'gate')[0].s, GATE_S);
    for (let s = GATE_S - 20; s <= GATE_S + 140; s += 4) assert.ok(Math.abs(frameAt(j, s).curvature) < 1e-4, `gerbang lurus @${s}`);
    assert.equal(eventsOf(j, 'dropoff')[0].s, j.length);
    const bukit = j.bounds.find((b) => b.id === 'bukit');
    const junctions = eventsOf(j, 'junction');
    assert.ok(junctions.length >= 2);
    for (const e of junctions) assert.ok(e.s > bukit.s0 && e.s < bukit.s1, `${v} persimpangan di luar bukit`);
    const bridges = eventsOf(j, 'bridge');
    assert.ok(bridges.length >= 2);
    for (const e of bridges) {
      for (let s = e.s0; s <= e.s1; s += 2) assert.ok(Math.abs(frameAt(j, s).curvature) <= 1 / 120, `${v} jembatan tikungan @${s}`);
      assert.ok(bridgeAt(j, (e.s0 + e.s1) / 2));
    }
    const premium = j.bounds.find((b) => b.id === 'premium');
    const [lake] = eventsOf(j, 'lake');
    assert.ok(lake.s0 >= premium.s0 && lake.s1 <= premium.s1);
    // tempat acara belum terlihat sebelum bagian kedatangan
    assert.ok(eventsOf(j, 'reveal')[0].s >= j.bounds.at(-1).s0);
  }
});

test('jembatan dan danau punya ruang: tidak ada ruas jalan lain terlalu dekat', () => {
  for (const v of ids) {
    const j = buildJourney(v);
    for (const e of eventsOf(j, 'bridge')) assert.ok(localClearance(j, e.s0, e.s1) >= BRIDGE_CLEARANCE, `${v} jembatan`);
    for (const e of eventsOf(j, 'lake')) assert.ok(localClearance(j, e.s0, e.s1, 120) >= LAKE_CLEARANCE, `${v} danau`);
  }
});

test('medan: di jalan tepat setinggi badan jalan, menjauh landai, tanpa lompatan besar', () => {
  for (const v of ids) {
    const j = buildJourney(v);
    for (const s of [0, 1500, 4000, 7000, 9800, 12000, j.length]) {
      const f = frameAt(j, s);
      assert.ok(Math.abs(terrainHeight(j, f.x, f.z) - f.y) < 0.25, `${v} jalan @${s}`);
      const left = { x: f.x + Math.cos(f.heading) * (ROAD.half - 0.5), z: f.z - Math.sin(f.heading) * (ROAD.half - 0.5) };
      assert.ok(Math.abs(terrainHeight(j, left.x, left.z) - f.y) < 0.6, `${v} tepi @${s}`);
    }
    // kelandaian medan antar sampel 4 m tidak menjadi tebing tegak (kecuali jurang jembatan)
    const f = frameAt(j, 3000);
    let worst = 0;
    for (let d = -60; d < 60; d += 4) {
      const x = f.x + Math.cos(f.heading) * d;
      const z = f.z - Math.sin(f.heading) * d;
      const x2 = f.x + Math.cos(f.heading) * (d + 4);
      const z2 = f.z - Math.sin(f.heading) * (d + 4);
      worst = Math.max(worst, Math.abs(terrainHeight(j, x2, z2) - terrainHeight(j, x, z)) / 4);
    }
    assert.ok(worst < 1.6, `${v} lereng ${worst}`);
  }
});

test('jurang di bawah jembatan lebih rendah daripada jalan dan air ada di dasarnya', () => {
  const j = buildJourney('villa');
  for (const e of eventsOf(j, 'bridge')) {
    const c = (e.s0 + e.s1) / 2;
    const f = frameAt(j, c);
    const side = { x: f.x + Math.cos(f.heading) * 20, z: f.z - Math.sin(f.heading) * 20 };
    assert.ok(terrainHeight(j, side.x, side.z) < f.y - 3);
    assert.ok(waterLevelOf(j, e) < f.y - 5);
  }
});

test('titik terdekat pada rute: jarak bertanda sesuai sisi dan s konsisten', () => {
  const j = buildJourney('masjid');
  const f = frameAt(j, 2500);
  const p = { x: f.x + Math.cos(f.heading) * 7, z: f.z - Math.sin(f.heading) * 7 }; // 7 m ke kiri
  const r = nearestOnRoute(j, p.x, p.z);
  assert.ok(Math.abs(r.d - 7) < 0.6, `d=${r.d}`);
  assert.ok(Math.abs(r.s - 2500) < 4);
  assert.equal(segmentAt(j, 2500).id, 'utama');
  assert.equal(segmentAt(j, j.length).id, 'kedatangan');
  void JOURNEYS;
});
