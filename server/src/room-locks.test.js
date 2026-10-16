import test from 'node:test';
import assert from 'node:assert/strict';
import { getVillaWorld } from '../../game/src/villa-layout.js';
import { lockableRooms, doorNear, RoomLocks, LOCK_RULES } from '../../game/src/villa-doors.js';
import { Room } from './room.js';

const world = getVillaWorld();
const T0 = 1_000_000;
const DOOR_G1 = { x: 18.75, z: 12 }; // pintu Guest Room 1 (lantai 0), kamar di sisi utara (z mengecil)

function setup() {
  const room = new Room({ world });
  const owner = room.addPlayer('own', 'Pemilik');
  const intruder = room.addPlayer('int', 'Penyusup');
  Object.assign(owner, { x: DOOR_G1.x, z: 13 });
  Object.assign(intruder, { x: DOOR_G1.x, z: 13.2 });
  return { room, owner, intruder };
}

let seq = 0;
const walk = (room, id, x, z, seconds, t = T0) => {
  room.setInput(id, { x, z, rot: 0, seq: ++seq });
  for (let i = 0; i < seconds * 20; i++) room.step(0.05, t);
  room.setInput(id, { x: 0, z: 0, rot: 0, seq: ++seq });
};

test('21 kamar bisa dikunci: 16 kamar tamu + 5 suite, semuanya punya pintu', () => {
  const rooms = lockableRooms(world);
  assert.equal(rooms.length, 21);
  assert.equal(rooms.filter((r) => r.kind === 'guest').length, 16);
  for (const r of rooms) assert.ok(r.doors.length >= 1, r.id);
  const g1 = rooms.find((r) => r.id === 'guest_1');
  assert.deepEqual([g1.doors[0].nx, g1.doors[0].nz], [0, -1]); // arah masuk = ke utara
  assert.equal(doorNear(rooms, { x: 18.75, z: 13, level: 0 }).room.id, 'guest_1');
  assert.equal(doorNear(rooms, { x: 18.75, z: 13, level: 1 }).room.id, 'guest_9'); // lantai 1: kamar di atasnya
  assert.equal(doorNear(rooms, { x: 18.75, z: 13, level: 2 }), null); // lantai 2: tidak ada kamar tamu
});

test('kamar yang belum di-check-in tetap terbuka', () => {
  const { room, intruder } = setup();
  walk(room, 'int', 0, -1, 2);
  assert.ok(intruder.z < 10, `harus masuk, z=${intruder.z}`);
});

test('kamar yang sudah di-check-in terkunci: penyusup tidak bisa masuk, pemilik bisa', () => {
  const { room, owner, intruder } = setup();
  assert.equal(room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0).ok, true);
  walk(room, 'int', 0, -1, 3);
  assert.ok(intruder.z > 12.3, `harus tertahan di pintu, z=${intruder.z}`);
  walk(room, 'own', 0, -1, 2);
  assert.ok(owner.z < 10, `pemilik harus bisa masuk, z=${owner.z}`);
});

test('langkah server besar tidak bisa menembus pintu terkunci', () => {
  const { room, intruder } = setup();
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  room.setInput('int', { x: 0, z: -1, rot: 0, seq: ++seq });
  for (let i = 0; i < 10; i++) room.step(0.25, T0); // dt maksimum
  assert.ok(intruder.z > 12.3, `z=${intruder.z}`);
});

test('yang sudah di dalam tetap bisa keluar walau kamar terkunci', () => {
  const { room, intruder } = setup();
  Object.assign(intruder, { x: DOOR_G1.x, z: 8 }); // sudah di dalam kamar
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  walk(room, 'int', 0, 1, 2);
  assert.ok(intruder.z > 12.5, `harus bisa keluar, z=${intruder.z}`);
});

test('check-in butuh dekat pintu; satu kamar satu pemilik; satu orang satu kamar', () => {
  const { room, owner, intruder } = setup();
  Object.assign(owner, { x: 40, z: 30 });
  assert.equal(room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0).reason, 'too-far');
  Object.assign(owner, { x: DOOR_G1.x, z: 13 });
  assert.equal(room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0).ok, true);
  assert.equal(room.roomCommand('int', { act: 'checkin', room: 'guest_1' }, T0).reason, 'taken');
  Object.assign(owner, { x: 24.25, z: 13 }); // dekat pintu guest_2
  assert.equal(room.roomCommand('own', { act: 'checkin', room: 'guest_2' }, T0).reason, 'already-has-room');
  assert.equal(room.roomCommand('int', { act: 'checkin', room: 'tidak-ada' }, T0).reason, 'unknown-room');
  assert.ok(intruder);
});

test('ketuk: diterima pemilik memberi izin sementara, lalu kedaluwarsa', () => {
  const { room, intruder } = setup();
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  const k = room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0);
  assert.deepEqual([k.ok, k.to], [true, 'own']);
  assert.equal(room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0 + 100).reason, 'too-soon');
  const r = room.roomCommand('own', { act: 'knock-reply', from: 'int', accept: true }, T0 + 1000);
  assert.deepEqual([r.ok, r.accepted], [true, true]);
  walk(room, 'int', 0, -1, 2, T0 + 2000);
  assert.ok(intruder.z < 10, `harus boleh masuk, z=${intruder.z}`);
  // izin habis: orang lain yang tidak diizinkan tetap ditolak, dan izin lama tidak berlaku lagi
  Object.assign(intruder, { x: DOOR_G1.x, z: 13 });
  room.expire(T0 + 1000 + LOCK_RULES.allowTtlMs + 1);
  walk(room, 'int', 0, -1, 2, T0 + 1000 + LOCK_RULES.allowTtlMs + 2);
  assert.ok(intruder.z > 12.3, `z=${intruder.z}`);
});

