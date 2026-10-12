import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveKitNet, describeCredFailure } from './livekit-net.js';
import { createPartyController } from './party.js';

// Hub palsu yang meniru Room LiveKit: mengantar data antar-peserta dan memicu event.
function makeHub() {
  const rooms = new Map();
  const RoomEvent = { DataReceived: 'data', ParticipantConnected: 'pc', ParticipantDisconnected: 'pd', Disconnected: 'dc' };
  class Room {
    constructor() {
      this.h = {};
      this.remoteParticipants = new Map();
      this.localParticipant = {
        publishData: async (bytes, opts) => {
          for (const other of rooms.values()) {
            if (other === this) continue;
            if (opts.destinationIdentities && !opts.destinationIdentities.includes(other.identity)) continue;
            other.emit('data', bytes, { identity: this.identity, name: this.name }, 0, opts.topic);
          }
        },
      };
    }
    on(e, f) { (this.h[e] ??= []).push(f); }
    emit(e, ...a) { for (const f of this.h[e] ?? []) f(...a); }
    async connect(_url, token) {
      [this.identity, this.name] = token.split('|');
      for (const other of rooms.values()) {
        this.remoteParticipants.set(other.identity, { identity: other.identity, name: other.name });
        other.remoteParticipants.set(this.identity, { identity: this.identity, name: this.name });
        other.emit('pc', { identity: this.identity, name: this.name });
      }
      rooms.set(this.identity, this);
    }
    disconnect() {
      rooms.delete(this.identity);
      for (const other of rooms.values()) { other.remoteParticipants.delete(this.identity); other.emit('pd', { identity: this.identity }); }
    }
  }
  return { LiveKit: { Room, RoomEvent }, rooms };
}

function makeNet(hub, id, name, clock) {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ enabled: true, url: 'wss://x', token: `${id}|${name}`, id }) });
  return new LiveKitNet({ LiveKit: hub.LiveKit, fetchImpl, now: () => clock.t });
}

test('LiveKitNet: dua klien saling melihat posisi, chat, dan tersambung/terputus', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  clock.t += 200;
  a.sendInput(0, 0, 1.5, undefined, { x: 3, z: 4 });
  const seenByB = b.players.find((p) => p.id === 'aaaa');
  assert.equal(seenByB.x, 3);
  assert.equal(seenByB.z, 4);
  assert.equal(seenByB.rot, 1.5);
  const chats = [];
  b.on('chat', (m) => chats.push(m));
  clock.t += 1000;
  a.sendChat('halo <b>semua</b>');
  assert.equal(chats[0].text, 'halo bsemua/b');
  assert.equal(chats[0].name, 'Ani');
  const left = [];
  b.on('left', (m) => left.push(m.id));
  a.close();
  assert.deepEqual(left, ['aaaa']);
  b.close();
});

test('LiveKitNet: salaman butuh persetujuan, keduanya berhadapan 0,9 m, selesai sendiri; lambai langsung', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  clock.t += 200;
  a.sendInput(0, 0, 0, undefined, { x: 0, z: 0 });
  b.sendInput(0, 0, 0, undefined, { x: 1.4, z: 0 });
  const reqs = [];
  b.on('greet-req', (m) => reqs.push(m));
  a.sendGreet('bbbb', 'handshake');
  assert.equal(reqs[0].from, 'aaaa');
  b.replyGreet('aaaa', true);
  assert.equal(a.self.act, 'handshake');
  assert.equal(b.self.act, 'handshake');
  assert.equal(a.self.with, 'bbbb');
  assert.ok(Math.abs(Math.hypot(a.self.x - b.self.x, a.self.z - b.self.z) - 0.9) < 0.02);
  clock.t += 3000;
  a.sendInput(0, 0, 0, undefined, { x: 0, z: 0 });
  a.close(); b.close();
});

test('LiveKitNet: salaman ditolak jauh/duduk, penolakan dikabarkan, ajakan kedaluwarsa, tabrakan kursi: id besar mengalah', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  clock.t += 200;
  a.sendInput(0, 0, 0, undefined, { x: 0, z: 0 });
  b.sendInput(0, 0, 0, undefined, { x: 9, z: 0 });
  const reqs = [];
  b.on('greet-req', (m) => reqs.push(m));
  a.sendGreet('bbbb', 'handshake');
  assert.equal(reqs.length, 0, 'terlalu jauh');
  clock.t += 200;
  b.sendInput(0, 0, 0, undefined, { x: 1, z: 0 });
  const declined = [];
  a.on('greet-declined', (m) => declined.push(m.by));
  a.sendGreet('bbbb', 'highfive');
  b.replyGreet('aaaa', false);
  assert.deepEqual(declined, ['bbbb']);
  assert.equal(a.self.act, null);
  a.sendGreet('bbbb', 'handshake');
  clock.t += 9000;
  b['pending'].size; // ajakan sudah lewat TTL
  b.replyGreet('aaaa', true);
  assert.equal(b.self.act, null, 'kedaluwarsa');
  // tabrakan kursi
  a.sendInput(0, 0, 0, 3, { x: 0, z: 0 });
  clock.t += 200;
  b.sendInput(0, 0, 0, 3, { x: 1, z: 0 });
  assert.equal(b.self.sit, 3);
  clock.t += 200;
  a.sendInput(0, 0, 0, 3, { x: 0, z: 0 });
  assert.equal(b.self.sit, null, 'id bbbb > aaaa → bbbb mengalah');
  assert.equal(a.self.sit, 3);
  a.close(); b.close();
});

