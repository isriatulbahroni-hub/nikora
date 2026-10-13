import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, sanitizeName, ROOM_RULES } from './room.js';
import { GAME_RULES } from '../../game/src/game-rules.js';

test('input diagonal dinormalisasi: tidak bisa bergerak lebih cepat', () => {
  const room = new Room();
  room.addPlayer('a', 'A');
  const p = room.players.get('a');
  const { x, z } = p;
  room.setInput('a', { x: 1, z: 1, rot: 0, seq: 1 });
  room.step(1);
  assert.ok(Math.hypot(p.x - x, p.z - z) <= ROOM_RULES.playerSpeed + 1e-6);
});

test('input melebihi 1 di-clamp (anti speed-hack)', () => {
  const room = new Room();
  room.addPlayer('a', 'A');
  const p = room.players.get('a');
  const { x } = p;
  room.setInput('a', { x: 9999, z: 0, rot: 0, seq: 1 });
  room.step(0.1);
  assert.ok(Math.abs(p.x - x) <= ROOM_RULES.playerSpeed * 0.1 + 1e-6);
});

test('dt besar dibatasi dan posisi tetap dalam arena', () => {
  const room = new Room();
  room.addPlayer('a', 'A');
  room.setInput('a', { x: 1, z: 0, rot: 0, seq: 1 });
  room.step(1000);
  const p = room.players.get('a');
  assert.ok(Math.abs(p.x) <= GAME_RULES.arenaLimit);
  room.step(Infinity);
  room.step(NaN);
  assert.ok(Number.isFinite(p.x));
});

test('input tidak valid atau seq lama ditolak', () => {
  const room = new Room();
  room.addPlayer('a', 'A');
  assert.equal(room.setInput('a', { x: NaN, z: 0, rot: 0, seq: 1 }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1.5 }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 5 }), true);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 5 }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 2 }), false);
  assert.equal(room.setInput('nobody', { x: 0, z: 0, rot: 0, seq: 1 }), false);
  assert.equal(room.setInput('a', null), false);
});

test('ruang penuh menolak pemain baru; id ganda ditolak', () => {
  const room = new Room({ maxPlayers: 2 });
  assert.ok(room.addPlayer('a', 'A'));
  assert.equal(room.addPlayer('a', 'A2'), null);
  assert.ok(room.addPlayer('b', 'B'));
  assert.equal(room.addPlayer('c', 'C'), null);
  room.removePlayer('a');
  assert.ok(room.addPlayer('c', 'C'));
});

test('sanitizeName membersihkan karakter berbahaya dan memotong panjang', () => {
  assert.equal(sanitizeName('<b>Ron</b>'), 'bRon/b');
  assert.equal(sanitizeName('   '), 'Tamu');
  assert.equal(sanitizeName(123), 'Tamu');
  assert.equal(sanitizeName('x'.repeat(100)).length, ROOM_RULES.maxNameLength);
});

test('pemain muncul di lorong pintu masuk, bukan di dalam meja', async () => {
  const { TABLES, HALL } = await import('../../game/src/hall-layout.js');
  const room = new Room();
  for (let i = 0; i < 50; i += 1) {
    const p = room.addPlayer(`p${i}`, 'T');
    for (const t of TABLES) assert.ok(Math.hypot(p.x - t.x, p.z - t.z) > HALL.tableRadius + HALL.playerRadius);
    assert.ok(Math.abs(p.x) <= GAME_RULES.arenaLimit && Math.abs(p.z) <= GAME_RULES.arenaLimit);
  }
});

test('meja menghalangi gerak pemain di server', async () => {
  const { TABLES, HALL } = await import('../../game/src/hall-layout.js');
  const room = new Room();
  const p = room.addPlayer('a', 'A');
  p.x = TABLES[4].x;
  p.z = TABLES[4].z + 3;
  room.setInput('a', { x: 0, z: -1, rot: 0, seq: 1 });
  for (let i = 0; i < 60; i += 1) room.step(0.05);
  assert.ok(Math.hypot(p.x - TABLES[4].x, p.z - TABLES[4].z) >= HALL.tableRadius + HALL.playerRadius - 1e-6);
});

test('duduk: harus dekat, kursi kosong, dan tidak bergerak saat duduk', async () => {
  const { SEATS } = await import('../../game/src/hall-layout.js');
  const room = new Room();
  const a = room.addPlayer('a', 'A');
  const b = room.addPlayer('b', 'B');
  const seat = SEATS[0];
  a.x = seat.x + 0.4; a.z = seat.z;
  b.x = seat.x - 0.4; b.z = seat.z;
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: seat.id }), true);
  assert.equal(a.sit, seat.id);
  assert.equal(a.x, seat.x);
  assert.equal(room.setInput('b', { x: 0, z: 0, rot: 0, seq: 1, sit: seat.id }), false); // kursi terisi
  room.setInput('a', { x: 1, z: 0, rot: 0, seq: 2, sit: seat.id });
  room.step(1);
  assert.equal(a.x, seat.x); // tetap duduk
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 3, sit: null }), true);
  assert.equal(a.sit, null);
  assert.equal(room.snapshot().find((p) => p.id === 'a').sit, null);
});

