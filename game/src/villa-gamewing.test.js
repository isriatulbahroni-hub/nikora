import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_WALL_HEIGHT, BADMINTON_COURTS, COURT, GAMES, GAME_DOORS, GAME_ROOFS, GAME_ROOMS, GAME_TERMINALS, GAME_ZONES,
  courtLines, gameEdgeHeight, gameRoomAllowed, gameRoomFor, insideGameWing,
} from './villa-gamewing.js';
import { BOUNDS, DOORS, PLAYER_RADIUS, ROOFS, ROOMS, SPAWN, WALL_HEIGHT, ZONES, getVillaWorld, isWalkable, roomAt, sameVoiceSpace } from './villa-layout.js';

const world = getVillaWorld();
const walk = (p, dx, dz, n) => {
  let cur = p;
  for (let i = 0; i < n; i++) cur = world.move(cur, dx, dz);
  return cur;
};
const at = (x, z) => ({ x, z, level: 0, stair: null, y: 0 });
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const west = GAME_ROOMS.find((r) => r.game === 'badminton');
const east = GAME_ROOMS.find((r) => r.game === 'horror');

test('ruang game ada di semua tempat acara kecuali masjid', () => {
  assert.equal(gameRoomAllowed('villa'), true);
  assert.equal(gameRoomAllowed('royal'), true);
  assert.equal(gameRoomAllowed('hall'), true);
  assert.equal(gameRoomAllowed('masjid'), false);
});

test('tiap permainan punya arenanya sendiri, dan arenanya terdaftar di denah villa', () => {
  for (const [id, g] of Object.entries(GAMES)) {
    const room = gameRoomFor(id);
    assert.ok(room, `permainan ${id} tidak punya arena`);
    assert.equal(room.id, g.room);
    assert.ok(ROOMS.some((r) => r.id === room.id), `${room.id} tidak ada di ROOMS`);
  }
  const ids = GAME_ROOMS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(GAME_ROOMS.every((r) => r.kind === 'game'));
  assert.ok(ZONES.some((z) => z.id === GAME_ZONES[0].id), 'plaza terdaftar sebagai zona');
});

test('arena berukuran sungguhan: muat lapangan resmi dengan ruang gerak lega', () => {
  const [x1, z1, x2, z2] = west.rect;
  assert.ok(x2 - x1 >= 30 && z2 - z1 >= 20, `arena terlalu kecil: ${x2 - x1} x ${z2 - z1}`);
  assert.equal(BADMINTON_COURTS.length, 2);
  for (const c of BADMINTON_COURTS) {
    const margin = 2.5; // ruang lari di sekeliling lapangan
    assert.ok(c.x - COURT.length / 2 >= x1 + margin && c.x + COURT.length / 2 <= x2 - margin, 'lapangan terlalu dekat dinding (sumbu x)');
    assert.ok(c.z - COURT.width / 2 >= z1 + margin && c.z + COURT.width / 2 <= z2 - margin, 'lapangan terlalu dekat dinding (sumbu z)');
  }
  const [a, b] = BADMINTON_COURTS;
  assert.ok(Math.abs(a.z - b.z) - COURT.width >= 3, 'dua lapangan terlalu rapat');
  // pintu (z = 58) jatuh di antara kedua lapangan, bukan di atas lapangan
  const door = GAME_DOORS.find((d) => d.x === -6);
  assert.ok(door.z > a.z + COURT.width / 2 && door.z < b.z - COURT.width / 2);
  const [h1, hz1, h2, hz2] = east.rect;
  assert.ok(h2 - h1 >= 30 && hz2 - hz1 >= 20);
});

test('garis lapangan sesuai ukuran resmi BWF', () => {
  const lines = courtLines(0, 0);
  assert.equal(lines.length, 13);
  const ext = (f) => lines.reduce((m, l) => Math.max(m, f(l)), -Infinity);
  assert.ok(Math.abs(ext((l) => l.x + l.w / 2) - 6.7 - 0.02) < 1e-9, 'panjang 13,4 m');
  assert.ok(Math.abs(ext((l) => l.z + l.d / 2) - 3.05 - 0.02) < 1e-9, 'lebar 6,1 m');
  const sideZ = lines.filter((l) => l.d === COURT.line && l.w === COURT.length).map((l) => Math.abs(l.z));
  assert.ok(sideZ.some((z) => Math.abs(z - 2.59) < 1e-9), 'garis samping tunggal 5,18 m');
  const xs = lines.filter((l) => l.w === COURT.line && l.d === COURT.width).map((l) => Math.abs(l.x)).sort((p, q) => p - q);
  assert.ok(xs.some((x) => Math.abs(x - 1.98) < 1e-9), 'servis pendek 1,98 m dari jaring');
  assert.ok(xs.some((x) => Math.abs(x - 5.94) < 1e-9), 'servis belakang ganda 0,76 m dari garis belakang');
  assert.ok(xs.includes(0), 'garis jaring di tengah');
});

test('arena di dalam pagar, tidak menimpa ruangan lain, dan menyisakan plaza 12 m', () => {
  for (const g of GAME_ROOMS) {
    const [x1, z1, x2, z2] = g.rect;
    assert.ok(x1 > BOUNDS.minX + 1.5 && x2 < BOUNDS.maxX - 1.5 && z1 > BOUNDS.minZ && z2 < BOUNDS.maxZ - 6, `${g.id} terlalu dekat pagar`);
    for (const r of ROOMS.filter((q) => q.kind !== 'game')) assert.ok(!overlap(g.rect, r.rect), `${g.id} menimpa ${r.id}`);
  }
  assert.ok(!overlap(west.rect, east.rect));
  assert.ok(east.rect[0] - west.rect[2] >= 12, 'plaza tengah kurang dari 12 m');
});

