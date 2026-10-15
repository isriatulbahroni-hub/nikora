import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BRIDGE, DECOR_ISLANDS, DINING_TABLES, ISLANDS, OPENINGS, PORTALS, PROP_SPECS, ROOMS, SPAWN, WINDOWS, ZONES,
  buildRoyalOccluders, cathedralChairs, createVoiceRule, findNearestSpot, getRoyalWorld, heightAt, mainHeight, nearestGamePad,
  nearestPortal, propToRect, roomAt, voiceSpaceOf, wallToRect, zoneOfPoint,
} from './royal-layout.js';

const world = getRoyalWorld();
const R = world.radius;
const free = (zone, x, z) => {
  const zn = world.zones[zone];
  return zn.colliders.every((c) => {
    const cx = Math.min(c.maxX, Math.max(c.minX, x));
    const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
    return (x - cx) ** 2 + (z - cz) ** 2 >= R * R - 1e-9;
  });
};
/** Berjalan lurus ke target dengan langkah kecil (seperti input pemain); mengembalikan posisi akhir. */
function walk(start, target, speed = 5.2) {
  let p = { zone: 'main', ...start };
  for (let i = 0; i < 4000; i++) {
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) break;
    const step = Math.min(d, speed / 60);
    p = world.move(p, (dx / d) * step, (dz / d) * step);
  }
  return p;
}
const route = (start, points) => points.reduce((p, t) => walk(p, t), { zone: 'main', ...start });

test('titik awal bisa diinjak', () => {
  assert.ok(free('main', SPAWN.x, SPAWN.z));
});

test('dari titik awal bisa berjalan menyeberangi jembatan dan masuk ke katedral lewat pintu utama', () => {
  const end = route(SPAWN, [{ x: 5, z: 47 }, { x: 5, z: 32 }, { x: 0, z: 31 }, { x: 0, z: -4 }, { x: 0, z: -19 }, { x: 0, z: -30 }]);
  assert.ok(Math.hypot(end.x - 0, end.z + 30) < 0.2, `berhenti di ${end.x},${end.z}`);
  assert.equal(roomAt('main', end.x, end.z).id, 'cathedral');
});

test('danau tidak bisa diseberangi dan jembatan tidak bisa dilewati dari samping', () => {
  const end = walk({ x: 10, z: 33 }, { x: 10, z: 10 });
  assert.ok(end.z >= 30.3, `masuk danau di z=${end.z}`);
  const side = walk({ x: 33, z: 10 }, { x: 0, z: 10 });
  assert.ok(side.x >= 30.3, `masuk danau dari samping di x=${side.x}`);
});

test('pintu antar ruangan bisa dilewati: katedral -> ruang makan, katedral -> lounge, plaza -> aula musik', () => {
  const dining = route({ x: 0, z: -35 }, [{ x: -18, z: -35 }]);
  assert.equal(roomAt('main', dining.x, dining.z).id, 'dining');
  assert.ok(Math.hypot(dining.x + 18, dining.z + 35) < 0.2);
  const lounge = route({ x: 0, z: -35 }, [{ x: 17, z: -35 }]);
  assert.equal(roomAt('main', lounge.x, lounge.z).id, 'lounge');
  const music = route({ x: 42, z: -18 }, [{ x: 42, z: -24 }, { x: 42, z: -30 }]);
  assert.equal(roomAt('main', music.x, music.z).id, 'music');
  const out = route({ x: -19, z: -30 }, [{ x: -19, z: -24 }, { x: -19, z: -16 }]);
  assert.ok(out.z > -19.5, 'keluar lewat pintu ruang makan');
});

test('jendela dan dinding tidak bisa ditembus', () => {
  const win = walk({ x: -24, z: -17 }, { x: -24, z: -25 });
  assert.ok(win.z > -19.5, `menembus jendela ruang makan di z=${win.z}`);
  const wall = walk({ x: -40, z: -35 }, { x: -20, z: -35 });
  assert.ok(wall.x < -26, `menembus dinding barat di x=${wall.x}`);
});

