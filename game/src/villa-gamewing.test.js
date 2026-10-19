import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_WALL_HEIGHT, GAMES, GAME_DOORS, GAME_DOOR_WIDTH, GAME_ROOFS, GAME_ROOMS, GAME_ROOM_SIZE, GAME_SIGNS, GAME_SLOT_ROWS,
  GAME_TERMINALS, GAME_ZONES, freeGameSlots, gameEdgeHeight, gameRoomAllowed, gameRoomFor, gameSlotRect, insideGameWing, nearestTerminal,
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
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const grow = ([x1, z1, x2, z2], m) => [x1 - m, z1 - m, x2 + m, z2 + m];
const center = (r) => ({ x: (r.rect[0] + r.rect[2]) / 2, z: (r.rect[1] + r.rect[3]) / 2 });
// Dinding sisi plaza: tepi timur ruang di sisi barat (x2 <= 0), tepi barat ruang di sisi timur.
const plazaX = (r) => (r.rect[2] <= 0 ? r.rect[2] : r.rect[0]);
const doorOf = (r) => GAME_DOORS.find((d) => d.x === plazaX(r) && d.z > r.rect[1] && d.z < r.rect[3]);
const west = gameRoomFor('badminton');
const east = gameRoomFor('horror');
const mobaRoom = gameRoomFor('moba');

test('ruang game ada di semua tempat acara kecuali masjid', () => {
  assert.equal(gameRoomAllowed('villa'), true);
  assert.equal(gameRoomAllowed('royal'), true);
  assert.equal(gameRoomAllowed('hall'), true);
  assert.equal(gameRoomAllowed('masjid'), false);
});

test('tiap permainan punya ruangnya sendiri, dan ruangnya terdaftar di denah villa', () => {
  for (const [id, g] of Object.entries(GAMES)) {
    const room = gameRoomFor(id);
    assert.ok(room, `permainan ${id} tidak punya ruang`);
    assert.equal(room.id, g.room);
    assert.ok(ROOMS.some((r) => r.id === room.id), `${room.id} tidak ada di ROOMS`);
  }
  const ids = GAME_ROOMS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(GAME_ROOMS.every((r) => r.kind === 'game'));
  assert.ok(ZONES.some((z) => z.id === GAME_ZONES[0].id), 'plaza terdaftar sebagai zona');
});

test('semua ruang game berukuran sama dan kompak (permainan dimainkan di layar penuh, bukan di arena)', () => {
  for (const g of GAME_ROOMS) {
    const [x1, z1, x2, z2] = g.rect;
    assert.ok(near(x2 - x1, GAME_ROOM_SIZE.width) && near(z2 - z1, GAME_ROOM_SIZE.depth), `${g.id}: ${x2 - x1} x ${z2 - z1}`);
  }
  assert.ok(GAME_ROOM_SIZE.width <= 15 && GAME_ROOM_SIZE.depth <= 12, 'ruang game harus kompak');
});

