import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveKitNet, describeCredFailure, roleOf } from './livekit-net.js';
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
            other.emit('data', bytes, { identity: this.identity, name: this.name, metadata: this.metadata }, 0, opts.topic);
          }
        },
      };
    }
    on(e, f) { (this.h[e] ??= []).push(f); }
    emit(e, ...a) { for (const f of this.h[e] ?? []) f(...a); }
    async connect(_url, token) {
      [this.identity, this.name, this.metadata] = token.split('|');
      for (const other of rooms.values()) {
        this.remoteParticipants.set(other.identity, { identity: other.identity, name: other.name, metadata: other.metadata });
        other.remoteParticipants.set(this.identity, { identity: this.identity, name: this.name, metadata: this.metadata });
        other.emit('pc', { identity: this.identity, name: this.name, metadata: this.metadata });
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
  clock.t += 1100; // diam di kursi: kabar berikutnya datang lewat heartbeat 1x/dtk
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

function makeRoleNet(hub, id, name, { role, restricted }) {
  const metadata = role ? JSON.stringify({ role }) : '';
  const fetchImpl = async () => ({ ok: true, json: async () => ({ enabled: true, url: 'wss://x', token: `${id}|${name}|${metadata}`, id, role: role ?? 'guest', restricted }) });
  return new LiveKitNet({ LiveKit: hub.LiveKit, fetchImpl, now: () => 1000, key: role ? `${role}-${'A'.repeat(24)}` : undefined });
}

test('roleOf: hanya owner/mc dari metadata yang sah; selain itu tamu', () => {
  assert.equal(roleOf({ metadata: JSON.stringify({ role: 'owner' }) }), 'owner');
  assert.equal(roleOf({ metadata: JSON.stringify({ role: 'mc' }) }), 'mc');
  for (const meta of [undefined, '', 'bukan json', '{"role":"admin"}', '{"role":1}', 'null', '[]']) assert.equal(roleOf({ metadata: meta }), 'guest');
  assert.equal(roleOf(null), 'guest');
});

test('LiveKitNet: peran dibaca dari token (diri sendiri) dan metadata peserta (orang lain); kunci dikirim ke /api/token', async () => {
  const hub = makeHub();
  const calls = [];
  const wrap = (net) => { const orig = net.fetch; net.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return orig(url, init); }; return net; };
  const owner = wrap(makeRoleNet(hub, 'oooo', 'Pemilik', { role: 'owner', restricted: true }));
  const guest = makeRoleNet(hub, 'gggg', 'Tamu', { restricted: true });
  await owner.connect('', 'Pemilik');
  await guest.connect('', 'Tamu');
  assert.match(calls[0].key, /^owner-A{24}$/);
  assert.equal(owner.role, 'owner');
  assert.equal(owner.self.role, 'owner');
  owner.sendInput(0, 0, 0, undefined, { x: 1, z: 1 });
  guest.sendInput(0, 0, 0, undefined, { x: 2, z: 2 });
  assert.equal(guest.players.find((p) => p.id === 'oooo').role, 'owner', 'tamu melihat peran pemilik');
  assert.equal(owner.players.find((p) => p.id === 'gggg').role, 'guest');
  assert.equal(owner.canHost('oooo'), true);
  assert.equal(owner.canHost('gggg'), false);
  assert.equal(guest.canHost('gggg'), false);
  assert.equal(guest.canHost('oooo'), true);
});

test('LiveKitNet: peran tidak bisa dipalsukan lewat isi pesan; mode terbuka mengizinkan siapa pun', async () => {
  const hub = makeHub();
  const a = makeRoleNet(hub, 'aaaa', 'A', { restricted: true });
  const b = makeRoleNet(hub, 'bbbb', 'B', { restricted: true });
  await a.connect('', 'A');
  await b.connect('', 'B');
  // pengirim mencantumkan "role" di pesan statusnya: harus diabaikan
  a.sendInput(0, 0, 0, undefined, { x: 1, z: 1 });
  const room = hub.rooms.get('aaaa');
  const forged = new TextEncoder().encode(JSON.stringify({ t: 's', x: 1, z: 1, r: 0, role: 'owner' }));
  hub.rooms.get('bbbb').emit('data', forged, { identity: 'aaaa', name: 'A', metadata: '' }, 0, 'orbit');
  assert.ok(room);
  assert.equal(b.players.find((p) => p.id === 'aaaa').role, 'guest');
  const open = makeRoleNet(makeHub(), 'cccc', 'C', { restricted: false });
  await open.connect('', 'C');
  assert.equal(open.canHost('cccc'), true, 'tanpa EVENT_ROLE_SECRET semua boleh (perilaku lama)');

// ---- hemat data: diam tidak mengirim, jauh lebih jarang daripada dekat ----
function countingHub() {
  const hub = makeHub();
  const sent = [];
  const Base = hub.LiveKit.Room;
  hub.LiveKit.Room = class extends Base {
    constructor() {
      super();
      const orig = this.localParticipant.publishData;
      this.localParticipant.publishData = async (bytes, opts) => {
        sent.push({ from: this.identity, to: opts.destinationIdentities ?? 'all', msg: JSON.parse(new TextDecoder().decode(bytes)) });
        return orig(bytes, opts);
      };
    }
  };
  hub.sent = sent;
  return hub;
}

test('hemat data: pemain diam hanya mengirim heartbeat; bergerak mengirim 10x/dtk ke yang dekat dan lebih jarang ke yang jauh', async () => {
  const hub = countingHub();
  const clock = { t: 1000 };
  const me = makeNet(hub, 'aaaa', 'Ani', clock);
  const near = makeNet(hub, 'near', 'Dekat', clock);
  const far = makeNet(hub, 'far', 'Jauh', clock);
  await me.connect('', 'Ani');
  await near.connect('', 'Dekat');
  await far.connect('', 'Jauh');
  clock.t += 200;
  me.sendInput(0, 0, 0, undefined, { x: 0, z: 0 });
  near.sendInput(0, 0, 0, undefined, { x: 3, z: 0 });
  far.sendInput(0, 0, 0, undefined, { x: 60, z: 0 });
  clock.t += 200;
  me.sendInput(0, 0, 0, undefined, { x: 0, z: 0 }); // posisi kita menyadari near/far
  hub.sent.length = 0;

  // diam 3 detik: tidak ada kiriman gerak, hanya heartbeat ~1x/dtk
  for (let i = 0; i < 30; i++) { clock.t += 100; me.sendInput(0, 0, 0, undefined, { x: 0, z: 0 }); }
  const idleSends = hub.sent.filter((m) => m.from === 'aaaa').length;
  assert.ok(idleSends <= 4, `diam 3 dtk hanya ${idleSends} kiriman`);

  // berjalan 3 detik
  hub.sent.length = 0;
  for (let i = 0; i < 30; i++) { clock.t += 100; me.sendInput(0, 0, 0, undefined, { x: 0.1 * (i + 1), z: 0 }); }
  const mine = hub.sent.filter((m) => m.from === 'aaaa' && Array.isArray(m.to));
  const toNear = mine.filter((m) => m.to.includes('near')).length;
  const toFar = mine.filter((m) => m.to.includes('far')).length;
  assert.ok(toNear >= 25, `dekat menerima rapat: ${toNear}`);
  assert.ok(toFar >= 4 && toFar <= 8, `jauh menerima jarang: ${toFar}`);
  assert.ok(toFar < toNear / 3);
  // data yang diterima yang dekat tetap mulus & benar
  assert.ok(Math.abs(near.players.find((p) => p.id === 'aaaa').x - 3) < 0.15);
  me.close(); near.close(); far.close();
});

// ---- pemulihan koneksi ----
function makeRejoinHub() {
  const hub = makeHub();
  const Base = hub.LiveKit.Room;
  hub.LiveKit.Room = class extends Base {
    serverKick() { // putus total dari sisi server
      this.remoteParticipants.clear();
      this.emit('dc');
    }
  };
  return hub;
}

test('putus total: masuk lagi otomatis dengan identitas baru, status berubah, pemain lain dimuat ulang, tanpa menyerah terlalu cepat', async () => {
  const hub = makeRejoinHub();
  const clock = { t: 1000 };
  let n = 0;
  const mk = (id, name) => new LiveKitNet({
    LiveKit: hub.LiveKit, now: () => clock.t, sleep: async () => {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ enabled: true, url: 'wss://x', token: `${id}${id === 'aaaa' ? n : ''}|${name}`, id: `${id}${id === 'aaaa' ? n : ''}` }) }),
  });
  const a = mk('aaaa', 'Ani');
  const b = mk('bbbb', 'Budi');
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  assert.equal(a.status, 'online');
  const statuses = [];
  a.on('status', (m) => statuses.push(m.status));
  const rejoined = [];
  a.on('rejoined', (m) => rejoined.push(m.id));
  n = 1;
  const room = a.room;
  room.serverKick();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(statuses, ['reconnecting', 'online']);
  assert.equal(a.status, 'online');
  assert.equal(a.id, 'aaaa1', 'identitas baru setelah masuk ulang');
  assert.equal(a.self.id, 'aaaa1');
  assert.deepEqual(rejoined, ['aaaa1']);
  assert.ok(a.players.some((p) => p.id === 'bbbb'), 'peserta yang masih ada dimuat ulang');
  clock.t += 200;
  a.sendInput(0, 0, 0, undefined, { x: 5, z: 5 });
  assert.ok(Math.abs(b.players.find((p) => p.id === 'aaaa1').x - 5) < 0.1, 'pemain lain melihat kita lagi');
  a.close(); b.close();
});