test('jendela tidak tumpang tindih dengan pintu atau jendela lain pada dinding yang sama', () => {
  const spans = OPENINGS.map((o) => ({ key: `${o.orient}|${o.orient === 'h' ? o.z : o.x}`, lo: (o.orient === 'h' ? o.x : o.z) - o.width / 2, hi: (o.orient === 'h' ? o.x : o.z) + o.width / 2 }));
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spans[i].key !== spans[j].key) continue;
      assert.ok(spans[i].hi <= spans[j].lo + 1e-9 || spans[j].hi <= spans[i].lo + 1e-9, `tumpang tindih ${JSON.stringify(spans[i])} ${JSON.stringify(spans[j])}`);
    }
  }
});

test('setiap jendela berada pada dinding bangunan yang nyata (ada celah di dinding)', () => {
  for (const w of WINDOWS) {
    const cx = w.x;
    const cz = w.z;
    const inside = world.walls.some((s) => {
      const r = wallToRect(s);
      return cx > r.minX + 1e-6 && cx < r.maxX - 1e-6 && cz > r.minZ + 1e-6 && cz < r.maxZ - 1e-6;
    });
    assert.equal(inside, false, `jendela ${w.orient} ${w.x},${w.z} tidak membuat celah`);
    const onRoomEdge = ROOMS.some((r) => (w.orient === 'h'
      ? (r.rect[1] === w.z || r.rect[3] === w.z) && w.x - w.width / 2 >= r.rect[0] && w.x + w.width / 2 <= r.rect[2]
      : (r.rect[0] === w.x || r.rect[2] === w.x) && w.z - w.width / 2 >= r.rect[1] && w.z + w.width / 2 <= r.rect[3]));
    assert.ok(onRoomEdge, `jendela ${w.orient} ${w.x},${w.z} tidak di tepi ruangan`);
  }
});

test('perabot tidak menimpa dinding dan pohon tidak berada di dalam bangunan', () => {
  const wallRects = world.walls.map(wallToRect);
  const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  for (const p of world.allProps.filter((q) => q.zone === 'main' && !['tower', 'column', 'pillar'].includes(q.type))) {
    const r = propToRect(p);
    for (const w of wallRects) assert.equal(overlap(r, w), false, `${p.type} ${p.x},${p.z} menimpa dinding`);
  }
  for (const p of world.allProps.filter((q) => q.type === 'tree' || q.type === 'sakura')) {
    assert.ok(!ROOMS.some((r) => p.x > r.rect[0] && p.x < r.rect[2] && p.z > r.rect[1] && p.z < r.rect[3]), 'pohon di dalam bangunan');
  }
});

test('meja makan VIP: 8 meja, tiap meja punya 6 kursi yang bisa dijangkau', () => {
  assert.equal(DINING_TABLES.length, 8);
  const wallRects = world.walls.map(wallToRect);
  for (const t of DINING_TABLES) {
    const seats = world.spots.filter((s) => s.table === t.id);
    assert.equal(seats.length, 6);
    for (const s of seats) {
      assert.ok(wallRects.every((w) => s.x < w.minX - 0.3 || s.x > w.maxX + 0.3 || s.z < w.minZ - 0.3 || s.z > w.maxZ + 0.3), `kursi ${t.id} menempel dinding`);
    }
  }
  assert.ok(cathedralChairs().length > 150);
});

test('tinggi permukaan: jembatan melengkung, altar lebih tinggi, selebihnya datar', () => {
  assert.ok(Math.abs(mainHeight(0, (BRIDGE.z1 + BRIDGE.z2) / 2) - BRIDGE.hump) < 1e-6);
  assert.equal(mainHeight(0, BRIDGE.z1), 0);
  assert.ok(Math.abs(mainHeight(0, -47) - 0.54) < 1e-6);
  assert.equal(mainHeight(0, -30), 0);
  assert.equal(heightAt('isle_game', 60, -30), 30);
  const onBridge = route(SPAWN, [{ x: 5, z: 47 }, { x: 5, z: 32 }, { x: 0, z: 31 }, { x: 0, z: 13 }]);
  assert.ok(onBridge.y > 0.85);
});

