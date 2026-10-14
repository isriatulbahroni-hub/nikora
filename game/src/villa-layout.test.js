import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDS, WORLD_LIMIT, PLAYER_RADIUS, ROOMS, DOORS, SPAWN, SIT_RANGE, LEVEL_HEIGHT, LEVEL_COUNT, UPPER_ROOMS, TOWERS, STAIRS,
  findNearestSpot, getVillaWorld, isWalkable, levelY, moveWithCollisions, resolveMove, roomAt, sameVoiceSpace, spotPose,
} from './villa-layout.js';

const world = getVillaWorld();
const ok = (x, z) => isWalkable(x, z, PLAYER_RADIUS, world.colliders, BOUNDS);

test('titik spawn dan setiap pintu bisa dilewati', () => {
  assert.ok(ok(SPAWN.x, SPAWN.z));
  for (const d of DOORS) assert.ok(ok(d.x, d.z), `pintu ${d.orient} (${d.x},${d.z}) terhalang`);
});

test('pusat setiap ruangan bebas dari properti', () => {
  for (const r of ROOMS) {
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    assert.ok(ok(cx, cz), `pusat ${r.name} terhalang`);
  }
});

test('semua ruangan terjangkau dari pintu gerbang (flood fill)', () => {
  const step = 0.4;
  const key = (i, j) => `${i},${j}`;
  const toX = (i) => BOUNDS.minX + i * step;
  const toZ = (j) => BOUNDS.minZ + j * step;
  const seen = new Set();
  const queue = [[Math.round((SPAWN.x - BOUNDS.minX) / step), Math.round((SPAWN.z - BOUNDS.minZ) / step)]];
  seen.add(key(...queue[0]));
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (seen.has(key(ni, nj)) || !ok(toX(ni), toZ(nj))) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  const reach = (x, z) => seen.has(key(Math.round((x - BOUNDS.minX) / step), Math.round((z - BOUNDS.minZ) / step)));
  for (const r of ROOMS) {
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    assert.ok(reach(cx, cz), `${r.name} tidak terjangkau`);
  }
  assert.ok(reach(0, 9), 'jembatan kolam harus terjangkau');
});

test('kolam tidak bisa dimasuki, jembatan bisa', () => {
  assert.equal(ok(-4, 9), false);
  assert.equal(ok(4, 9), false);
  assert.equal(ok(0, 9), true);
});

test('dinding menahan pemain, tembus dinding dicegah meski langkah besar', () => {
  // dari pintu utama aula berjalan ke barat: tertahan dinding selatan aula
  let p = { x: -10, z: -1 };
  p = moveWithCollisions(p, 0, -3, PLAYER_RADIUS, world.colliders);
  assert.ok(p.z >= -3 + 0.15 + PLAYER_RADIUS - 1e-6, `menembus dinding, z=${p.z}`);
  // lewat pintu utama (x=0) bisa masuk
  let q = { x: 0, z: -1 };
  q = moveWithCollisions(q, 0, -4, PLAYER_RADIUS, world.colliders);
  assert.ok(q.z < -3, 'harus bisa masuk lewat pintu utama');
  // langkah sangat besar tidak menembus
  let r = { x: -10, z: 1 };
  r = moveWithCollisions(r, 0, -6, PLAYER_RADIUS, world.colliders);
  assert.ok(r.z > -3, `menembus dinding dengan langkah besar, z=${r.z}`);
});

test('resolveMove: pusat di dalam kotak didorong keluar; hanya pengaman jarak sangat jauh yang membatasi', () => {
  const out = resolveMove({ x: 0, z: 9 + 3 }, PLAYER_RADIUS, world.colliders);
  assert.ok(isWalkable(out.x, out.z, PLAYER_RADIUS, world.colliders));
  const far = resolveMove({ x: 9999, z: -9999 }, PLAYER_RADIUS, world.colliders);
  assert.equal(far.x, WORLD_LIMIT.maxX - PLAYER_RADIUS);
  assert.equal(far.z, WORLD_LIMIT.minZ + PLAYER_RADIUS);
});

test('dunia terbuka: pemain boleh keluar lewat gerbang dan berjalan jauh di luar vila', () => {
  let p = { x: 0, z: 37 };
  for (let i = 0; i < 40; i++) p = world.move(p, 0, 5.2 * 0.05 * 20); // 40 langkah ke selatan, 5,2 m/s
  assert.ok(p.z > 100, `harus bisa jauh melewati pagar, z=${p.z}`);
  assert.ok(Math.abs(p.x) < 3.3, 'lewat bukaan gerbang');
  assert.equal(roomAt(p.x, p.z).id, 'outside');
  // berjalan ke timur di luar: bebas, tidak ada tembok tak terlihat
  let q = { x: 0, z: 80 };
  for (let i = 0; i < 40; i++) q = world.move(q, 5.2, 0);
  assert.ok(q.x > 100, `tidak terkurung di luar, x=${q.x}`);
});

