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
