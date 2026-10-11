import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const LIMITS = Object.freeze({
  maxPayload: 512,
  joinTimeoutMs: 5000,
  idleTimeoutMs: 15000,
  maxMessagesPerSecond: 60,
});

export function createGameServer({ port = 8080, host = '0.0.0.0', tickRate = 20, roomRules, log = () => {} } = {}) {
  const room = new Room(roomRules);
  const wss = new WebSocketServer({ port, host, maxPayload: LIMITS.maxPayload });
  const sockets = new Map(); // id -> ws
  let tick = 0;
  let last = Date.now();

  const send = (ws, data) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  };
  const broadcast = (data) => {
    for (const ws of sockets.values()) send(ws, data);
  };

  wss.on('connection', (ws) => {
    let id = null;
    let windowStart = Date.now();
    let windowCount = 0;
    ws.lastSeen = Date.now();

    const joinTimer = setTimeout(() => {
      if (!id) ws.close(4001, 'join timeout');
    }, LIMITS.joinTimeoutMs);

    ws.on('message', (raw) => {
      const now = Date.now();
      ws.lastSeen = now;
      if (now - windowStart >= 1000) {
        windowStart = now;
        windowCount = 0;
      }
      if (++windowCount > LIMITS.maxMessagesPerSecond) return ws.close(4008, 'rate limit');

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { t: 'error', reason: 'invalid json' });
      }
      if (!msg || typeof msg !== 'object') return send(ws, { t: 'error', reason: 'invalid message' });

      if (msg.t === 'join') {
        if (id) return send(ws, { t: 'error', reason: 'already joined' });
        const newId = randomUUID().slice(0, 8);
        const player = room.addPlayer(newId, msg.name);
        if (!player) return ws.close(4003, 'room full');
        id = newId;
        sockets.set(id, ws);
        clearTimeout(joinTimer);
        send(ws, { t: 'welcome', id, players: room.snapshot() });
        log(`join ${id} (${player.name})`);
      } else if (msg.t === 'input') {
        if (!id) return send(ws, { t: 'error', reason: 'join first' });
        if (!room.setInput(id, msg)) send(ws, { t: 'error', reason: 'invalid input' });
      } else if (msg.t === 'ping') {
        send(ws, { t: 'pong', ts: msg.ts });
      } else {
        send(ws, { t: 'error', reason: 'unknown type' });
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimer);
      if (!id) return;
      room.removePlayer(id);
      sockets.delete(id);
      broadcast({ t: 'left', id });
      log(`leave ${id}`);
    });
    ws.on('error', () => ws.terminate());
  });

  const loop = setInterval(() => {
    const now = Date.now();
    room.step((now - last) / 1000);
    last = now;
    tick += 1;
    if (sockets.size > 0) broadcast({ t: 'state', tick, players: room.snapshot() });
    for (const ws of wss.clients) {
      if (now - ws.lastSeen > LIMITS.idleTimeoutMs) ws.terminate();
    }
  }, 1000 / tickRate);

  const ready = new Promise((resolve) => wss.once('listening', resolve));

  return {
    room,
    wss,
    ready,
    get port() {
      return wss.address().port;
    },
    close: () =>
      new Promise((resolve) => {
        clearInterval(loop);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}