test('pagar keliling padat: tidak bisa menembus pagar di luar bukaan gerbang', () => {
  let p = { x: 20, z: 38 };
  for (let i = 0; i < 30; i++) p = world.move(p, 0, 1);
  assert.ok(p.z < BOUNDS.maxZ, `menembus pagar selatan, z=${p.z}`);
  let q = { x: 30, z: 0 };
  for (let i = 0; i < 30; i++) q = world.move(q, 2, 0);
  assert.ok(q.x < BOUNDS.maxX, `menembus pagar timur, x=${q.x}`);
  let r = { x: 0, z: -20 };
  for (let i = 0; i < 30; i++) r = world.move(r, 0, -1);
  assert.ok(r.z > BOUNDS.minZ - 1, 'tidak menembus pagar utara');
});

test('pepohonan di luar vila: deterministik, di luar kompleks, jalan tanah tidak tertutup, menghalangi jalan', () => {
  const trees = world.props.filter((p) => p.type === 'tree');
  assert.ok(trees.length >= 200);
  for (const t of trees) {
    assert.ok(t.x < BOUNDS.minX || t.x > BOUNDS.maxX || t.z < BOUNDS.minZ || t.z > BOUNDS.maxZ, 'pohon di dalam vila');
    assert.ok(!(Math.abs(t.x) < 5 && t.z > 0 && t.z < 320), 'pohon di jalan tanah');
  }
  const t = trees[0];
  const after = world.move({ x: t.x - 2, z: t.z }, 4, 0);
  assert.ok(after.x < t.x, 'batang pohon menghalangi');
});


test('roomAt memberi nama lokasi yang benar', () => {
  assert.equal(roomAt(0, -10).id, 'wedding_hall');
  assert.equal(roomAt(0, 9).kind, 'pool');
  assert.equal(roomAt(30, 36).id, 'parking');
  assert.equal(roomAt(19, 8).kind, 'guest');
  assert.equal(roomAt(-26, 12).id, 'restaurant');
  assert.equal(roomAt(0, 0).id, 'courtyard');
});

test('jumlah ruangan dan kamar tamu sesuai rancangan', () => {
  assert.equal(ROOMS.filter((r) => r.kind === 'guest').length, 8);
  assert.ok(world.colliders.length > 50);
});

test('titik duduk/tidur: id berurutan, ada kursi aula, restoran, sofa, dan kasur di tiap lantai', () => {
  const spots = world.spots;
  assert.ok(spots.every((s, i) => s.id === i));
  assert.equal(spots.filter((x) => x.kind === 'sleep' && x.level === 0).length, 10);
  assert.equal(spots.filter((x) => x.kind === 'sleep' && x.level === 1).length, 10);
  assert.equal(spots.filter((x) => x.kind === 'sleep' && x.level === 2).length, 1);
  assert.ok(spots.filter((x) => x.kind === 'sit').length >= 190);
  for (const s of spots) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.rot));
});

test('setiap kasur bisa didekati (ada titik bebas dalam jangkauan) dan setiap kursi aula dalam batas dunia', () => {
  for (const s of world.spots.filter((x) => x.kind === 'sleep' && x.level === 0)) {
    let reachable = false;
    for (let a = 0; a < 16 && !reachable; a++) {
      const px = s.x + Math.cos((a / 16) * Math.PI * 2) * 1.5;
      const pz = s.z + Math.sin((a / 16) * Math.PI * 2) * 1.5;
      reachable = ok(px, pz) && Math.hypot(px - s.x, pz - s.z) <= SIT_RANGE;
    }
    assert.ok(reachable, `kasur di (${s.x},${s.z}) tidak bisa didekati`);
  }
  for (const s of world.spots) assert.ok(s.x > BOUNDS.minX && s.x < BOUNDS.maxX && s.z > BOUNDS.minZ && s.z < BOUNDS.maxZ);
});

