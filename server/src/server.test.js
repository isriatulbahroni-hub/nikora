import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from './server.js';

const url = (s) => `ws://127.0.0.1:${s.port}`;

function connect(server) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url(server));
    ws.inbox = [];
    ws.on('message', (d) => ws.inbox.push(JSON.parse(d.toString())));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
const waitFor = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timeout waiting for condition');
};
const find = (ws, t, pred = () => true) => ws.inbox.find((m) => m.t === t && pred(m));

test('dua klien saling melihat dan gerakan dikendalikan server', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const a = await connect(server);
  const b = await connect(server);
  a.send(JSON.stringify({ t: 'join', name: 'Ron' }));
  b.send(JSON.stringify({ t: 'join', name: 'Tamu2' }));
  const wa = await waitFor(() => find(a, 'welcome'));
  const wb = await waitFor(() => find(b, 'welcome'));
  assert.notEqual(wa.id, wb.id);

  await waitFor(() => find(a, 'state', (m) => m.players.length === 2));
  const before = find(b, 'state', (m) => m.players.some((p) => p.id === wa.id)).players.find((p) => p.id === wa.id);

  a.send(JSON.stringify({ t: 'input', x: 1, z: 0, rot: 1, seq: 1 }));
  const moved = await waitFor(() =>
    b.inbox.filter((m) => m.t === 'state').map((m) => m.players.find((p) => p.id === wa.id)).find((p) => p && p.seq === 1 && p.x !== before.x),
  );
  assert.ok(moved.x > before.x || moved.x === 10.5);

  a.close();
  const left = await waitFor(() => find(b, 'left'));
  assert.equal(left.id, wa.id);
  b.close();
  await server.close();
});

test('klien tidak bisa menyetel posisi sendiri', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const a = await connect(server);
  a.send(JSON.stringify({ t: 'join', name: 'Cheat' }));
  const w = await waitFor(() => find(a, 'welcome'));
  const start = w.players.find((p) => p.id === w.id);
  a.send(JSON.stringify({ t: 'input', x: 0, z: 0, rot: 0, seq: 1, posX: 99, posZ: 99, x2: 5 }));
  await new Promise((r) => setTimeout(r, 150));
  const now = a.inbox.filter((m) => m.t === 'state').at(-1).players.find((p) => p.id === w.id);
  assert.equal(now.x, start.x);
  assert.equal(now.z, start.z);
  a.close();
  await server.close();
});

test('pesan rusak, tanpa join, dan tipe tak dikenal mendapat error tanpa menjatuhkan server', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const a = await connect(server);
  a.send('{bukan json');
  a.send(JSON.stringify({ t: 'input', x: 1, z: 0, rot: 0, seq: 1 }));
  a.send(JSON.stringify({ t: 'hack' }));
  a.send('null');
  await waitFor(() => a.inbox.filter((m) => m.t === 'error').length >= 4);
  a.send(JSON.stringify({ t: 'join', name: 'Ok' }));
  await waitFor(() => find(a, 'welcome'));
  a.send(JSON.stringify({ t: 'ping', ts: 42 }));
  assert.equal((await waitFor(() => find(a, 'pong'))).ts, 42);
  a.close();
  await server.close();
});

test('payload terlalu besar memutus koneksi', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const a = await connect(server);
  const closed = new Promise((r) => a.on('close', r));
  a.send('x'.repeat(5000));
  await closed;
  await server.close();
});

test('ruang penuh menutup koneksi tambahan', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50, roomRules: { maxPlayers: 1 } });
  await server.ready;
  const a = await connect(server);
  a.send(JSON.stringify({ t: 'join' }));
  await waitFor(() => find(a, 'welcome'));
  const b = await connect(server);
  const code = new Promise((r) => b.on('close', (c) => r(c)));
  b.send(JSON.stringify({ t: 'join' }));
  assert.equal(await code, 4003);
  a.close();
  await server.close();
});

test('rate limit memutus klien yang membanjiri server', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const a = await connect(server);
  const code = new Promise((r) => a.on('close', (c) => r(c)));
  for (let i = 0; i < 200; i++) a.send(JSON.stringify({ t: 'ping', ts: i }));
  assert.equal(await code, 4008);
  await server.close();
});

