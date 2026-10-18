import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemDef } from './horor-rules.js';
import { createNavWorld, colliderBoxes } from './horor-nav.js';
import { createZombie, ZOMBIE_TYPES } from './horor-zombie.js';
import {
  CAMS, DOORS, ITEMS, LIGHTS, MANSION_RECT, PLAYER_START, PROPS, ROOMS, SPAWNS, buildMansion, camAt, canEscape, roomAt,
} from './horor-layout.js';

const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
const overlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1e-9 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1e-9;
const roomOf = (id) => ROOMS.find((r) => r.id === id);

// Dinding setebal 0.2 + radius 0.3 -> titik yang dipakai berdiri minimal 0.5 dari dinding dan perabot.
function clearance(x, z, boxes) {
  let m = Infinity;
  for (const b of boxes) {
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    m = Math.min(m, Math.hypot(dx, dz));
  }
  return m;
}

// findPath mengembalikan jalur parsial terbaik bila tujuan tak terjangkau, jadi "sampai" berarti ujung jalur dekat tujuan.
function reachable(world, a, b) {
  const path = world.grid.findPath(a.x, 0, a.z, b.x, 0, b.z);
  if (!path || !path.length) return false;
  const end = path[path.length - 1];
  return Math.hypot(end.x - b.x, end.z - b.z) < 0.8;
}

const room = buildMansion();
const world = () => createNavWorld(room, MANSION_RECT);

test('ruangan menutup seluruh denah tanpa tumpang tindih', () => {
  assert.equal(ROOMS.reduce((n, r) => n + area(r.rect), 0), area(MANSION_RECT));
  for (let i = 0; i < ROOMS.length; i++) for (let j = i + 1; j < ROOMS.length; j++) assert.equal(overlap(ROOMS[i].rect, ROOMS[j].rect), false, `${ROOMS[i].id} x ${ROOMS[j].id}`);
  for (const r of ROOMS) {
    assert.ok(r.rect[0] >= MANSION_RECT[0] && r.rect[1] >= MANSION_RECT[1] && r.rect[2] <= MANSION_RECT[2] && r.rect[3] <= MANSION_RECT[3], r.id);
  }
});

test('id ruangan, pintu, dan zombie unik', () => {
  for (const list of [ROOMS.map((r) => r.id), DOORS.map((d) => d.id), SPAWNS.map((s) => s.id)]) assert.equal(new Set(list).size, list.length);
});

test('tiap pintu berada di tepi bersama dua ruangan yang disebutnya (gerbang keluar: tepi luar lobi)', () => {
  for (const d of DOORS) {
    const [a, b] = d.between.map((id) => (id ? roomOf(id) : null));
    assert.ok(a, `${d.id}: ruangan pertama ada`);
    const probe = (side) => (d.axis === 'x' ? roomAt(d.pos, d.at + side * 0.3) : roomAt(d.at + side * 0.3, d.pos));
    const sides = [probe(-1)?.id ?? null, probe(1)?.id ?? null].sort();
    assert.deepEqual(sides, d.between.slice().sort(), d.id);
    if (!d.exit) assert.ok(b, `${d.id}: bukan gerbang keluar harus menghubungkan dua ruangan`);
  }
  assert.equal(DOORS.filter((d) => d.exit).length, 1);
});

test('mansion bisa diselesaikan: semua kunci terjangkau berurutan sampai gerbang keluar', () => {
  assert.equal(canEscape(), true);
});

test('canEscape gagal bila satu kunci di rantai dihilangkan', () => {
  for (const key of ['kunci:perpustakaan', 'kunci:dapur', 'kunci:gudang', 'kunci:gerbang']) {
    assert.equal(canEscape({ items: ITEMS.filter((i) => i.item !== key) }), false, key);
  }
});

