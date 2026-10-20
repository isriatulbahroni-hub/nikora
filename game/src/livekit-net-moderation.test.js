import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveKitNet } from './livekit-net.js';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const json = (o) => ({ ok: true, json: async () => o, clone() { return this; } });

test('Node tanpa window: moderasi tidak terpasang (perilaku lama)', () => {
  const net = new LiveKitNet({ fetchImpl: async () => json({}) });
  assert.equal(Object.hasOwn(net, 'sendChat'), false);
});

test('moderasi aktif: token membawa deviceId, koneksi penuh dengan LiveKit palsu, chat kasar ditahan', async () => {
  const bodies = [];
  const published = [];
  const room = {
    remoteParticipants: new Map(), state: 'connected',
    on() { return this; },
    async connect() {},
    localParticipant: { publishData: async (d) => { published.push(JSON.parse(new TextDecoder().decode(d))); } },
    disconnect() {},
  };
  const LiveKit = { Room: function () { return room; }, RoomEvent: new Proxy({}, { get: (_, k) => String(k) }) };
  const net = new LiveKitNet({
    LiveKit, world: 'villa',
    fetchImpl: async (_u, init) => { bodies.push(JSON.parse(init.body)); return json({ enabled: true, url: 'wss://x', token: 't', id: 'abc', modToken: 'tok' }); },
    moderation: { storage: store(), fetchImpl: async () => json({ ok: false, action: 'warn', message: 'Peringatan 1/3' }) },
  });
  const chats = [];
  net.on('chat', (m) => chats.push(m));
  await net.connect('', 'Budi');
  assert.match(bodies[0].deviceId, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(bodies[0].name, 'Budi');
  net.sendChat('halo semua');
  assert.equal(chats.at(-1).text, 'halo semua');
  assert.ok(published.some((p) => p.t === 'c' && p.x === 'halo semua'));
  const before = published.length;
  net.now = () => Date.now() + 5000;
  net.sendChat('dasar anjing');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(published.length, before);
  assert.equal(chats.at(-1).name, 'Sistem');
  net.close();
});
