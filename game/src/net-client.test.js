import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../../server/src/server.js';
import { NetClient } from './net-client.js';

test('NetClient bergabung, menerima snapshot, dan melihat pemain lain', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const url = `ws://127.0.0.1:${server.port}`;
  const a = new NetClient();
  const b = new NetClient();
  const welcomeA = await a.connect(url, 'Ron');
  await b.connect(url, 'Tamu');
  assert.equal(a.id, welcomeA.id);

  const start = Date.now();
  while (Date.now() - start < 2000 && a.players.length < 2) await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.players.length, 2);

  const before = b.players.find((p) => p.id === a.id);
  a.sendInput(0, 1, 0);
  const t0 = Date.now();
  let after = before;
  while (Date.now() - t0 < 2000 && after.z === before.z) {
    await new Promise((r) => setTimeout(r, 10));
    after = b.players.find((p) => p.id === a.id) ?? after;
  }
  assert.notEqual(after.z, before.z);

  a.close();
  b.close();
  await server.close();
});
