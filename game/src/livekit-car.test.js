import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveKitNet } from './livekit-net.js';
import { Fleet } from './vehicle-fleet.js';

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
      rooms.set(this.identity, this); // terdaftar dulu: peserta lama langsung bisa mengirim data ke pendatang saat ParticipantConnected (seperti LiveKit asli)
      for (const other of rooms.values()) {
        if (other === this) continue;
        this.remoteParticipants.set(other.identity, { identity: other.identity, name: other.name, metadata: other.metadata });
        other.remoteParticipants.set(this.identity, { identity: this.identity, name: this.name, metadata: this.metadata });
        other.emit('pc', { identity: this.identity, name: this.name, metadata: this.metadata });
      }
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


function wire(net, fleet, clock) {
  fleet.selfId = net.id;
  fleet.send = (msg, opts) => net.sendCar(msg, opts);
  fleet.now = () => clock.t;
  net.on('car', ({ from, msg }) => fleet.receive(from, msg));
  net.on('left', (m) => fleet.dropPlayer(m.id));
  net.carSnapshot = () => fleet.snapshot();
}

test('LiveKitNet: event car sampai ke klien lain dengan id pengirim; server lama tanpa sendCar tidak dipakai', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  const got = [];
  b.on('car', (m) => got.push(m));
  a.sendCar({ t: 'v', k: 's', c: 0, x: 1, z: 2, h: 0, v: 3, e: 1 });
  assert.equal(got.length, 1);
  assert.equal(got[0].from, 'aaaa');
  assert.equal(got[0].msg.x, 1);
  a.close();
  b.close();
});

test('mobil lewat LiveKit: naik/turun terlihat pemain lain, dan pendatang baru menerima mobil yang sudah bergeser', async () => {
  const hub = makeHub();
  const clock = { t: 1000 };
  const a = makeNet(hub, 'aaaa', 'Ani', clock);
  const b = makeNet(hub, 'bbbb', 'Budi', clock);
  await a.connect('', 'Ani');
  await b.connect('', 'Budi');
  const fa = new Fleet({ env: { colliders: [], surfaceAt: () => 'road' } });
  const fb = new Fleet({ env: { colliders: [], surfaceAt: () => 'road' } });
  wire(a, fa, clock);
  wire(b, fb, clock);
  const c0 = fa.cars[0];
  assert.ok(fa.board({ x: c0.x, z: c0.z }));
  assert.equal(fb.cars[0].seats[0], 'aaaa');
  assert.ok(fb.board({ x: c0.x, z: c0.z }));
  assert.equal(fa.cars[0].seats[1], 'bbbb');
  for (let i = 0; i < 60; i++) { clock.t += 33; fa.drive({ throttle: 1, steer: 0 }, 1 / 30); }
  fb.leave();
  fa.leave();
  assert.equal(fb.cars[0].seats.every((s) => s === null), true);
  const moved = { x: fa.cars[0].x, z: fa.cars[0].z };
  assert.ok(Math.hypot(moved.x - c0.home.x, moved.z - c0.home.z) > 5);
  // pendatang baru
  const c = makeNet(hub, 'cccc', 'Citra', clock);
  const fc = new Fleet({});
  wire(c, fc, clock);
  await c.connect('', 'Citra');
  assert.ok(Math.hypot(fc.cars[0].x - moved.x, fc.cars[0].z - moved.z) < 0.02, 'Citra melihat mobil di tempat terakhirnya');
  // pemain keluar: kursinya dikosongkan di klien lain
  assert.ok(fa.board({ x: fa.cars[2].x, z: fa.cars[2].z }));
  assert.equal(fb.cars[2].seats[0], 'aaaa');
  a.close();
  assert.equal(fb.cars[2].seats[0], null);
  b.close();
  c.close();
});