test('findNearestSpot melewati yang terpakai dan menghormati jangkauan', () => {
  const chair = world.spots[0];
  const near = { x: chair.x, z: chair.z + 0.1 };
  assert.equal(findNearestSpot(near, world.spots).id, chair.id);
  const other = findNearestSpot(near, world.spots, new Set([chair.id]));
  assert.notEqual(other?.id, chair.id);
  assert.equal(findNearestSpot({ x: 0, z: 37 }, world.spots), null);
});

test('spotPose: duduk lebih rendah, tidur berbaring dengan kepala ke papan kepala', () => {
  const sit = spotPose({ kind: 'sit', x: 1, z: 2, rot: 0, level: 0 });
  assert.ok(sit.y < 0 && sit.tilt === 0);
  assert.ok(Math.abs(spotPose({ kind: 'sit', x: 1, z: 2, rot: 0, level: 2 }).y - (levelY(2) + sit.y)) < 1e-9);
  const bed = world.spots.find((s) => s.kind === 'sleep' && s.level === 0 && s.z < 10);
  const p = spotPose(bed);
  assert.equal(p.tilt, -Math.PI / 2);
  assert.ok(p.y > 0.7);
  assert.ok(p.z > bed.z, 'kaki di sisi selatan, kepala di utara');
});

// ------------------------------------------------------------- vila bertingkat
const step = (p, dx, dz) => world.move(p, dx, dz);
const walk = (p, dx, dz, n) => {
  let cur = p;
  for (let i = 0; i < n; i++) cur = step(cur, dx, dz);
  return cur;
};

test('vila punya 3 lantai dan 4 menara dengan 2 lengan tangga masing-masing', () => {
  assert.equal(LEVEL_COUNT, 3);
  assert.equal(world.levels.length, 3);
  assert.equal(TOWERS.length, 4);
  assert.equal(STAIRS.length, 8);
  for (const s of STAIRS) assert.equal(s.to, s.from + 1);
  assert.ok(UPPER_ROOMS.some((r) => r.level === 1) && UPPER_ROOMS.some((r) => r.level === 2));
});

test('berjalan ke utara dari halaman memanjat menara barat sampai lantai 2', () => {
  let p = { x: -39.8, z: -1.5, level: 0, stair: null, y: 0 };
  let maxStairY = 0;
  for (let i = 0; i < 400; i++) {
    p = step(p, 0, -0.1);
    if (p.stair) maxStairY = Math.max(maxStairY, p.y);
  }
  assert.equal(p.level, 2);
  assert.equal(p.stair, null);
  assert.ok(Math.abs(p.y - levelY(2)) < 1e-9);
  assert.ok(maxStairY > LEVEL_HEIGHT, 'harus melewati ketinggian lantai 1 di tangga');
});

test('tangga bisa dituruni kembali ke tanah', () => {
  let p = { x: -39.8, z: -19.4, level: 2, stair: null, y: levelY(2) };
  p = walk(p, 0, 0.1, 400);
  assert.equal(p.level, 0);
  assert.equal(p.stair, null);
  assert.equal(p.y, 0);
});

test('ketinggian di tangga naik mulus dan monoton', () => {
  let p = { x: 39.8, z: -1.5, level: 0, stair: null, y: 0 };
  let last = 0;
  for (let i = 0; i < 400; i++) {
    p = step(p, 0, -0.1);
    assert.ok(p.y >= last - 1e-9, `y turun dari ${last} ke ${p.y}`);
    assert.ok(p.y - last < 0.2, `lonjakan y ${p.y - last}`);
    last = p.y;
  }
  assert.equal(p.level, 2);
});

test('ruang di bawah tangga lantai dasar dan tepi teras tidak bisa dimasuki', () => {
  assert.equal(world.canStand(0, -39.8, -12), false); // di bawah tangga menara barat
  assert.equal(world.canStand(2, -20, -2), false); // di luar teras (selatan)
  assert.equal(world.canStand(2, -14.3, -10), false); // tepi teras menghadap aula yang tinggi
  assert.equal(world.canStand(2, -25, -10), true);
  assert.equal(world.canStand(1, 0, -10), false); // kekosongan di atas aula
});

test('gerak di lantai atas dibatasi tepi: tidak bisa jatuh keluar teras', () => {
  let p = { x: -25, z: -5, level: 2, stair: null, y: levelY(2) };
  p = walk(p, 0, 0.2, 100); // berjalan ke selatan melewati tepi teras
  assert.equal(p.level, 2);
  assert.ok(p.z <= -3 - PLAYER_RADIUS + 1e-6, `keluar dari teras: z=${p.z}`);
});