test('slot ruang dihitung dari sisi dan baris, dan slot kosong tersedia untuk permainan berikutnya', () => {
  assert.deepEqual(gameSlotRect('w', 0), [-18, 46, -6, 55]);
  assert.deepEqual(gameSlotRect('e', 0), [6, 46, 18, 55]);
  assert.ok(near(gameSlotRect('w', 1)[1] - gameSlotRect('w', 0)[3], GAME_ROOM_SIZE.gap), 'celah antar baris');
  assert.ok(GAME_SLOT_ROWS >= 3);
  for (const r of GAME_ROOMS) assert.ok(r.rect.every((v, i) => v === gameSlotRect(plazaX(r) < 0 ? 'w' : 'e', Math.round((r.rect[1] - 46) / (GAME_ROOM_SIZE.depth + GAME_ROOM_SIZE.gap)))[i] || near(v, gameSlotRect(plazaX(r) < 0 ? 'w' : 'e', Math.round((r.rect[1] - 46) / (GAME_ROOM_SIZE.depth + GAME_ROOM_SIZE.gap)))[i])), `${r.id} bukan slot`);

  const free = freeGameSlots();
  assert.equal(free.length, 2 * GAME_SLOT_ROWS - GAME_ROOMS.length);
  assert.ok(free.length >= 1, 'harus masih ada slot kosong');
  for (const s of free) {
    assert.deepEqual(s.rect, gameSlotRect(s.side, s.row));
    const [x1, z1, x2, z2] = s.rect;
    assert.ok(x1 > BOUNDS.minX + 1.5 && x2 < BOUNDS.maxX - 1.5 && z1 > BOUNDS.minZ && z2 < BOUNDS.maxZ - 6, `slot ${s.side}${s.row} terlalu dekat pagar`);
    for (const g of GAME_ROOMS) {
      assert.ok(!overlap(s.rect, g.rect), `slot ${s.side}${s.row} menimpa ${g.id}`);
      assert.ok(!overlap(grow(s.rect, 0.8), grow(g.rect, 0.8)), `atap slot ${s.side}${s.row} menimpa atap ${g.id}`);
    }
    for (const r of ROOMS.filter((q) => q.kind !== 'game')) assert.ok(!overlap(s.rect, r.rect), `slot ${s.side}${s.row} menimpa ${r.id}`);
    for (const z of ZONES.filter((q) => q.kind !== 'garden')) assert.ok(!overlap(s.rect, z.rect), `slot ${s.side}${s.row} menimpa zona ${z.id}`);
  }
});

test('ruang di dalam pagar, tidak menimpa ruangan lain, dan menyisakan plaza 12 m', () => {
  for (const g of GAME_ROOMS) {
    const [x1, z1, x2, z2] = g.rect;
    assert.ok(x1 > BOUNDS.minX + 1.5 && x2 < BOUNDS.maxX - 1.5 && z1 > BOUNDS.minZ && z2 < BOUNDS.maxZ - 6, `${g.id} terlalu dekat pagar`);
    for (const r of ROOMS.filter((q) => q.kind !== 'game')) assert.ok(!overlap(g.rect, r.rect), `${g.id} menimpa ${r.id}`);
    for (const z of ZONES.filter((q) => q.kind !== 'garden')) assert.ok(!overlap(g.rect, z.rect), `${g.id} menimpa zona ${z.id}`);
    assert.ok(!overlap(g.rect, GAME_ZONES[0].rect), `${g.id} menimpa plaza`);
  }
  for (let i = 0; i < GAME_ROOMS.length; i++) {
    for (let j = i + 1; j < GAME_ROOMS.length; j++) assert.ok(!overlap(GAME_ROOMS[i].rect, GAME_ROOMS[j].rect), `${GAME_ROOMS[i].id} menimpa ${GAME_ROOMS[j].id}`);
  }
  assert.ok(east.rect[0] - west.rect[2] >= 12, 'plaza tengah kurang dari 12 m');
});

test('tiap ruang punya satu pintu lebar di tengah dinding sisi plaza, terdaftar di DOORS, dan bisa dilewati', () => {
  assert.equal(GAME_DOORS.length, GAME_ROOMS.length);
  for (const r of GAME_ROOMS) {
    const d = doorOf(r);
    assert.ok(d, `${r.id} tanpa pintu`);
    assert.ok(near(d.z, center(r).z), `pintu ${r.id} tidak di tengah dinding`);
    assert.equal(d.orient, 'v');
    assert.equal(d.width, GAME_DOOR_WIDTH);
    assert.ok(d.width >= 3, 'pintu ruang game harus lebar');
    assert.ok(DOORS.some((q) => q.x === d.x && q.z === d.z && q.orient === d.orient), `pintu (${d.x},${d.z}) tidak terdaftar`);
    assert.ok(isWalkable(d.x, d.z, PLAYER_RADIUS, world.colliders, BOUNDS), `pintu (${d.x},${d.z}) terhalang`);
  }
});

