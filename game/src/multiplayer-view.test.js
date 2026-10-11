import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameServer } from '../../server/src/server.js';
import { createRemotePlayers, resolveServerUrl, startMultiplayer } from './multiplayer-view.js';

test('resolveServerUrl hanya menerima ws/wss', () => {
  assert.equal(resolveServerUrl('?server=ws://localhost:8080'), 'ws://localhost:8080/');
  assert.equal(resolveServerUrl('?server=wss://orbit.example.com/room'), 'wss://orbit.example.com/room');
  assert.equal(resolveServerUrl('?server=http://evil.com'), null);
  assert.equal(resolveServerUrl('?server=javascript:alert(1)'), null);
  assert.equal(resolveServerUrl('?server=bukan-url'), null);
  assert.equal(resolveServerUrl(''), null);
  assert.equal(resolveServerUrl(undefined), null);
});

test('RemotePlayers: menambah, menggerakkan halus, dan menghapus avatar; pemain lokal diabaikan', () => {
  const scene = new THREE.Scene();
  const view = createRemotePlayers(scene);
  const players = [
    { id: 'me', name: 'Aku', x: 0, z: 0, rot: 0 },
    { id: 'b', name: 'B', x: 4, z: 0, rot: 0 },
  ];
  view.sync(players, 'me');
  assert.equal(view.count, 1);
  assert.equal(scene.children.length, 1);

  players[1].x = 8;
  view.sync(players, 'me');
  view.update(0.016);
  const x1 = view.getAvatar('b').position.x;
  assert.ok(x1 > 4 && x1 < 8);
  for (let i = 0; i < 120; i++) view.update(0.016);
  assert.ok(Math.abs(view.getAvatar('b').position.x - 8) < 0.01);

  view.sync([players[0]], 'me');
  assert.equal(view.count, 0);
  assert.equal(scene.children.length, 0);
});

test('rotasi mengambil jalur terpendek melewati 2π', () => {
  const scene = new THREE.Scene();
  const view = createRemotePlayers(scene);
  view.sync([{ id: 'b', name: 'B', x: 0, z: 0, rot: 6.2 }], 'me');
  view.sync([{ id: 'b', name: 'B', x: 0, z: 0, rot: 0.1 }], 'me');
  view.update(0.016);
  const r = view.getAvatar('b').rotation.y;
  assert.ok(r > 6.2, `rotasi harus lanjut naik lewat 2π, dapat ${r}`);
});

test('startMultiplayer: tanpa ?server= mengembalikan null; server mati tidak melempar error', async () => {
  const scene = new THREE.Scene();
  assert.equal(await startMultiplayer({ scene, search: '' }), null);
  const origWarn = console.warn;
  console.warn = () => {};
  const result = await startMultiplayer({ scene, search: '?server=ws://127.0.0.1:1' });
  console.warn = origWarn;
  assert.equal(result, null);
  assert.equal(scene.children.length, 0);
});

test('startMultiplayer terhubung ke server nyata dan menampilkan pemain lain', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickRate: 50 });
  await server.ready;
  const search = `?server=ws://127.0.0.1:${server.port}`;
  const sceneA = new THREE.Scene();
  const sceneB = new THREE.Scene();
  const a = await startMultiplayer({ scene: sceneA, search, name: 'A' });
  const b = await startMultiplayer({ scene: sceneB, search, name: 'B' });
  const t0 = Date.now();
  while (Date.now() - t0 < 2000 && (a.view.count < 1 || b.view.count < 1)) await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.view.count, 1);
  assert.equal(b.view.count, 1);

  const startX = b.view.getAvatar(a.net.id).position.x;
  a.sendInput(1, 0, 0, 1000);
  const t1 = Date.now();
  while (Date.now() - t1 < 2000 && Math.abs(b.view.getAvatar(a.net.id).position.x - startX) < 0.05) {
    await new Promise((r) => setTimeout(r, 20));
    b.view.update(0.02);
  }
  assert.ok(Math.abs(b.view.getAvatar(a.net.id).position.x - startX) >= 0.05);

  a.dispose();
  const t2 = Date.now();
  while (Date.now() - t2 < 2000 && b.view.count > 0) await new Promise((r) => setTimeout(r, 10));
  assert.equal(b.view.count, 0);
  b.dispose();
  await server.close();
});