test('canEscape gagal bila kunci pertama ditaruh di balik pintu yang butuh kunci itu sendiri', () => {
  const items = ITEMS.map((i) => (i.item === 'kunci:perpustakaan' ? { ...i, room: 'perpustakaan' } : i));
  assert.equal(canEscape({ items }), false);
});

test('setiap kunci punya tepat satu gerbang dan satu item', () => {
  for (const d of DOORS.filter((x) => x.lock)) {
    assert.equal(ITEMS.filter((i) => i.item === d.lock).length, 1, `item ${d.lock}`);
    assert.equal(DOORS.filter((x) => x.lock === d.lock).length, 1, `gerbang ${d.lock}`);
  }
});

test('semua id item dikenal horor-rules.js dan ada di ruangan yang benar', () => {
  for (const it of ITEMS) {
    assert.ok(itemDef(it.item), it.item);
    assert.ok(it.qty >= 1);
    assert.equal(roomAt(it.x, it.z)?.id, it.room, `${it.item} @ ${it.x},${it.z}`);
  }
});

test('titik muncul zombie valid dan berada di dalam ruangan (bukan di lobi atau ruang kerja)', () => {
  for (const s of SPAWNS) {
    assert.ok(ZOMBIE_TYPES[s.type], s.id);
    assert.ok(roomAt(s.x, s.z), s.id);
    assert.ok(!['lobi', 'ruang_kerja'].includes(roomAt(s.x, s.z).id), `${s.id} di ruang aman`);
    assert.equal(createZombie(s).id, s.id);
  }
});

test('pemain mulai di lobi dengan jarak aman dari zombie', () => {
  assert.equal(roomAt(PLAYER_START.x, PLAYER_START.z).id, PLAYER_START.room);
  for (const s of SPAWNS) assert.ok(Math.hypot(s.x - PLAYER_START.x, s.z - PLAYER_START.z) > 9, s.id);
});

test('item, zombie, dan titik mulai tidak menempel dinding atau perabot', () => {
  const boxes = colliderBoxes(room.colliders);
  const pts = [
    ...ITEMS.map((i) => ['item ' + i.item, i.x, i.z]),
    ...SPAWNS.map((s) => ['zombie ' + s.id, s.x, s.z]),
    ['mulai', PLAYER_START.x, PLAYER_START.z],
  ];
  for (const [n, x, z] of pts) assert.ok(clearance(x, z, boxes) >= 0.45, `${n} @ ${x},${z} jarak ${clearance(x, z, boxes).toFixed(2)}`);
});

test('perabot berada di dalam ruangannya dan tidak menutup lubang pintu', () => {
  for (const p of PROPS) {
    const r = roomOf(p.room).rect;
    assert.ok(p.x - p.w / 2 >= r[0] && p.x + p.w / 2 <= r[2] && p.z - p.d / 2 >= r[1] && p.z + p.d / 2 <= r[3], `${p.room} @ ${p.x},${p.z}`);
  }
  const boxes = colliderBoxes(room.colliders);
  for (const d of DOORS.filter((x) => !x.lock)) {
    const pts = d.axis === 'x' ? [[d.pos, d.at - 0.9], [d.pos, d.at + 0.9]] : [[d.at - 0.9, d.pos], [d.at + 0.9, d.pos]];
    for (const [x, z] of pts) assert.ok(clearance(x, z, boxes) >= 0.3, `${d.id} tertutup di ${x},${z}`);
  }
});

