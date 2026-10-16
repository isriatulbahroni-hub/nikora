import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { getVillaWorld } from '../../game/src/villa-layout.js';
import { createGameServer } from './server.js';

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const next = (pred, ms = 2000) => {
    const hit = inbox.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error('timeout menunggu pesan')), ms);
    });
  };
  const open = new Promise((r) => ws.on('open', r));
  return { ws, next, open, send: (o) => ws.send(JSON.stringify(o)), inbox };
}

test('server: check-in, ketuk, jawaban, dan siaran status kamar', async () => {
  const srv = createGameServer({ port: 0, host: '127.0.0.1', roomRules: { world: getVillaWorld() } });
  await srv.ready;
  const a = client(srv.port);
  const b = client(srv.port);
  await Promise.all([a.open, b.open]);
  a.send({ t: 'join', name: 'A' });
  b.send({ t: 'join', name: 'B' });
  const wa = await a.next((m) => m.t === 'welcome');
  const wb = await b.next((m) => m.t === 'welcome');
  assert.deepEqual(wa.rooms, []);
  const pa = srv.room.players.get(wa.id);
  const pb = srv.room.players.get(wb.id);
  Object.assign(pa, { x: 18.75, z: 13 });
  Object.assign(pb, { x: 18.75, z: 13.4 });

  a.send({ t: 'room', act: 'checkin', room: 'guest_1' });
  await a.next((m) => m.t === 'room-ok' && m.act === 'checkin');
  const rooms = await b.next((m) => m.t === 'rooms');
  assert.deepEqual(rooms.rooms, [{ id: 'guest_1', owner: wa.id, locked: true }]);

  b.send({ t: 'room', act: 'knock', room: 'guest_1' });
  const knock = await a.next((m) => m.t === 'knock');
  assert.deepEqual([knock.from, knock.name, knock.room], [wb.id, 'B', 'guest_1']);

  a.send({ t: 'room', act: 'knock-reply', from: wb.id, accept: true });
  const res = await b.next((m) => m.t === 'knock-result');
  assert.equal(res.accepted, true);

  b.send({ t: 'room', act: 'checkin', room: 'guest_1' });
  const err = await b.next((m) => m.t === 'room-error');
  assert.equal(err.reason, 'taken');
  a.send({ t: 'room', act: 'checkout' });
  const after = await b.next((m) => m.t === 'rooms' && m.rooms.length === 0);
  assert.deepEqual(after.rooms, []);
  a.ws.close(); b.ws.close();
  await srv.close();
});
