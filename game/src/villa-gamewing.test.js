import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_WALL_HEIGHT, BADMINTON_COURTS, COURT, GAMES, GAME_DOORS, GAME_ROOFS, GAME_ROOMS, GAME_TERMINALS, GAME_ZONES,
  courtLines, gameEdgeHeight, gameRoomAllowed, gameRoomFor, insideGameWing, nearestTerminal,
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
    // beberapa pintu bisa sejajar di x yang sama (plaza): pakai yang terdekat ke terminal
    const door = GAME_DOORS.filter((d) => Math.abs(d.x - t.x) < 1).sort((a, b) => Math.abs(a.z - t.z) - Math.abs(b.z - t.z))[0];
    assert.ok(door && Math.abs(door.z - t.z) < 8, `${t.id} jauh dari pintu`);
  }
});

// ---------------------------------------------------------------- Ruang MOBA (jendela ke server MOBA)
const mobaRoom = GAME_ROOMS.find((r) => r.game === 'moba');

test('ruang MOBA terdaftar, siap dimainkan, dan berada di dalam pagar tanpa menimpa ruangan lain', () => {
  assert.ok(mobaRoom, 'ruang MOBA tidak ada');
  assert.equal(GAMES.moba.room, mobaRoom.id);
  assert.equal(GAMES.moba.status, 'ready');
  assert.equal(GAMES.moba.scary, false);
  const [x1, z1, x2, z2] = mobaRoom.rect;
  assert.ok(x1 > BOUNDS.minX + 1.5 && x2 < BOUNDS.maxX - 1.5 && z1 > BOUNDS.minZ && z2 < BOUNDS.maxZ - 6);
  for (const r of ROOMS.filter((q) => q.id !== mobaRoom.id)) assert.ok(!overlap(mobaRoom.rect, r.rect), `ruang MOBA menimpa ${r.id}`);
  for (const z of ZONES.filter((q) => q.kind !== 'garden')) assert.ok(!overlap(mobaRoom.rect, z.rect), `ruang MOBA menimpa zona ${z.id}`);
});

test('pintu ruang MOBA menghadap plaza: bisa dilewati, dinding menahan di sisi lain', () => {
  const door = GAME_DOORS.find((d) => d.x === mobaRoom.rect[2] && d.z > mobaRoom.rect[1] && d.z < mobaRoom.rect[3]);
  assert.ok(door, 'pintu ruang MOBA tidak ada');
  assert.ok(DOORS.some((q) => q.x === door.x && q.z === door.z));
  assert.ok(door.width >= 3);
  const inside = walk(at(-3, door.z), -0.1, 0, 60);
  assert.ok(inside.x < door.x - 1, `tidak bisa masuk ruang MOBA, x=${inside.x}`);
  assert.equal(roomAt(inside.x, inside.z).id, 'game_moba');
  const blocked = walk(at(-3, 73), -0.1, 0, 60);
  assert.ok(blocked.x > door.x, `menembus dinding ruang MOBA, x=${blocked.x}`);
  const back = walk(at(-15, door.z), 0.1, 0, 120);
  assert.ok(back.x > door.x, 'tidak bisa keluar lewat pintu');
  const wallS = walk(at(-18, 74), 0, 0.1, 60);
  assert.ok(wallS.z < BOUNDS.maxZ - 6, `menembus dinding selatan, z=${wallS.z}`);
});

test('terminal MOBA ada di dalam ruangnya dan dekat pintu; pemain di dalam ruang bisa membukanya', () => {
  const term = GAME_TERMINALS.find((t) => t.game === 'moba');
  const [x1, z1, x2, z2] = mobaRoom.rect;
  assert.ok(term.x > x1 && term.x < x2 && term.z > z1 && term.z < z2);
  assert.ok(Math.hypot(term.x - x2, term.z - 75) < 5, 'terminal jauh dari pintu');
  assert.equal(nearestTerminal(at(term.x - 1.5, term.z))?.id, 'term_moba');
  assert.equal(nearestTerminal(at(-20, 74)), null, 'terlalu jauh dari terminal');
  assert.equal(roomAt(term.x, term.z).id, 'game_moba');
  assert.equal(sameVoiceSpace(at(-18, 75), at(0, 75)), false, 'ruang MOBA terpisah dari plaza');
  assert.equal(overlap(mobaRoom.rect, west.rect), false);
  assert.ok(mobaRoom.rect[1] - west.rect[3] >= 1.6, 'atap ruang MOBA dan arena bulu tangkis saling menimpa');
});

test('pemuat MOBA terpasang di GameHost dan permainannya dibuka dari dalam ruang MOBA saja', async () => {
  const { GAME_LOADERS } = await import('./game-registry.js');
  const { createGameHost } = await import('./game-host.js');
  assert.equal(typeof GAME_LOADERS.moba, 'function');
  const mod = await GAME_LOADERS.moba();
  assert.equal(typeof (mod.default ?? mod.game).mount, 'function');
  const host = createGameHost({
    catalog: GAMES,
    loaders: { moba: async () => ({ default: { mount: () => ({ destroy() {} }) } }) },
    inRoom: (id, me) => roomAt(me.x, me.z, me.level ?? 0).id === GAMES[id]?.room,
  });
  const outside = await host.open('moba', { id: 'a', x: 0, z: 60, level: 0 });
  assert.equal(outside.ok, false);
  assert.equal(outside.reason, 'wrong-room');
  const inside = await host.open('moba', { id: 'a', x: -20, z: 75, level: 0 });
  assert.equal(inside.ok, true);
  host.close('manual');
});