test('semua ruangan di semua lantai terjangkau dari gerbang (BFS lintas lantai)', () => {
  const cell = 0.5;
  const key = (l, i, j, s) => `${l}|${i}|${j}|${s ?? ''}`;
  const at = (i, j) => ({ x: BOUNDS.minX + i * cell, z: BOUNDS.minZ + j * cell });
  const toI = (x) => Math.round((x - BOUNDS.minX) / cell);
  const toJ = (z) => Math.round((z - BOUNDS.minZ) / cell);
  const start = { x: SPAWN.x, z: SPAWN.z, level: 0, stair: null, y: 0 };
  const seen = new Map([[key(0, toI(start.x), toJ(start.z), null), start]]);
  const queue = [start];
  while (queue.length) {
    const p = queue.pop();
    for (const [dx, dz] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) {
      const n = step(p, dx, dz);
      if (n.x === p.x && n.z === p.z && n.stair === p.stair && n.level === p.level) continue;
      // dunia luar (jalan dan pedesaan) terbuka sangat luas: telusuri hanya kompleks vila beserta sekitar gerbang
      if (n.x < BOUNDS.minX - 1 || n.x > BOUNDS.maxX + 1 || n.z < BOUNDS.minZ - 1 || n.z > BOUNDS.maxZ + 1) continue;
      const k = key(n.level, toI(n.x), toJ(n.z), n.stair);
      if (seen.has(k)) continue;
      seen.set(k, n);
      queue.push(n);
    }
  }
  const reached = (level, x, z) => {
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (seen.has(key(level, toI(x) + di, toJ(z) + dj, null))) return true;
    return false;
  };
  for (const r of ROOMS) assert.ok(reached(0, (r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2), `${r.name} (L0) tidak terjangkau`);
  for (const r of UPPER_ROOMS) {
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    // cari titik bebas terdekat dari pusat (properti bisa menutup pusat)
    let ok2 = false;
    for (let dx = -2; dx <= 2 && !ok2; dx += 0.5) for (let dz = -2; dz <= 2 && !ok2; dz += 0.5) ok2 = reached(r.level, cx + dx, cz + dz);
    assert.ok(ok2, `${r.name} (lantai ${r.level}) tidak terjangkau`);
  }
});

test('titik duduk hanya ditemukan di lantai yang sama', () => {
  const upper = world.spots.find((s) => s.level === 1 && s.kind === 'sleep');
  const here = { x: upper.x, z: upper.z + 1.2 };
  assert.equal(findNearestSpot({ ...here, level: 0 }, world.spots)?.id === upper.id, false);
  assert.equal(findNearestSpot({ ...here, level: 1 }, world.spots)?.id, upper.id);
  assert.equal(findNearestSpot({ ...here, level: 1, stair: 'tower_w_a' }, world.spots), null);
});

test('roomAt mengenali ruangan di lantai atas', () => {
  assert.equal(roomAt(32, -17, 1).id, 'honeymoon');
  assert.equal(roomAt(32, -17, 2).id, 'presidential');
  assert.equal(roomAt(-25, -10, 2).kind, 'terrace');
  assert.equal(roomAt(0, 9, 1).id, 'grounds');
});

test('sameVoiceSpace: ruangan berbeda tidak saling dengar, satu ruangan dan area terbuka boleh', () => {
  assert.equal(sameVoiceSpace({ x: 0, z: -10 }, { x: 5, z: -10 }), true, 'sama-sama di aula');
  assert.equal(sameVoiceSpace({ x: 13, z: -10 }, { x: 15, z: -10 }), false, 'aula vs lobi, dibatasi dinding');
  assert.equal(sameVoiceSpace({ x: 19, z: 8 }, { x: 24, z: 8 }), false, 'dua kamar tamu berbeda');
  assert.equal(sameVoiceSpace({ x: 0, z: 20 }, { x: 8, z: 35 }), true, 'taman dan halaman terbuka');
  assert.equal(sameVoiceSpace({ x: 0, z: -10 }, { x: 0, z: -1 }), false, 'dalam aula vs teras luar');
});

test('sameVoiceSpace: beda lantai tidak saling dengar walau berada di titik x,z yang sama', () => {
  assert.equal(sameVoiceSpace({ x: 20, z: 8, level: 1 }, { x: 20, z: 8, level: 1 }), true);
  assert.equal(sameVoiceSpace({ x: 20, z: 8, y: 0 }, { x: 20, z: 8, y: 3.4 }), false);
  assert.equal(sameVoiceSpace({ x: 30, z: 12, y: 6.8 }, { x: 20, z: 8, y: 6.8 }), true); // sama-sama di teras terbuka
});