test('duduk ditolak bila jauh atau id kursi tidak valid', async () => {
  const { SEATS } = await import('../../game/src/hall-layout.js');
  const room = new Room();
  room.addPlayer('a', 'A'); // di pintu masuk, jauh dari semua kursi
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: 0 }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 2, sit: -1 }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 3, sit: SEATS.length }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 4, sit: 1.5 }), false);
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 5, sit: '3' }), false);
});

test('chat dibersihkan, dibatasi panjang dan frekuensi', async () => {
  const { sanitizeChat } = await import('./room.js');
  assert.equal(sanitizeChat('  halo   <b>dunia</b>\n'), 'halo bdunia/b');
  assert.equal(sanitizeChat(42), '');
  assert.equal(sanitizeChat('x'.repeat(500)).length, ROOM_RULES.maxChatLength);
  const room = new Room();
  room.addPlayer('a', 'Ani');
  const first = room.chat('a', 'Halo semua', 1000);
  assert.deepEqual(first, { id: 'a', name: 'Ani', text: 'Halo semua', ts: 1000 });
  assert.equal(room.chat('a', 'spam', 1200), null); // terlalu cepat
  assert.ok(room.chat('a', 'oke', 1000 + ROOM_RULES.chatIntervalMs));
  assert.equal(room.chat('a', '   ', 5000), null); // kosong
  assert.equal(room.chat('nobody', 'hai', 5000), null);
});

import { Room as GreetRoom } from './room.js';

test('salaman: ajakan butuh persetujuan, keduanya saling berhadapan lalu selesai sendiri', () => {
  const room = new GreetRoom();
  room.addPlayer('a', 'A');
  room.addPlayer('b', 'B');
  Object.assign(room.players.get('a'), { x: 0, z: 0 });
  Object.assign(room.players.get('b'), { x: 1.5, z: 0 });
  const req = room.requestGreet('a', 'b', 'handshake', 1000);
  assert.equal(req.auto, false);
  assert.equal(room.players.get('a').act, null);
  const ok = room.respondGreet('b', 'a', true, 2000);
  assert.equal(ok.kind, 'handshake');
  const snap = room.snapshot();
  assert.equal(snap.find((p) => p.id === 'a').with, 'b');
  assert.equal(snap.find((p) => p.id === 'b').act, 'handshake');
  const dist = Math.hypot(room.players.get('a').x - room.players.get('b').x, room.players.get('a').z - room.players.get('b').z);
  assert.ok(Math.abs(dist - 0.9) < 0.01);
  room.expire(2000 + room.rules.greetDurationMs + 1);
  assert.equal(room.players.get('a').act, null);
  assert.equal(room.players.get('b').act, null);
});

test('salaman: ditolak bila jauh, sedang duduk, atau jenis tidak dikenal', () => {
  const room = new GreetRoom();
  room.addPlayer('a', 'A');
  room.addPlayer('b', 'B');
  Object.assign(room.players.get('a'), { x: 0, z: 0 });
  Object.assign(room.players.get('b'), { x: 9, z: 0 });
  assert.equal(room.requestGreet('a', 'b', 'handshake'), null);
  room.players.get('b').x = 1;
  assert.equal(room.requestGreet('a', 'b', 'kiss'), null);
  room.players.get('b').sit = 0;
  assert.equal(room.requestGreet('a', 'b', 'handshake'), null);
});

test('salaman: ajakan kedaluwarsa dan penolakan tidak mengubah pemain', () => {
  const room = new GreetRoom();
  room.addPlayer('a', 'A');
  room.addPlayer('b', 'B');
  Object.assign(room.players.get('a'), { x: 0, z: 0 });
  Object.assign(room.players.get('b'), { x: 1, z: 0 });
  room.requestGreet('a', 'b', 'highfive', 0);
  assert.equal(room.respondGreet('b', 'a', true, 99999), null);
  room.requestGreet('a', 'b', 'highfive', 100000);
  assert.equal(room.respondGreet('b', 'a', false, 100100).declined, true);
  assert.equal(room.players.get('a').act ?? null, null);
});

