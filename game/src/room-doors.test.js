import test from 'node:test';
import assert from 'node:assert/strict';
import { getVillaWorld } from './villa-layout.js';
import { RoomLocks } from './villa-doors.js';
import { createRoomDoors } from './room-doors.js';

const world = getVillaWorld();
const DOOR = { x: 18.75, z: 12 }; // pintu Guest Room 1, kamar di utara

/** Bus LiveKit tiruan: pesan sampai ke peserta lain (atau yang dituju) secara langsung. */
function makeBus() {
  const peers = new Map();
  return {
    peers,
    join(id) {
      const listeners = [];
      const room = {
        localParticipant: {
          publishData(payload, opts) {
            for (const [pid, p] of peers) {
              if (pid === id) continue;
              if (opts.destinationIdentities && !opts.destinationIdentities.includes(pid)) continue;
              for (const fn of p.listeners) fn(payload, { identity: id }, 0, opts.topic);
            }
            return Promise.resolve();
          },
        },
        on(evt, fn) {
          if (evt === 'dataReceived') listeners.push(fn);
        },
      };
      peers.set(id, { listeners });
      return room;
    },
  };
}

function peer(bus, id, pos) {
  const handlers = {};
  const me = { x: pos.x, z: pos.z, level: 0, stair: null, y: 0 };
  const players = [];
  const net = { id, room: bus.join(id), players, on: (e, fn) => { (handlers[e] ??= []).push(fn); return net; } };
  const notices = [];
  const knocks = [];
  const ctl = createRoomDoors({ net, world, onNotice: (t) => notices.push(t), onKnock: (k) => knocks.push(k) });
  return { id, me, net, ctl, notices, knocks, players, emit: (e, p) => (handlers[e] ?? []).forEach((fn) => fn(p)) };
}

/** Saling lihat: daftar pemain tiap peserta berisi semua peserta dengan posisi terkini. */
function link(...ps) {
  for (const p of ps) {
    p.players.length = 0;
    for (const q of ps) p.players.push({ id: q.id, name: q.id.toUpperCase(), x: q.me.x, z: q.me.z, y: q.me.y });
  }
}

const walkIn = (p, dz = -0.1, steps = 40) => {
  for (let i = 0; i < steps; i++) {
    const n = p.ctl.move(p.me, 0, dz);
    Object.assign(p.me, { x: n.x, z: n.z, level: n.level, stair: n.stair, y: n.y });
  }
};

test('P2P: check-in disiarkan, peserta lain tertahan di pintu, pemilik bisa masuk', () => {
  const bus = makeBus();
  const a = peer(bus, 'a1', { x: DOOR.x, z: 13 });
  const b = peer(bus, 'b2', { x: DOOR.x, z: 12.7 });
  link(a, b);
  assert.equal(a.ctl.checkIn(a.me).ok, true);
  assert.equal(b.ctl.locks.state.get('guest_1').owner, 'a1');
  assert.equal(b.ctl.locks.state.get('guest_1').locked, true);
  walkIn(b);
  assert.ok(b.me.z > 12.3, `b tertahan, z=${b.me.z}`);
  walkIn(a);
  assert.ok(a.me.z < 10, `pemilik masuk, z=${a.me.z}`);
});

test('P2P: ketuk, pemilik izinkan, tamu masuk', () => {
  const bus = makeBus();
  const a = peer(bus, 'a1', { x: DOOR.x, z: 13 });
  const b = peer(bus, 'b2', { x: DOOR.x, z: 12.7 });
  link(a, b);
  a.ctl.checkIn(a.me);
  assert.equal(b.ctl.knock(b.me).ok, true);
  assert.equal(a.knocks.length, 1);
  assert.deepEqual([a.knocks[0].from, a.knocks[0].name, a.knocks[0].room], ['b2', 'B2', 'guest_1']);
  assert.equal(a.ctl.reply('b2', true).accepted, true);
  assert.ok(b.notices.includes('Pintu dibukakan, silakan masuk.'));
  walkIn(b);
  assert.ok(b.me.z < 10, `b masuk, z=${b.me.z}`);
});

test('P2P: ketukan ditolak; membuka kunci mempersilakan semua; tidur mengunci otomatis', () => {
  const bus = makeBus();
  const a = peer(bus, 'a1', { x: DOOR.x, z: 13 });
  const b = peer(bus, 'b2', { x: DOOR.x, z: 12.7 });
  link(a, b);
  a.ctl.checkIn(a.me);
  b.ctl.knock(b.me);
  a.ctl.reply('b2', false);
  assert.ok(b.notices.includes('Ketukanmu ditolak.'));
  walkIn(b);
  assert.ok(b.me.z > 12.3);
  assert.equal(a.ctl.setLocked(false).ok, true);
  assert.equal(b.ctl.locks.state.get('guest_1').locked, false);
  walkIn(b);
  assert.ok(b.me.z < 10);
  Object.assign(b.me, { x: DOOR.x, z: 12.7 });
  a.ctl.setSleeping(true);
  assert.equal(b.ctl.locks.state.get('guest_1').locked, true, 'tidur = terkunci di semua klien');
  assert.equal(a.ctl.setLocked(false).reason, 'sleeping');
  walkIn(b);
  assert.ok(b.me.z > 12.3);
});

