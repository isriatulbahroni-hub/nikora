import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, createRally } from './badminton.js';
import { COURT_MARGIN, VILLA_COURT, createCourtFrame } from './court-frame.js';

const frame = createCourtFrame();
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('toWorld dan toLocal saling membalik', () => {
  for (const p of [{ x: 0, y: 0, z: 0 }, { x: 2.5, y: 1.2, z: -6 }, { x: -3, y: 0.5, z: 4.4 }]) {
    const back = frame.toLocal(frame.toWorld(p));
    assert.ok(near(back.x, p.x) && near(back.y, p.y) && near(back.z, p.z));
  }
});

test('net di tengah lapangan; sisi a di barat dan b di timur', () => {
  const net = frame.toWorld({ x: 0, y: 0, z: 0 });
  assert.deepEqual({ x: net.x, z: net.z }, VILLA_COURT);
  assert.equal(frame.sideAt({ x: VILLA_COURT.x - 3, z: VILLA_COURT.z }), 'a');
  assert.equal(frame.sideAt({ x: VILLA_COURT.x + 3, z: VILLA_COURT.z }), 'b');
  assert.equal(frame.sideAt({ x: VILLA_COURT.x + 20, z: VILLA_COURT.z }), null);
});

test('panjang lapangan sejajar sumbu x dunia, lebarnya sejajar z', () => {
  const r = frame.padRect();
  assert.ok(near(r.maxX - r.minX, COURT.length));
  assert.ok(near(r.maxZ - r.minZ, COURT.width));
  assert.ok(near(frame.padRect(COURT_MARGIN).maxX - r.maxX, COURT_MARGIN));
});

test('servis sisi a bergerak ke timur (x dunia bertambah) dan jatuh di sisi b', () => {
  const rally = createRally();
  rally.serve('a', { power: 0.6 });
  const start = frame.toWorld(rally.shuttle.pos);
  let ev = null;
  for (let t = 0; t < 5 && !ev; t += 1 / 60) ev = rally.step(1 / 60);
  const end = frame.toWorld(rally.shuttle.pos);
  assert.ok(end.x > start.x, 'bergerak ke timur');
  assert.equal(frame.sideAt(end, 0), 'b');
  assert.equal(ev.side, 'b');
});

test('aimX positif bergeser ke -z dunia (x lokal = -z dunia)', () => {
  const rally = createRally();
  rally.serve('a', { power: 0.6, aimX: 1 });
  for (let t = 0; t < 5 && !rally.step(1 / 60); t += 1 / 60);
  const end = frame.toWorld(rally.shuttle.pos);
  assert.ok(end.z < VILLA_COURT.z);
});

test('net: kotak tipis tepat di garis net, selebar lapangan', () => {
  const n = frame.netCollider();
  assert.ok(n.minX < VILLA_COURT.x && n.maxX > VILLA_COURT.x);
  assert.ok(n.maxX - n.minX < 0.2);
  assert.ok(n.minZ <= VILLA_COURT.z - COURT.width / 2 && n.maxZ >= VILLA_COURT.z + COURT.width / 2);
});

test('lapangan villa muat di halaman barat daya dan tidak menabrak pagar, dapur, atau gerbang', () => {
  const r = frame.padRect(COURT_MARGIN);
  assert.ok(r.minX > -42 && r.maxX < 42 && r.maxZ < 42, 'di dalam pagar');
  assert.ok(r.minZ > 30, 'di selatan dapur (dapur berakhir di z = 30)');
  assert.ok(r.maxX < -12, 'jauh dari taman air mancur dan jalan masuk');
});
