import assert from 'node:assert/strict';
import test from 'node:test';
import { BOUNDS, DOORS, PLACES, PLAYER_RADIUS, ROOMS, SPAWN, ZONES, getMasjidWorld } from './masjid-layout.js';

const world = getMasjidWorld();

test('setiap pintu menempel pada dinding sebuah ruangan', () => {
  assert.deepEqual(world.orphanDoors, []);
  assert.equal(world.lintels.length, DOORS.length);
});

test('id ruangan dan tujuan unik, dan semua ruang punya pintu', () => {
  const ids = [...ROOMS, ...ZONES].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(PLACES.map((p) => p.id)).size, PLACES.length);
  for (const r of ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    const has = DOORS.some((d) => (d.orient === 'h' ? (d.z === z1 || d.z === z2) && d.x > x1 && d.x < x2 : (d.x === x1 || d.x === x2) && d.z > z1 && d.z < z2));
    assert.ok(has, `${r.id} tidak punya pintu`);
  }
});

test('titik awal dan semua tujuan Jelajah bisa diinjak dan berada di ruang yang dimaksud', () => {
  assert.ok(world.canStand(SPAWN.x, SPAWN.z));
  for (const p of PLACES) assert.ok(world.canStand(p.x, p.z), `${p.id} (${p.x}, ${p.z}) terhalang`);
  const at = (id) => world.roomAt(PLACES.find((p) => p.id === id).x, PLACES.find((p) => p.id === id).z);
  assert.equal(at('hall').id, 'prayer_hall');
  assert.equal(at('dome').id, 'prayer_hall');
  assert.equal(at('library').id, 'library');
  assert.equal(at('museum').id, 'museum');
  assert.equal(at('akad').id, 'akad');
  assert.equal(at('walimah').id, 'walimah');
  assert.equal(at('wudhu_e').id, 'wudhu_east');
  assert.equal(at('sahn').id, 'sahn');
});

test('semua ruang dan tujuan terjangkau dari titik awal (penjelajahan 2 m)', () => {
  const step = 2;
  const minX = -320;
  const minZ = -280;
  const cols = Math.ceil(640 / step);
  const rows = Math.ceil(600 / step);
  const idx = (i, j) => j * cols + i;
  const seen = new Uint8Array(cols * rows);
  const toCell = (x, z) => [Math.round((x - minX) / step), Math.round((z - minZ) / step)];
  const [si, sj] = toCell(SPAWN.x, SPAWN.z);
  const queue = [[si, sj]];
  seen[idx(si, sj)] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen[idx(ni, nj)]) continue;
      if (!world.canStand(minX + ni * step, minZ + nj * step)) continue;
      seen[idx(ni, nj)] = 1;
      queue.push([ni, nj]);
    }
  }
  for (const p of PLACES) {
    const [i, j] = toCell(p.x, p.z);
    let ok = false;
    for (let di = -1; di <= 1 && !ok; di++) for (let dj = -1; dj <= 1; dj++) if (seen[idx(i + di, j + dj)]) ok = true;
    assert.ok(ok, `${p.id} tidak terjangkau dari titik awal`);
  }
});

test('dinding menghalangi, pintu terbuka, dan pagar keliling padat kecuali gerbang', () => {
  // dari taman belakang (utara aula) menembus dinding utara aula: tertahan
  const blocked = world.move({ x: 100, z: -250 }, 0, 30);
  assert.ok(blocked.z < -240, `seharusnya tertahan dinding utara, z=${blocked.z}`);
  // lewat gerbang selatan lurus ke utara: masuk ke halaman
  let p = { x: 0, z: 262 };
  for (let i = 0; i < 20; i++) p = world.move(p, 0, -1);
  assert.ok(p.z < 242, 'harus bisa melewati gerbang utama');
  // menembus pagar di luar gerbang: tertahan
  const fence = world.move({ x: 100, z: 262 }, 0, -40);
  assert.ok(fence.z > 240, `seharusnya tertahan pagar selatan, z=${fence.z}`);
  assert.ok(world.canStand(0, 245) && !world.canStand(100, 240));
});

test('berjalan dari gerbang ke bawah kubah utama lewat lorong tengah', () => {
  let p = { x: 0, z: 262 };
  const route = [[0, 200], [14, 130], [14, -30], [0, -38], [0, -140]];
  for (const [tx, tz] of route) {
    for (let guard = 0; guard < 2000 && Math.hypot(tx - p.x, tz - p.z) > 0.3; guard++) {
      const d = Math.hypot(tx - p.x, tz - p.z);
      p = world.move(p, ((tx - p.x) / d) * Math.min(0.5, d), ((tz - p.z) / d) * Math.min(0.5, d));
    }
    assert.ok(Math.hypot(tx - p.x, tz - p.z) < 1, `macet sebelum titik (${tx}, ${tz}); berhenti di (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
});

test('penghalang kamera: dinding aula dan tanah ada, dan pencarian per area tidak kosong', () => {
  const near = world.occludersNear(0, -40, 60);
  assert.ok(near.length > 5);
  assert.ok(near.some((b) => b.maxY >= 28));
  assert.ok(near.some((b) => b.minY < 0));
});

test('jumlah objek wajar untuk perangkat seluler', () => {
  assert.ok(world.colliders.length < 2500, `terlalu banyak collider: ${world.colliders.length}`);
  assert.ok(world.props.length < 1500);
  assert.equal(BOUNDS.maxZ, 240);
  assert.ok(PLAYER_RADIUS < 0.5);
});

test('Taman Perenungan: zona, tujuan Jelajah, kolam menghalangi, gazebo dan jalan setapak bisa dimasuki', () => {
  assert.equal(world.roomAt(30, 202).name, 'Taman Perenungan');
  assert.ok(PLACES.some((p) => p.id === 'taman'));
  assert.ok(!world.canStand(52, 202), 'tidak boleh berjalan di atas kolam');
  assert.ok(world.canStand(70, 202), 'bagian dalam gazebo harus bisa dimasuki');
  assert.ok(world.canStand(-70, 202));
  assert.ok(world.canStand(30, 202), 'jalan setapak dari jalan tengah ke kolam');
  const garden = world.props.filter((p) => p.garden);
  assert.ok(garden.length > 20 && garden.length < 100, `jumlah properti taman wajar: ${garden.length}`);
  for (const p of garden) {
    assert.ok(p.x > -80 && p.x < 80 && p.z > 165 && p.z < 240, `${p.type} di luar taman (${p.x}, ${p.z})`);
    assert.ok(!ROOMS.some((r) => p.x > r.rect[0] - 1 && p.x < r.rect[2] + 1 && p.z > r.rect[1] - 1 && p.z < r.rect[3] + 1), `${p.type} menempel ruangan`);
  }
  // pohon palem acak tidak boleh tumbuh di dalam taman
  assert.ok(!world.props.some((p) => p.type === 'palm' && Math.abs(p.x) < 80 && p.z > 165 && Math.abs(p.x) > 16));
});