test('dinding ruang lebih tinggi, atap ruang berada tepat di puncaknya dan atap antar ruang tidak saling menimpa', () => {
  assert.ok(ARENA_WALL_HEIGHT <= 4 && ARENA_WALL_HEIGHT > WALL_HEIGHT);
  const roomWalls = world.walls.filter((w) => gameEdgeHeight(w) !== null);
  assert.ok(roomWalls.length >= 8, 'dinding ruang game tidak ditemukan');
  for (const w of roomWalls) assert.equal(w.h, ARENA_WALL_HEIGHT);
  const kitchenWall = world.walls.find((w) => w.orient === 'h' && Math.abs(w.coord - 30) < 1e-6);
  assert.equal(kitchenWall?.h, undefined, 'dinding ruangan lain tidak boleh ikut berubah');
  assert.equal(GAME_ROOFS.length, GAME_ROOMS.length);
  for (const r of GAME_ROOFS) {
    assert.ok(ROOFS.some((q) => q.id === r.id && q.base === ARENA_WALL_HEIGHT));
    assert.ok(!r.id.endsWith('_roof'));
  }
  for (let i = 0; i < GAME_ROOFS.length; i++) {
    for (let j = i + 1; j < GAME_ROOFS.length; j++) {
      const a = GAME_ROOFS[i];
      const b = GAME_ROOFS[j];
      assert.ok(!overlap(grow(a.rect, a.overhang), grow(b.rect, b.overhang)), `atap ${a.id} dan ${b.id} saling menimpa`);
    }
  }
});

test('jalan lurus dari taman ke gerbang tetap terbuka (plaza), dan gerbang ada di sisi selatan baru', () => {
  const end = walk(at(SPAWN.x, SPAWN.z), 0, 0.1, 480);
  assert.ok(end.z > BOUNDS.maxZ - 0.5 && Math.abs(end.x) < 0.5, `jalan tengah terhalang di z=${end.z}`);
  assert.equal(BOUNDS.maxZ, 84);
  assert.equal(roomAt(0, 60).name, 'Plaza Game Center');
});

test('pohon palem tidak tumbuh di dalam ruang game', () => {
  for (const p of world.props.filter((q) => q.type === 'palm')) assert.ok(!insideGameWing(p.x, p.z, 0.9), `palem di (${p.x},${p.z}) di dalam ruang game`);
});

test('masuk dari plaza ke tiap ruang lewat pintunya', () => {
  for (const r of GAME_ROOMS) {
    const d = doorOf(r);
    const dir = d.x < 0 ? -1 : 1; // arah dari plaza ke dalam ruang
    const end = walk(at(d.x - dir * 4, d.z), dir * 0.1, 0, 90);
    assert.ok(Math.abs(end.x) > Math.abs(d.x) + 3, `tidak bisa masuk ${r.id}, x=${end.x}`);
    assert.equal(roomAt(end.x, end.z).id, r.id);
  }
  const toWest = walk(at(-2, center(west).z), -0.1, 0, 90);
  assert.equal(roomAt(toWest.x, toWest.z).id, 'game_badminton');
  const toEast = walk(at(2, center(east).z), 0.1, 0, 90);
  assert.equal(roomAt(toEast.x, toEast.z).id, 'game_horror');
});