test('pulau melayang: tepi cakram menahan pemain dan portal menghubungkan dua arah dengan aman', () => {
  for (const isl of ISLANDS) {
    const p = world.place(isl.id, isl.cx, isl.cz);
    const out = walk({ ...p, zone: isl.id }, { x: isl.cx + isl.r * 2, z: isl.cz });
    assert.ok(Math.hypot(out.x - isl.cx, out.z - isl.cz) <= isl.r - R + 1e-6, `${isl.id} keluar cakram`);
    assert.equal(out.y, isl.y);
  }
  assert.equal(PORTALS.length, ISLANDS.length * 2);
  for (const portal of PORTALS) {
    const dest = portal.to;
    assert.ok(free(dest.zone, dest.x, dest.z), `tujuan ${portal.id} terhalang`);
    const back = PORTALS.find((q) => q.zone === dest.zone && q.to.zone === portal.zone);
    assert.ok(back, `tidak ada portal balik untuk ${portal.id}`);
    assert.ok(Math.hypot(dest.x - back.x, dest.z - back.z) > back.r + 0.5, `mendarat di dalam pad portal balik (${portal.id})`);
    assert.ok(free(portal.zone, portal.x, portal.z), `pad ${portal.id} terhalang`);
    assert.equal(nearestPortal({ zone: portal.zone, x: portal.x, z: portal.z }).id, portal.id);
  }
  assert.equal(nearestPortal({ zone: 'main', x: 0, z: 0 }), null);
  assert.equal(nearestGamePad({ zone: 'isle_game', x: 58, z: -40 }).id, 'fw_red');
  assert.equal(nearestGamePad({ zone: 'main', x: 58, z: -40 }), null);
  assert.equal(DECOR_ISLANDS.length > 0, true);
});

test('zona dari koordinat dunia (untuk pemain lain) dan ruang suara', () => {
  assert.equal(zoneOfPoint(-60, 24, -34), 'isle_garden');
  assert.equal(zoneOfPoint(-60, 0, -34), 'main');
  assert.equal(voiceSpaceOf({ x: 0, y: 0, z: 40 }), 'open');
  assert.equal(voiceSpaceOf({ x: 0, y: 0, z: -30 }), 'cathedral');
  assert.equal(voiceSpaceOf({ x: -60, y: 24, z: -34 }), 'isle_garden');
});

test('gelembung suara meja: hanya teman semeja yang saling dengar', () => {
  const t1 = world.spots.findIndex((s) => s.table === 'meja_1');
  const t1b = world.spots.findIndex((s, i) => s.table === 'meja_1' && i !== t1);
  const t2 = world.spots.findIndex((s) => s.table === 'meja_2');
  const hear = createVoiceRule(world.spots);
  const at = (sit, x = -20, z = -40) => ({ sit, x, z, y: 0 });
  assert.equal(hear(at(t1), at(t1b)), true);
  assert.equal(hear(at(t1), at(t2)), false);
  assert.equal(hear(at(t1), { sit: null, x: -20, z: -40, y: 0 }), false); // orang lain di ruangan yang sama tidak mendengar meja
  assert.equal(hear({ sit: null, x: 0, z: 30, y: 0 }, { sit: null, x: 5, z: 50, y: 0 }), true);
  assert.equal(hear({ sit: null, x: 0, z: 30, y: 0 }, { sit: null, x: 0, z: -30, y: 0 }), false); // beda ruang
});

test('titik duduk terdekat mengikuti zona dan menghormati kursi terisi', () => {
  const chair = world.spots.find((s) => s.tag === 'nave');
  const near = findNearestSpot({ zone: 'main', x: chair.x, z: chair.z, y: 0 }, world.spots);
  assert.equal(near.id, chair.id);
  assert.equal(findNearestSpot({ zone: 'main', x: chair.x, z: chair.z, y: 0 }, world.spots, new Set([chair.id])).id !== chair.id, true);
  assert.equal(findNearestSpot({ zone: 'isle_garden', x: chair.x, z: chair.z, y: 24 }, world.spots), null);
});

test('penghalang kamera mencakup dinding dan atap', () => {
  const boxes = buildRoyalOccluders(world);
  assert.ok(boxes.length > 100);
  assert.ok(boxes.some((b) => b.minY >= 14 && b.maxY > 19)); // atap katedral
  assert.ok(ZONES.length > 0 && Object.keys(PROP_SPECS).length > 10);
});