test('LiveKitNet: fetch bawaan dipanggil tanpa this=instance (regresi "Illegal invocation" di browser)', async () => {
  const realFetch = globalThis.fetch;
  let thisSeen = 'belum';
  globalThis.fetch = function strictFetch() {
    thisSeen = this;
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return Promise.resolve({ ok: true, json: async () => ({ enabled: false }) });
  };
  try {
    const net = new LiveKitNet({ LiveKit: {} });
    await assert.rejects(() => net.connect('', 'A'), /env LiveKit belum terbaca/);
    assert.ok(thisSeen === undefined || thisSeen === globalThis);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('LiveKitNet + Party: MC membuka panggung, tamu angkat tangan, MC menaikkan, pesan palsu ditolak', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'MC', clock);
  const b = makeNet(hub, 'bbbb', 'Tamu', clock);
  const c = makeNet(hub, 'cccc', 'Iseng', clock);
  await a.connect('', 'MC');
  await b.connect('', 'Tamu');
  await c.connect('', 'Iseng');
  const pa = createPartyController({ net: a, now: () => clock.t });
  const pb = createPartyController({ net: b, now: () => clock.t });
  const pc = createPartyController({ net: c, now: () => clock.t });
  pa.claimHost();
  assert.equal(pb.state.host, 'aaaa');
  pb.raiseHand();
  assert.deepEqual(pa.state.hands, ['bbbb']);
  c.sendParty({ k: 'grant', to: 'cccc' }); // bukan MC
  assert.deepEqual(pa.state.speakers, []);
  pa.grant('bbbb');
  assert.equal(pb.role, 'speaker');
  assert.equal(pc.state.speakers[0], 'bbbb');
  b.close();
  assert.equal(pa.state.speakers.length, 0); // peserta keluar dibuang dari panggung
});

test('LiveKitNet: avatar buatan pemain sampai ke pemain lain, data ngawur dibersihkan, dan ikut heartbeat', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  a.setAvatar([3, 2, 5, 4, 6]);
  await b.connect('', 'Budi'); // Budi masuk belakangan
  clock.t += 1100;
  a.sendInput(0, 0, 0, undefined, { x: 1, z: 1 }); // heartbeat membawa avatar ke tamu baru
  assert.deepEqual(b.players.find((p) => p.id === 'aaaa').av, { o: 3, s: 2, h: 5, k: 4, a: 6, m: 0 });
  a.setAvatar([99, -5, 'x', 1e9, null]);
  assert.deepEqual(b.players.find((p) => p.id === 'aaaa').av, { o: 0, s: 1, h: 1, k: 0, a: 0, m: 0 });
});

test('LiveKitNet: joget terlihat pemain lain, bisa dihentikan, dan tidak bisa saat duduk', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  a.setDance(true);
  assert.equal(b.players.find((p) => p.id === 'aaaa').act, 'dance');
  a.setDance(false);
  assert.equal(b.players.find((p) => p.id === 'aaaa').act, null);
  a.self.sit = 3; // di kursi: tidak bisa joget
  a.setDance(true);
  assert.equal(a.self.act, null);
});

test('describeCredFailure: pesan jelas untuk konfigurasi kurang, acara tak ada, dan default; nama ngawur disaring', () => {
  assert.equal(describeCredFailure({ enabled: false, reason: 'config', missing: ['LIVEKIT_API_SECRET'] }), 'server belum dikonfigurasi, kurang: LIVEKIT_API_SECRET');
  assert.equal(describeCredFailure({ enabled: false, reason: 'config', missing: ['LIVEKIT_URL', '<script>'] }), 'server belum dikonfigurasi, kurang: LIVEKIT_URL');
  assert.equal(describeCredFailure({ enabled: false, reason: 'event' }), 'undangan tidak ditemukan');
  assert.equal(describeCredFailure({ enabled: false }), 'env LiveKit belum terbaca');
});