test('dinding menahan pemain dari plaza di luar pintu, dan dari dalam ruang ke empat arah', () => {
  for (const r of GAME_ROOMS) {
    const d = doorOf(r);
    const dir = d.x < 0 ? -1 : 1;
    const [x1, z1, x2, z2] = r.rect;
    // di sebelah pintu (bukan di bukaannya): dinding sisi plaza menahan
    const blocked = walk(at(d.x - dir * 3, z1 + 1.5), dir * 0.1, 0, 40);
    assert.ok(dir * (blocked.x - d.x) < 0, `menembus dinding plaza ${r.id}, x=${blocked.x}`);
    // dari dalam ruang
    const c = center(r);
    const toX1 = walk(at(c.x, z1 + 1.5), -0.1, 0, 80);
    assert.ok(toX1.x > x1, `menembus dinding barat ${r.id}, x=${toX1.x}`);
    const toX2 = walk(at(c.x, z1 + 1.5), 0.1, 0, 80);
    assert.ok(toX2.x < x2, `menembus dinding timur ${r.id}, x=${toX2.x}`);
    const toZ1 = walk(at(c.x, c.z), 0, -0.1, 80);
    assert.ok(toZ1.z > z1, `menembus dinding utara ${r.id}, z=${toZ1.z}`);
    const toZ2 = walk(at(c.x, c.z), 0, 0.1, 80);
    assert.ok(toZ2.z < z2, `menembus dinding selatan ${r.id}, z=${toZ2.z}`);
  }
});

test('roomAt dan suara: tiap ruang terpisah dari plaza dan satu sama lain', () => {
  const w = center(west);
  const e = center(east);
  assert.equal(roomAt(w.x, w.z).name, 'Ruang Bulu Tangkis');
  assert.equal(roomAt(e.x, e.z).name, 'Ruang Mansion Horor');
  assert.equal(roomAt(e.x, e.z).indoor, true);
  assert.equal(roomAt(center(mobaRoom).x, center(mobaRoom).z).id, 'game_moba');
  assert.equal(sameVoiceSpace(at(w.x, w.z), at(e.x, e.z)), false);
  assert.equal(sameVoiceSpace(at(w.x, west.rect[1] + 2), at(w.x + 3, west.rect[3] - 2)), true, 'satu ruang');
  assert.equal(sameVoiceSpace(at(w.x, w.z), at(0, w.z)), false, 'ruang dan plaza dipisahkan dinding');
  assert.equal(sameVoiceSpace(at(w.x, w.z), at(center(mobaRoom).x, center(mobaRoom).z)), false, 'dua ruang berbeda');
});

test('terminal berada di dalam ruangnya, menghadap ke dalam, dekat pintu tetapi tidak menutupi bukaannya', () => {
  assert.equal(GAME_TERMINALS.length, GAME_ROOMS.length);
  assert.equal(new Set(GAME_TERMINALS.map((t) => t.id)).size, GAME_TERMINALS.length);
  for (const t of GAME_TERMINALS) {
    const room = gameRoomFor(t.game);
    assert.ok(room, `${t.id} tanpa ruang`);
    assert.ok(t.x > room.rect[0] && t.x < room.rect[2] && t.z > room.rect[1] && t.z < room.rect[3], `${t.id} di luar ruangnya`);
    assert.equal(t.face, plazaX(room) < 0 ? 'w' : 'e');
    const door = doorOf(room);
    assert.ok(Math.abs(t.z - door.z) >= door.width / 2, `${t.id} menutupi bukaan pintu`);
    assert.ok(Math.hypot(t.x - door.x, t.z - door.z) < 4, `${t.id} jauh dari pintu`);
  }
});

test('papan nama: satu per ruang, sejajar pintunya, dan hanya ruang seram yang berlabel peringatan', () => {
  assert.equal(GAME_SIGNS.length, GAME_ROOMS.length);
  for (const s of GAME_SIGNS) {
    const door = doorOf(gameRoomFor(s.game));
    assert.ok(near(s.z, door.z), `${s.id} tidak sejajar pintu`);
    assert.equal(!!s.scary, s.game === 'horror');
  }
});

// ---------------------------------------------------------------- Ruang MOBA (jendela ke server MOBA)
test('ruang MOBA terdaftar dan berstatus segera hadir (menunggu server MOBA)', () => {
  assert.ok(mobaRoom, 'ruang MOBA tidak ada');
  assert.equal(GAMES.moba.room, mobaRoom.id);
  assert.equal(GAMES.moba.status, 'soon');
  assert.equal(GAMES.moba.scary, false);
  for (const r of ROOMS.filter((q) => q.id !== mobaRoom.id)) assert.ok(!overlap(mobaRoom.rect, r.rect), `ruang MOBA menimpa ${r.id}`);
});