test('setiap titik berjalan punya kamera tetap; kamera ada di dalam mansion', () => {
  for (const r of ROOMS) {
    for (const [fx, fz] of [[0.5, 0.5], [0.1, 0.9], [0.9, 0.1], [0.99, 0.99]]) {
      const x = r.rect[0] + (r.rect[2] - r.rect[0]) * fx;
      const z = r.rect[1] + (r.rect[3] - r.rect[1]) * fz;
      const c = camAt(x, z);
      assert.ok(c, `${r.id} ${x},${z}`);
      assert.equal(c.room, r.id, `kamera ${c.room} untuk titik di ${r.id}`);
    }
  }
  for (const c of CAMS) {
    assert.ok(c.pos[0] > MANSION_RECT[0] && c.pos[0] < MANSION_RECT[2] && c.pos[2] > MANSION_RECT[1] && c.pos[2] < MANSION_RECT[3], c.room);
    assert.ok(c.pos[1] > 1.5 && c.pos[1] < 3, 'kamera di bawah langit-langit');
  }
  assert.equal(CAMS.reduce((n, c) => n + area(c.zone), 0), area(MANSION_RECT), 'zona kamera menutup denah tanpa tumpang tindih');
});

test('buildMansion: spots, zombie, kamera, dan lampu sesuai data', () => {
  assert.equal(room.spots.filter((s) => s.kind === 'item').length, ITEMS.length);
  assert.deepEqual(room.spots.filter((s) => s.kind === 'gate').map((s) => s.id).sort(), DOORS.filter((d) => d.lock).map((d) => d.id).sort());
  assert.equal(room.spawns.length, SPAWNS.length);
  assert.equal(room.cams.length, CAMS.length);
  assert.equal(room.layout.lights.length, LIGHTS.length);
  assert.equal(Object.keys(room.shutters).length, DOORS.filter((d) => d.lock).length);
  assert.equal(room.statics.length, 0, 'sudah finalize');
});

test('buildMansion hemat: lampu non-core dilewati', () => {
  const low = buildMansion({ lights: 'low' });
  assert.equal(low.layout.lights.length, LIGHTS.filter((l) => l.core).length);
  low.dispose();
});

test('navigasi: gerbang tertutup memblokir, terbuka melewatkan (rantai kunci nyata di dunia fisik)', () => {
  const w = world();
  const start = PLAYER_START;
  const at = (item) => ITEMS.find((i) => i.item === item);
  assert.equal(reachable(w, start, at('kunci:perpustakaan')), true, 'kunci pertama terjangkau dari lobi');
  assert.equal(reachable(w, start, at('kunci:dapur')), false, 'perpustakaan terkunci');
  assert.equal(reachable(w, start, at('kunci:gudang')), false, 'dapur terkunci');
  assert.equal(reachable(w, start, at('kunci:gerbang')), false, 'gudang terkunci');

  for (const [gate, next] of [['lorong-pustaka', 'kunci:dapur'], ['lorong-dapur', 'kunci:gudang'], ['lobi-gudang', 'kunci:gerbang']]) {
    room.setShutter(gate, false);
    w.refresh();
    assert.equal(reachable(w, start, at(next)), true, `${next} terjangkau setelah ${gate} dibuka`);
  }
  for (const g of ['lorong-pustaka', 'lorong-dapur', 'lobi-gudang']) room.setShutter(g, true);
});

test('navigasi: dengan semua gerbang terbuka, semua item dan zombie terjangkau dari titik mulai', () => {
  const gates = DOORS.filter((d) => d.lock).map((d) => d.id);
  for (const g of gates) room.setShutter(g, false);
  const w = world();
  for (const it of ITEMS) assert.equal(reachable(w, PLAYER_START, it), true, `item ${it.item} @ ${it.x},${it.z}`);
  for (const s of SPAWNS) assert.equal(reachable(w, PLAYER_START, s), true, `zombie ${s.id}`);
  for (const g of gates) room.setShutter(g, true);
});

test('navigasi: pintu terbuka antar ruangan bisa dilewati tanpa kunci (lobi - lorong - ruang makan - lobi)', () => {
  const w = world();
  const lorong = { x: 18, z: 13 };
  const makan = { x: 7, z: 20 };
  assert.equal(reachable(w, PLAYER_START, lorong), true);
  assert.equal(reachable(w, lorong, makan), true);
  assert.equal(reachable(w, makan, PLAYER_START), true);
});