test('chat disiarkan ke semua pemain; pesan kosong, spam, dan sebelum join ditolak', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const a = await connect(server);
  const b = await connect(server);
  const lurker = await connect(server);
  a.send(JSON.stringify({ t: 'join', name: 'Ani' }));
  b.send(JSON.stringify({ t: 'join', name: 'Budi' }));
  const wa = await waitFor(() => find(a, 'welcome'));
  await waitFor(() => find(b, 'welcome'));

  lurker.send(JSON.stringify({ t: 'chat', text: 'belum join' }));
  await waitFor(() => find(lurker, 'error', (m) => m.reason === 'join first'));

  a.send(JSON.stringify({ t: 'chat', text: 'Halo <semua>' }));
  const got = await waitFor(() => find(b, 'chat'));
  assert.equal(got.id, wa.id);
  assert.equal(got.name, 'Ani');
  assert.equal(got.text, 'Halo semua');
  assert.ok(find(a, 'chat')); // pengirim juga menerima (server sebagai sumber kebenaran)

  a.send(JSON.stringify({ t: 'chat', text: 'terlalu cepat' }));
  await waitFor(() => find(a, 'error', (m) => m.reason === 'invalid chat'));
  b.send(JSON.stringify({ t: 'chat', text: '   ' }));
  await waitFor(() => find(b, 'error', (m) => m.reason === 'invalid chat'));

  a.close(); b.close(); lurker.close();
  await server.close();
});

import { createVoiceToken } from './server.js';

test('voice: tanpa konfigurasi LiveKit token tidak dibuat; dengan konfigurasi berupa JWT berisi identitas pemain', async () => {
  assert.equal(await createVoiceToken({ id: 'a', name: 'A', env: {} }), null);
  const v = await createVoiceToken({
    id: 'abc12345',
    name: 'Budi',
    env: { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-1234' },
  });
  assert.equal(v.url, 'wss://x.livekit.cloud');
  const payload = JSON.parse(Buffer.from(v.token.split('.')[1], 'base64url').toString());
  assert.equal(payload.sub, 'abc12345');
  assert.equal(payload.video.room, 'orbit-hall');
  assert.equal(payload.video.canPublish, true);
});

test('integrasi WebSocket: salaman diajak, diterima, keduanya berpasangan; token suara nonaktif tanpa LiveKit, aktif dengan LiveKit', async () => {
  const server = createGameServer({
    port: 0,
    host: '127.0.0.1',
    tickRate: 50,
    voiceEnv: { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-1234' },
  });
  await server.ready;
  const a = await connect(server);
  const b = await connect(server);
  a.send(JSON.stringify({ t: 'join', name: 'A' }));
  b.send(JSON.stringify({ t: 'join', name: 'B' }));
  const wa = await waitFor(() => find(a, 'welcome'));
  const wb = await waitFor(() => find(b, 'welcome'));
  // dekatkan keduanya langsung lewat room (posisi spawn bisa berjauhan)
  Object.assign(server.room.players.get(wa.id), { x: 0, z: 0 });
  Object.assign(server.room.players.get(wb.id), { x: 1.2, z: 0 });

  a.send(JSON.stringify({ t: 'greet', to: wb.id, kind: 'handshake' }));
  const req = await waitFor(() => find(b, 'greet-req'));
  assert.equal(req.from, wa.id);
  b.send(JSON.stringify({ t: 'greet-reply', from: wa.id, accept: true }));
  await waitFor(() => find(a, 'state', (m) => m.players.find((p) => p.id === wa.id)?.act === 'handshake'));
  const st = find(b, 'state', (m) => m.players.find((p) => p.id === wb.id)?.with === wa.id);
  assert.ok(st);

  a.send(JSON.stringify({ t: 'voice-token' }));
  const v = await waitFor(() => find(a, 'voice'));
  assert.equal(v.enabled, true);
  assert.ok(v.token.split('.').length === 3);

  a.close();
  b.close();
  await server.close();
});

test('integrasi WebSocket: voice-token tanpa konfigurasi membalas enabled:false', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50, voiceEnv: {} });
  await server.ready;
  const a = await connect(server);
  a.send(JSON.stringify({ t: 'join', name: 'A' }));
  await waitFor(() => find(a, 'welcome'));
  a.send(JSON.stringify({ t: 'voice-token' }));
  assert.equal((await waitFor(() => find(a, 'voice'))).enabled, false);
  a.close();
  await server.close();
});
