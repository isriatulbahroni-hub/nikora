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