test('ketukan ditolak pemilik atau kedaluwarsa: tidak ada izin', () => {
  const { room, intruder } = setup();
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0);
  assert.equal(room.roomCommand('own', { act: 'knock-reply', from: 'int', accept: false }, T0 + 500).accepted, false);
  walk(room, 'int', 0, -1, 2, T0 + 600);
  assert.ok(intruder.z > 12.3);
  room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0 + 10000);
  assert.equal(room.roomCommand('own', { act: 'knock-reply', from: 'int', accept: true }, T0 + 10000 + LOCK_RULES.knockTtlMs + 1).reason, 'expired');
});

test('ketukan hanya dari dekat pintu dan hanya ke kamar yang berpemilik & terkunci', () => {
  const { room, intruder } = setup();
  assert.equal(room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0).reason, 'no-owner');
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  Object.assign(intruder, { x: 0, z: 30 });
  assert.equal(room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0).reason, 'too-far');
  Object.assign(intruder, { x: DOOR_G1.x, z: 13 });
  room.roomCommand('own', { act: 'lock', locked: false }, T0);
  assert.equal(room.roomCommand('int', { act: 'knock', room: 'guest_1' }, T0).reason, 'not-locked');
});

test('pemilik membuka kunci: semua orang bisa masuk; mengunci lagi mencabut izin', () => {
  const { room, intruder } = setup();
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  assert.equal(room.roomCommand('own', { act: 'lock', locked: false }, T0).locked, false);
  walk(room, 'int', 0, -1, 2);
  assert.ok(intruder.z < 10);
  Object.assign(intruder, { x: DOOR_G1.x, z: 13 });
  room.roomCommand('own', { act: 'lock', locked: true }, T0);
  walk(room, 'int', 0, -1, 2);
  assert.ok(intruder.z > 12.3);
});

test('pemilik yang sedang tidur: kamar otomatis terkunci dan tidak bisa dibuka', () => {
  const { room, owner, intruder } = setup();
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  room.roomCommand('own', { act: 'lock', locked: false }, T0); // sengaja dibuka (belum tidur)
  const bed = world.spots.find((s) => s.kind === 'sleep' && s.level === 0 && Math.abs(s.x - 18.75) < 0.01 && s.z < 10);
  assert.ok(bed, 'tempat tidur guest_1');
  Object.assign(owner, { x: bed.x, z: bed.z + 0.5 });
  assert.equal(room.setInput('own', { x: 0, z: 0, rot: 0, seq: ++seq, sit: bed.id }), true);
  assert.equal(room.locks.state.get('guest_1').locked, true, 'otomatis terkunci saat mulai tidur');
  assert.equal(room.roomCommand('own', { act: 'lock', locked: false }, T0).reason, 'sleeping');
  walk(room, 'int', 0, -1, 3);
  assert.ok(intruder.z > 12.3, `z=${intruder.z}`);
});

test('pemilik keluar/check-out: kamar terbuka lagi', () => {
  const { room, intruder } = setup();
  room.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  const v = room.locks.version;
  room.removePlayer('own');
  assert.ok(room.locks.version > v);
  assert.deepEqual(room.locks.snapshot(), []);
  walk(room, 'int', 0, -1, 2);
  assert.ok(intruder.z < 10);
  const { room: r2 } = setup();
  r2.roomCommand('own', { act: 'checkin', room: 'guest_1' }, T0);
  assert.equal(r2.roomCommand('own', { act: 'checkout' }, T0).ok, true);
  assert.equal(r2.roomCommand('own', { act: 'checkout' }, T0).reason, 'no-room');
});

test('suite premium di lantai atas ikut terkunci (Honeymoon, lewat pintu pustaka)', () => {
  const room = new Room({ world });
  const a = room.addPlayer('a', 'A');
  const b = room.addPlayer('b', 'B');
  Object.assign(a, { x: 24.5, z: -11, level: 1, y: 3.4 });
  Object.assign(b, { x: 24.5, z: -10, level: 1, y: 3.4 });
  assert.equal(room.roomCommand('a', { act: 'checkin', room: 'honeymoon' }, T0).ok, true);
  walk(room, 'b', 1, 0, 2);
  assert.ok(b.x < 26, `b harus tertahan di pintu honeymoon, x=${b.x}`);
  walk(room, 'a', 1, 0, 2);
  assert.ok(a.x > 26.5, `pemilik masuk, x=${a.x}`);
});

test('perintah tidak valid ditolak; dunia tanpa villa tidak punya kunci', () => {
  const { room } = setup();
  assert.equal(room.roomCommand('own', { act: 'hack', room: 'guest_1' }).reason, 'unknown-act');
  assert.equal(room.roomCommand('tidak-ada', { act: 'checkin', room: 'guest_1' }).reason, 'unavailable');
  assert.equal(new Room().roomCommand('x', { act: 'checkin' }).reason, 'unavailable');
  assert.ok(new RoomLocks(world).rooms.length === 21);
});