test('dunia vila: spawn valid, dinding dan kolam menahan pemain', async () => {
  const { getVillaWorld, isWalkable, PLAYER_RADIUS } = await import('../../game/src/villa-layout.js');
  const world = getVillaWorld();
  const room = new Room({ world, maxPlayers: 100 });
  for (let i = 0; i < 12; i++) {
    const p = room.addPlayer(`p${i}`, `P${i}`);
    assert.ok(isWalkable(p.x, p.z, PLAYER_RADIUS, world.colliders), `spawn ${i} di dalam penghalang`);
  }
  const p = room.players.get('p2');
  room.setInput('p2', { x: 0.3, z: -1, rot: 0, seq: 1 });
  for (let i = 0; i < 600; i++) room.step(0.05);
  assert.ok(isWalkable(p.x, p.z, PLAYER_RADIUS, world.colliders), 'berakhir di dalam penghalang');
  Object.assign(p, { x: 0, z: 34 }); // sejajar gerbang, lalu berjalan ke selatan terus
  room.setInput('p2', { x: 0, z: 1, rot: 0, seq: 2 });
  for (let i = 0; i < 600; i++) room.step(0.05);
  assert.ok(p.z > world.bounds.maxZ, 'pemain boleh keluar gerbang vila dan berjalan di luar');
  assert.ok(p.z <= world.limit.maxZ - PLAYER_RADIUS + 1e-6, 'pengaman jarak server');
});

test('dunia vila: duduk di kursi, tidur di kasur, tempat dipakai orang lain ditolak, terlalu jauh ditolak', async () => {
  const { getVillaWorld } = await import('../../game/src/villa-layout.js');
  const world = getVillaWorld();
  const room = new Room({ world, maxPlayers: 100 });
  const a = room.addPlayer('a', 'A');
  const b = room.addPlayer('b', 'B');
  const chair = world.spots.find((s) => s.kind === 'sit');
  const bed = world.spots.find((s) => s.kind === 'sleep');
  let seq = 0;
  const send = (id, sit) => room.setInput(id, { x: 0, z: 0, rot: 0, seq: ++seq, sit });

  Object.assign(a, { x: 0, z: 37 }); // jauh dari kursi aula
  assert.equal(send('a', chair.id), false, 'terlalu jauh');
  Object.assign(a, { x: chair.x + 1, z: chair.z });
  assert.equal(send('a', chair.id), true);
  assert.equal(a.sit, chair.id);
  assert.equal(a.x, chair.x);
  assert.equal(a.z, chair.z);
  Object.assign(b, { x: chair.x - 0.5, z: chair.z });
  assert.equal(send('b', chair.id), false, 'kursi sudah dipakai');

  room.setInput('a', { x: 1, z: 0, rot: 0, seq: ++seq, sit: chair.id });
  room.step(1);
  assert.equal(a.x, chair.x, 'tidak bergerak saat duduk');
  assert.equal(send('a', null), true);
  assert.equal(a.sit, null);

  Object.assign(b, { x: bed.x + 1.4, z: bed.z });
  assert.equal(send('b', bed.id), true, 'tidur di kasur');
  assert.equal(room.snapshot().find((p) => p.id === 'b').sit, bed.id);
  assert.equal(send('b', 99999), false, 'id tidak valid');
});

test('vila bertingkat: server melacak lantai, tangga, dan y saat naik tangga', async () => {
  const { getVillaWorld } = await import('../../game/src/villa-layout.js');
  const world = getVillaWorld();
  const room = new Room({ world });
  const p = room.addPlayer('a', 'A');
  assert.equal(p.level, 0);
  p.x = -39.8; p.z = -1.5; // di depan menara tangga barat
  room.setInput('a', { x: 0, z: -1, rot: 0, seq: 1 });
  let sawStair = false;
  for (let i = 0; i < 300; i += 1) {
    room.step(0.05);
    if (p.stair) sawStair = true;
  }
  assert.ok(sawStair, 'harus pernah berada di tangga');
  assert.equal(p.level, 2);
  assert.equal(p.stair, null);
  assert.ok(Math.abs(p.y - 6.8) < 1e-9);
  const snap = room.snapshot().find((s) => s.id === 'a');
  assert.equal(snap.y, 6.8);
});

test('vila bertingkat: duduk ditolak di lantai yang berbeda, interaksi ditolak beda lantai', async () => {
  const { getVillaWorld } = await import('../../game/src/villa-layout.js');
  const world = getVillaWorld();
  const room = new Room({ world });
  const a = room.addPlayer('a', 'A');
  const b = room.addPlayer('b', 'B');
  const upperBed = world.spots.find((s) => s.kind === 'sleep' && s.level === 1);
  a.x = upperBed.x; a.z = upperBed.z + 1; // posisi horizontal sama, tetapi pemain di lantai dasar
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: upperBed.id }), false);
  a.level = 1; a.y = 3.4;
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 2, sit: upperBed.id }), true);
  b.x = 0; b.z = 37; b.y = 0; b.level = 0;
  const c = room.addPlayer('c', 'C');
  c.x = b.x + 0.5; c.z = b.z; c.y = 3.4; c.level = 1;
  assert.equal(room.requestGreet('b', 'c', 'wave'), null); // beda lantai
  c.y = 0; c.level = 0;
  assert.ok(room.requestGreet('b', 'c', 'wave'));
});