test('pintu ruang MOBA menghadap plaza: bisa dilewati, bisa keluar lagi, dinding menahan di sisi lain', () => {
  const door = doorOf(mobaRoom);
  assert.ok(door, 'pintu ruang MOBA tidak ada');
  const inside = walk(at(-3, door.z), -0.1, 0, 60);
  assert.ok(inside.x < door.x - 1, `tidak bisa masuk ruang MOBA, x=${inside.x}`);
  assert.equal(roomAt(inside.x, inside.z).id, 'game_moba');
  const blocked = walk(at(-3, mobaRoom.rect[1] + 1.5), -0.1, 0, 60);
  assert.ok(blocked.x > door.x, `menembus dinding ruang MOBA, x=${blocked.x}`);
  const back = walk(at(center(mobaRoom).x, door.z), 0.1, 0, 120);
  assert.ok(back.x > door.x, 'tidak bisa keluar lewat pintu');
});

test('terminal MOBA bisa dibuka dari dalam ruang MOBA saja', () => {
  const term = GAME_TERMINALS.find((t) => t.game === 'moba');
  assert.equal(nearestTerminal(at(term.x - 1.5, term.z))?.id, 'term_moba');
  assert.equal(nearestTerminal(at(center(mobaRoom).x, center(mobaRoom).z)), null, 'terlalu jauh dari terminal');
  assert.equal(roomAt(term.x, term.z).id, 'game_moba');
  assert.equal(sameVoiceSpace(at(term.x - 1.5, term.z), at(0, term.z)), false, 'ruang MOBA terpisah dari plaza');
});

// ---------------------------------------------------------------- GameHost
test('bulu tangkis siap dimainkan dan pemuatnya terpasang di GameHost; hanya bisa dibuka dari dalam ruangnya', async () => {
  const { GAME_LOADERS } = await import('./game-registry.js');
  const { createGameHost } = await import('./game-host.js');
  assert.equal(GAMES.badminton.status, 'ready');
  assert.equal(GAMES.horror.status, 'soon');
  assert.equal(typeof GAME_LOADERS.badminton, 'function');
  const mod = await GAME_LOADERS.badminton();
  assert.equal(typeof (mod.default ?? mod.game).mount, 'function');

  const host = createGameHost({
    catalog: GAMES,
    loaders: { badminton: async () => ({ default: { mount: () => ({ destroy() {} }) } }) },
    inRoom: (id, me) => roomAt(me.x, me.z, me.level ?? 0).id === GAMES[id]?.room,
  });
  const outside = await host.open('badminton', { id: 'a', x: 0, z: center(west).z, level: 0 });
  assert.equal(outside.ok, false);
  assert.equal(outside.reason, 'wrong-room');
  const inside = await host.open('badminton', { id: 'a', x: center(west).x, z: center(west).z, level: 0 });
  assert.equal(inside.ok, true);
  host.close('manual');
});

test('pemuat MOBA terpasang dan permainannya berstatus segera hadir', async () => {
  const { GAME_LOADERS } = await import('./game-registry.js');
  const { createGameHost } = await import('./game-host.js');
  assert.equal(typeof GAME_LOADERS.moba, 'function');
  const mod = await GAME_LOADERS.moba();
  assert.equal(typeof (mod.default ?? mod.game).mount, 'function');
  const soonHost = createGameHost({ catalog: GAMES, loaders: GAME_LOADERS, inRoom: () => true });
  assert.equal((await soonHost.open('moba', { id: 'a', x: center(mobaRoom).x, z: center(mobaRoom).z, level: 0 })).reason, 'soon');
});