test('pintu arena terdaftar di DOORS, lebar, dan bisa dilewati', () => {
  for (const d of GAME_DOORS) {
    assert.ok(DOORS.some((q) => q.x === d.x && q.z === d.z && q.orient === d.orient), `pintu (${d.x},${d.z}) tidak terdaftar`);
    assert.ok(d.width >= 3, 'pintu arena harus lebar');
    assert.ok(isWalkable(d.x, d.z, PLAYER_RADIUS, world.colliders, BOUNDS), `pintu (${d.x},${d.z}) terhalang`);
  }
});

test('dinding arena lebih tinggi, atap arena berada tepat di puncaknya', () => {
  assert.ok(ARENA_WALL_HEIGHT <= 4 && ARENA_WALL_HEIGHT > WALL_HEIGHT);
  const arenaWalls = world.walls.filter((w) => gameEdgeHeight(w) !== null);
  assert.ok(arenaWalls.length >= 8, 'dinding arena tidak ditemukan');
  for (const w of arenaWalls) assert.equal(w.h, ARENA_WALL_HEIGHT);
  const kitchenWall = world.walls.find((w) => w.orient === 'h' && Math.abs(w.coord - 30) < 1e-6);
  assert.equal(kitchenWall?.h, undefined, 'dinding ruangan lain tidak boleh ikut berubah');
  for (const r of GAME_ROOFS) {
    assert.ok(ROOFS.some((q) => q.id === r.id && q.base === ARENA_WALL_HEIGHT));
    assert.ok(!r.id.endsWith('_roof'));
  }
});

test('jalan lurus dari taman ke gerbang tetap terbuka (plaza), dan gerbang ada di sisi selatan baru', () => {
  const end = walk(at(SPAWN.x, SPAWN.z), 0, 0.1, 480);
  assert.ok(end.z > BOUNDS.maxZ - 0.5 && Math.abs(end.x) < 0.5, `jalan tengah terhalang di z=${end.z}`);
  assert.equal(BOUNDS.maxZ, 84);
  assert.equal(roomAt(0, 60).name, 'Plaza Game Center');
});

test('pohon palem tidak tumbuh di dalam arena', () => {
  for (const p of world.props.filter((q) => q.type === 'palm')) assert.ok(!insideGameWing(p.x, p.z, 0.9), `palem di (${p.x},${p.z}) di dalam arena`);
});

test('masuk dari plaza ke kedua arena lewat pintu masing-masing', () => {
  const toWest = walk(at(-2, 58), -0.1, 0, 90);
  assert.ok(toWest.x < -9, `tidak bisa masuk arena bulu tangkis, x=${toWest.x}`);
  assert.equal(roomAt(toWest.x, toWest.z).id, 'game_badminton');
  const toEast = walk(at(2, 58), 0.1, 0, 90);
  assert.ok(toEast.x > 9, `tidak bisa masuk ruang horor, x=${toEast.x}`);
  assert.equal(roomAt(toEast.x, toEast.z).id, 'game_horror');
});

test('dinding arena menahan pemain dari luar dan dari plaza di luar pintu', () => {
  const wallW = walk(at(-3, 50), -0.1, 0, 40);
  assert.ok(wallW.x > -6, `menembus dinding barat plaza, x=${wallW.x}`);
  const wallE = walk(at(3, 50), 0.1, 0, 40);
  assert.ok(wallE.x < 6, `menembus dinding timur plaza, x=${wallE.x}`);
  const outW = walk(at(-41, 58), 0.1, 0, 40);
  assert.ok(outW.x < -40, `menembus dinding barat, x=${outW.x}`);
  const outS = walk(at(-20, 72), 0, -0.1, 40);
  assert.ok(outS.z > 70, `menembus dinding selatan, z=${outS.z}`);
});

test('roomAt dan suara: tiap arena terpisah dari plaza dan satu sama lain', () => {
  assert.equal(roomAt(-23, 58).name, 'Arena Bulu Tangkis');
  assert.equal(roomAt(23, 58).name, 'Ruang Mansion Horor');
  assert.equal(roomAt(23, 58).indoor, true);
  assert.equal(sameVoiceSpace(at(-23, 58), at(23, 58)), false);
  assert.equal(sameVoiceSpace(at(-23, 55), at(-20, 60)), true, 'satu arena');
  assert.equal(sameVoiceSpace(at(-23, 58), at(0, 60)), false, 'arena dan plaza dipisahkan dinding');
});

test('terminal berada di dalam arenanya, dekat pintu', () => {
  for (const t of GAME_TERMINALS) {
    const room = gameRoomFor(t.game);
    assert.ok(t.x > room.rect[0] && t.x < room.rect[2] && t.z > room.rect[1] && t.z < room.rect[3], `${t.id} di luar arenanya`);
    const door = GAME_DOORS.find((d) => Math.abs(d.x - t.x) < 1);
    assert.ok(door && Math.abs(door.z - t.z) < 8, `${t.id} jauh dari pintu`);
  }
});
