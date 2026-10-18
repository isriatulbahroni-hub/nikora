import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourtFrame } from './court-frame.js';
import { DUEL_TOPIC, HOST_TIMEOUT_MS, createDuelNet } from './duel-net.js';

const dec = new TextDecoder();
const frame = createCourtFrame();

/** Ruang LiveKit palsu: publishData dikirim ke peserta lain (atau yang dituju). `hold` menahan pesan sampai `flush`. */
function makeBus() {
  const rooms = new Map();
  const queue = [];
  const bus = {
    hold: false,
    rooms,
    sent: [],
    add(id) {
      const handlers = new Set();
      const room = {
        id,
        on: (_e, fn) => handlers.add(fn),
        off: (_e, fn) => handlers.delete(fn),
        handlers,
        get remoteParticipants() {
          const m = new Map();
          for (const other of rooms.keys()) if (other !== id) m.set(other, { identity: other });
          return m;
        },
        localParticipant: {
          publishData(data, opts) {
            const msg = { from: id, data, opts };
            let json = null;
            try { json = JSON.parse(dec.decode(data)); } catch { /* pesan sampah sengaja */ }
            bus.sent.push({ from: id, json, opts });
            if (bus.hold) queue.push(msg);
            else bus.deliver(msg);
            return Promise.resolve();
          },
        },
      };
      rooms.set(id, room);
      return room;
    },
    deliver({ from, data, opts }) {
      const targets = opts.destinationIdentities ?? [...rooms.keys()].filter((r) => r !== from);
      for (const t of targets) for (const fn of rooms.get(t)?.handlers ?? []) fn(data, { identity: from }, 0, opts.topic);
    },
    flush() {
      while (queue.length) bus.deliver(queue.shift());
    },
    disconnect(id) {
      rooms.delete(id);
    },
  };
  return bus;
}

function setup(ids = ['A', 'B'], { positions = {} } = {}) {
  const bus = makeBus();
  const clock = { t: 1000 };
  const events = {};
  const nets = {};
  for (const id of ids) {
    events[id] = [];
    nets[id] = createDuelNet({
      room: bus.add(id),
      selfId: id,
      frame,
      now: () => clock.t,
      random: () => 0.5,
      getPlayerPos: (who) => positions[who] ?? null,
      onEvent: (e) => events[id].push(e),
    });
  }
  const step = (dt = 1 / 60, who = ids) => {
    clock.t += dt * 1000;
    for (const id of who) nets[id]?.tick(dt);
  };
  return { bus, nets, events, clock, step, positions };
}

test('A membuka meja (tuan rumah), B melihatnya, B bergabung, pertandingan mulai dengan A servis', () => {
  const { nets, step } = setup();
  assert.deepEqual(nets.A.requestPlay(), { ok: true, host: true });
  assert.equal(nets.A.role, 'host');
  assert.equal(nets.B.role, 'none');
  assert.equal(nets.B.snap.ph, 'lobby', 'penonton menerima snapshot');
  assert.deepEqual(nets.B.requestPlay(), { ok: true, pending: true });
  step();
  assert.equal(nets.A.snap.ph, 'serve');
  assert.equal(nets.B.role, 'guest');
  assert.equal(nets.B.side, 'b');
  assert.equal(nets.A.canServe(), true);
  assert.equal(nets.B.canServe(), false);
});

test('servis tuan rumah tampil di klien lawan; pukulan lawan dari posisi nyata mengembalikan kok', () => {
  const positions = {};
  const { nets, step } = setup(['A', 'B'], { positions });
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  positions.A = frame.toWorld({ x: 0, z: -4.5 });
  positions.B = frame.toWorld({ x: 0, z: 4.5 });
  assert.equal(nets.A.serve({ power: 0.62 }).ok, true);
  assert.equal(nets.B.snap.ph, 'rally');
  let returned = false;
  for (let i = 0; i < 600 && !returned; i++) {
    const sh = nets.A.snap.sh && nets.A.shuttleAt();
    if (sh && sh.pos.z > 0) positions.B = frame.toWorld({ x: sh.pos.x, z: sh.pos.z }); // B berlari ke bawah kok
    step();
    if (nets.B.canHitNow()) {
      assert.equal(nets.B.hit({ aim: 0 }).sent, true);
      returned = nets.A.snap.lh === 'b';
    }
  }
  assert.ok(returned, 'pukulan B diterima tuan rumah');
  const est = nets.B.shuttleAt();
  assert.ok(est && est.vel.z < 0, 'B melihat kok bergerak ke sisi A');
});

