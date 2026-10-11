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