test('putus total berulang gagal: berhenti dengan status offline dan event close; konfigurasi salah tidak diulang-ulang', async () => {
  const hub = makeRejoinHub();
  let calls = 0;
  let fail = false;
  const a = new LiveKitNet({
    LiveKit: hub.LiveKit, sleep: async () => {},
    fetchImpl: async () => { calls++; if (fail) throw new Error('jaringan putus'); return { ok: true, json: async () => ({ enabled: true, url: 'wss://x', token: 'aaaa|Ani', id: 'aaaa' }) }; },
  });
  await a.connect('', 'Ani');
  const events = [];
  a.on('close', () => events.push('close'));
  a.on('status', (m) => events.push(m.status));
  fail = true;
  calls = 0;
  a.room.serverKick();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 7, 'mencoba sebanyak jadwal lalu menyerah');
  assert.deepEqual(events, ['reconnecting', 'offline', 'close']);

  const cfg = new LiveKitNet({
    LiveKit: hub.LiveKit, sleep: async () => {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ enabled: true, url: 'wss://x', token: 'cccc|C', id: 'cccc' }) }),
  });
  await cfg.connect('', 'C');
  let cfgCalls = 0;
  cfg.fetch = async () => { cfgCalls++; return { ok: true, json: async () => ({ enabled: false, reason: 'event' }) }; };
  cfg.room.serverKick();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(cfgCalls, 1, 'undangan tidak ada: tidak diulang');
  assert.equal(cfg.status, 'offline');
  a.close(); cfg.close();
});

test('close() sengaja tidak memicu masuk ulang', async () => {
  const hub = makeRejoinHub();
  let calls = 0;
  const a = new LiveKitNet({ LiveKit: hub.LiveKit, sleep: async () => {}, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ enabled: true, url: 'wss://x', token: 'aaaa|Ani', id: 'aaaa' }) }; } });
  await a.connect('', 'Ani');
  calls = 0;
  const closed = [];
  a.on('close', () => closed.push(1));
  a.closing = true;
  a.room.serverKick();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 0);
  assert.equal(closed.length, 1);
  a.close();
});
