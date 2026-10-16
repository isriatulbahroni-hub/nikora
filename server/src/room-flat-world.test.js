import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './room.js';

// Dunia hasil proyek editor tidak punya `levels`: Room harus tetap jalan dan tidak memasang kunci kamar.
test('dunia tanpa `levels` (hasil proyek editor) dipakai Room tanpa kunci kamar', () => {
  const flat = { spawn: { x: 0, z: 0 }, constrain: (p) => p, move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), spots: [], sitRange: 1.9 };
  const room = new Room({ world: flat });
  assert.equal(room.locks, null);
  const p = room.addPlayer('a', 'A');
  room.setInput('a', { x: 1, z: 0, rot: 0, seq: 1 });
  for (let i = 0; i < 20; i++) room.step(0.05);
  assert.ok(p.x > 1, `x=${p.x}`);
  assert.equal(room.roomCommand('a', { act: 'checkin', room: 'guest_1' }).reason, 'unavailable');
  room.removePlayer('a'); // tidak error walau tanpa kunci
});