test('pukulan dari lawan yang berdiri jauh dari kok ditolak tuan rumah (posisi dibaca dari data pemain)', () => {
  const positions = {};
  const { nets, bus, step } = setup(['A', 'B'], { positions });
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  positions.A = frame.toWorld({ x: 0, z: -4.5 });
  positions.B = frame.toWorld({ x: 3, z: 6.5 }); // jauh di sudut
  nets.A.serve({ power: 0.62 });
  for (let i = 0; i < 40; i++) step();
  const before = nets.A.snap.lh;
  // B berbohong lewat pesan mentah; tuan rumah tetap memeriksa posisi B sendiri
  for (let i = 0; i < 20; i++) bus.rooms.get('B').localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ k: 'hit', ax: 0 })), { topic: DUEL_TOPIC, destinationIdentities: ['A'], reliable: true });
  assert.equal(nets.A.snap.lh, before);
});

test('lawan putus sambungan di tengah pertandingan: tuan rumah menang WO dan diberi tahu', () => {
  const { nets, bus, events, step } = setup();
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  bus.disconnect('B');
  step();
  assert.equal(nets.A.snap.ph, 'over');
  assert.equal(nets.A.snap.w, 'a');
  assert.deepEqual(events.A.at(-1), { type: 'opponent-left', forfeit: true });
});

test('tuan rumah hilang: klien menutup meja setelah batas waktu dan memberi tahu', () => {
  const { nets, events, clock, step } = setup();
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  nets.A.dispose();
  assert.equal(nets.B.role, 'none');
  assert.deepEqual(events.B.at(-1), { type: 'closed', reason: 'host-left' });
  const lone = setup();
  lone.nets.A.requestPlay();
  lone.nets.B.requestPlay();
  lone.step();
  lone.bus.hold = true; // snapshot berhenti sampai
  lone.nets.A.tick = () => {};
  lone.clock.t += HOST_TIMEOUT_MS + 100;
  lone.nets.B.tick(1 / 60);
  assert.equal(lone.nets.B.snap, null);
  assert.equal(lone.events.B.at(-1).type, 'closed');
  void clock;
});

test('meja penuh: pemain ketiga ditolak dan hanya menonton', () => {
  const { nets, events, step } = setup(['A', 'B', 'C']);
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  assert.deepEqual(nets.C.requestPlay(), { ok: false, reason: 'penuh' });
  assert.equal(nets.C.role, 'none');
  assert.ok(nets.C.snap, 'tetap bisa menonton');
  assert.equal(events.C.length, 0);
});

test('dua orang membuka meja bersamaan: id lebih kecil jadi tuan rumah, yang lain bergabung', () => {
  const { nets, bus, step } = setup();
  bus.hold = true;
  nets.A.requestPlay();
  nets.B.requestPlay();
  bus.hold = false;
  bus.flush();
  step();
  assert.equal(nets.A.role, 'host');
  assert.equal(nets.B.role, 'guest');
  assert.equal(nets.A.snap.b, 'B');
});

test('pesan sampah, topik lain, atau perintah dari non-peserta diabaikan', () => {
  const { nets, bus, step } = setup(['A', 'B', 'C']);
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  const raw = (id, data, topic = DUEL_TOPIC, to = ['A']) => bus.rooms.get(id).localParticipant.publishData(typeof data === 'string' ? new TextEncoder().encode(data) : data, { topic, destinationIdentities: to, reliable: true });
  raw('C', 'bukan json');
  raw('C', JSON.stringify({ k: 'sv', p: 1 }));
  raw('C', JSON.stringify({ k: 'leave' }));
  raw('C', JSON.stringify({ k: 'join' }));
  raw('B', JSON.stringify({ k: 'st', s: { ph: 'over', sc: [21, 0], q: 999 } }));
  raw('B', JSON.stringify({ k: 'join' }), 'topik-lain');
  assert.equal(nets.A.snap.ph, 'serve');
  assert.equal(nets.A.snap.b, 'B');
  assert.equal(nets.A.role, 'host');
});

test('tamu yang keluar menutup kursinya; tuan rumah kembali menunggu atau pertandingan dianggap WO', () => {
  const { nets, step } = setup();
  nets.A.requestPlay();
  nets.B.requestPlay();
  step();
  nets.B.leave();
  assert.equal(nets.B.role, 'none');
  assert.equal(nets.A.snap.ph, 'over');
  assert.equal(nets.A.snap.w, 'a');
});

test('tuan rumah keluar saat menunggu lawan: meja ditutup dan penonton tidak lagi melihat meja', () => {
  const { nets, step } = setup();
  nets.A.requestPlay();
  step();
  nets.A.leave();
  assert.equal(nets.A.role, 'none');
  assert.equal(nets.B.snap, null);
});