test('P2P: pendatang baru mendapat status kamar; pemilik keluar/check-out membuka kamar', () => {
  const bus = makeBus();
  const a = peer(bus, 'a1', { x: DOOR.x, z: 13 });
  link(a);
  a.ctl.checkIn(a.me);
  const c = peer(bus, 'c3', { x: DOOR.x, z: 12.7 });
  link(a, c);
  assert.equal(c.ctl.locks.state.get('guest_1').owner, null, 'belum tahu');
  a.ctl.tick(); // pemilik melihat peserta baru dan memberi tahu langsung
  assert.equal(c.ctl.locks.state.get('guest_1').owner, 'a1');
  c.emit('left', { id: 'a1' });
  assert.equal(c.ctl.locks.state.get('guest_1').owner, null);
  a.ctl.checkOut();
  assert.equal(a.ctl.ownRoom(), null);
});

test('P2P: check-out disiarkan', () => {
  const bus = makeBus();
  const a = peer(bus, 'a1', { x: DOOR.x, z: 13 });
  const b = peer(bus, 'b2', { x: DOOR.x, z: 12.7 });
  link(a, b);
  a.ctl.checkIn(a.me);
  assert.equal(b.ctl.locks.state.get('guest_1').owner, 'a1');
  assert.equal(a.ctl.checkOut().ok, true);
  assert.equal(b.ctl.locks.state.get('guest_1').owner, null);
  walkIn(b);
  assert.ok(b.me.z < 10);
});

test('RoomLocks P2P: rebutan hampir bersamaan dimenangkan id lebih kecil; pemilik mapan tidak bisa direbut', () => {
  const locks = new RoomLocks(world);
  const T = 1_000_000;
  assert.equal(locks.applyOwnerState('b2', 'guest_1', true, [], T), true);
  assert.equal(locks.applyOwnerState('a1', 'guest_1', true, [], T + 500), true, 'id lebih kecil menang di jendela rebutan');
  assert.equal(locks.state.get('guest_1').owner, 'a1');
  assert.equal(locks.applyOwnerState('b2', 'guest_1', true, [], T + 600), false, 'id lebih besar kalah');
  assert.equal(locks.applyOwnerState('0zz', 'guest_1', true, [], T + 10_000), false, 'sudah mapan: tidak bisa direbut');
  assert.equal(locks.state.get('guest_1').owner, 'a1');
  assert.equal(locks.byOwner.get('b2'), undefined);
});

test('RoomLocks: snapshot server menyamakan salinan lokal; izin untuk diri sendiri', () => {
  const locks = new RoomLocks(world);
  locks.applySnapshot([{ id: 'guest_2', owner: 'x', locked: true }], 5);
  assert.equal(locks.state.get('guest_2').owner, 'x');
  locks.allowSelf('me', 'guest_2', 1000, 10);
  assert.equal(locks.canEnter('me', locks.state.get('guest_2'), 500), true);
  assert.equal(locks.canEnter('me', locks.state.get('guest_2'), 5000), false);
  locks.applySnapshot([], 20);
  assert.equal(locks.state.get('guest_2').owner, null);
});

test('mode server (WebSocket): pesan dikirim lewat sendRoom, status ikut snapshot', () => {
  const handlers = {};
  const sent = [];
  const net = { id: 's1', players: [], rooms: [{ id: 'guest_3', owner: 'z9', locked: true }], on: (e, fn) => { (handlers[e] ??= []).push(fn); return net; }, sendRoom: (m) => sent.push(m) };
  const notices = [];
  const knocks = [];
  const ctl = createRoomDoors({ net, world, onNotice: (t) => notices.push(t), onKnock: (k) => knocks.push(k) });
  assert.equal(ctl.p2p, false);
  assert.equal(ctl.locks.state.get('guest_3').owner, 'z9');
  assert.equal(ctl.checkIn({ x: 24.25, z: 13, level: 0, stair: null, y: 0 }).pending, true);
  assert.deepEqual(sent[0].act, 'checkin');
  handlers.knock[0]({ from: 'q', name: 'Q', room: 'guest_3' });
  assert.equal(knocks[0].name, 'Q');
  handlers['knock-result'][0]({ room: 'guest_3', accepted: true });
  assert.equal(ctl.locks.canEnter('s1', ctl.locks.state.get('guest_3')), true);
  handlers['room-error'][0]({ reason: 'taken' });
  assert.ok(notices.some((t) => t.includes('sudah dipakai')));
});
