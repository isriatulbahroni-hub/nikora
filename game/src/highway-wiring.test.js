import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, HIGHWAY_HALF, HIGHWAY_LIMIT, HUB, HIGHWAY_SEGMENTS, gateAt, gateArrival, gateCarSpecs, gateUrl, arrivalGate } from './highway.js';
import { HOTEL_SPAWN, getHotelWorld, roomAt, surfaceAt } from './hotel-layout.js';
import { CAR, createVehicle, boardVehicle, stepVehicle } from './vehicle.js';

const DT = 1 / 60;

test('permukaan: seluruh jaringan jalan (lingkar + 4 lengan) terbaca sebagai aspal dan lebarnya 34,5 m', () => {
  for (const s of HIGHWAY_SEGMENTS) {
    const mid = (s.from + s.to) / 2;
    const p = s.axis === 'z' ? [s.c, mid] : [mid, s.c];
    assert.equal(surfaceAt(p[0], p[1]), 'road', s.id);
    const edge = s.axis === 'z' ? [s.c + HIGHWAY_HALF - 0.1, mid] : [mid, s.c + HIGHWAY_HALF - 0.1];
    assert.equal(surfaceAt(edge[0], edge[1]), 'road', `${s.id} tepi`);
  }
});

test('tiap gerbang berada di atas aspal dan punya nama jalan baru', () => {
  assert.equal(GATES.length, 4);
  for (const g of GATES) {
    assert.equal(surfaceAt(g.x, g.z), 'road', g.id);
    assert.match(roomAt(g.x, g.z, 0).name, /Jalan Raya NIKORA/, g.id);
  }
  assert.equal(roomAt(0, 300, 0).name, 'Jalan Raya NIKORA · Arah Villa');
  assert.equal(roomAt(-300, HUB.z, 0).name, 'Jalan Raya NIKORA · Arah Aula');
});

test('pejalan kaki bisa mencapai keempat gerbang (batas dunia hotel lebih luas dari villa)', () => {
  const world = getHotelWorld();
  for (const g of GATES) {
    assert.ok(g.x >= HIGHWAY_LIMIT.minX && g.x <= HIGHWAY_LIMIT.maxX && g.z >= HIGHWAY_LIMIT.minZ && g.z <= HIGHWAY_LIMIT.maxZ, `${g.id} di dalam batas`);
    assert.ok(world.canStand(0, g.x, g.z), `${g.id} bisa diinjak`);
  }
  // berjalan terus ke timur menyusuri lengan Royal tidak tertahan di x=600 (batas dunia villa)
  let pos = { x: 200, z: HUB.z, level: 0 };
  for (let i = 0; i < 100; i++) pos = world.move(pos, 6, 0);
  assert.ok(pos.x > 650, `x=${pos.x}`);
});

test('mengemudi dari Lingkar ke timur sampai gerbang Royal memicu gerbang, tetap di aspal', () => {
  const env = { colliders: [], surfaceAt, limit: HIGHWAY_LIMIT };
  const v = createVehicle({ id: 't', x: 180, z: HUB.z - 5, heading: Math.PI / 2 }); // menghadap timur
  boardVehicle(v, 0, 'p');
  let t = 0;
  let hit = null;
  let off = 0;
  while (!hit && t < 60) {
    stepVehicle(v, { throttle: 1, steer: 0 }, DT, env);
    if (surfaceAt(v.x, v.z) !== 'road') off++;
    hit = gateAt(v.x, v.z);
    t += DT;
  }
  assert.equal(hit?.id, 'royal');
  assert.equal(off, 0);
  assert.ok(v.x < HIGHWAY_LIMIT.maxX - CAR.length / 2, 'tidak tertahan batas dunia villa');
});

test('mobil tidak lagi tertahan batas ±600 villa di jaringan jalan hotel', () => {
  const env = { colliders: [], surfaceAt, limit: HIGHWAY_LIMIT };
  const v = createVehicle({ id: 't', x: 595, z: HUB.z, heading: Math.PI / 2 }); // di luar gerbang Royal, di tanah (batas laju 10 m/s)
  boardVehicle(v, 0, 'p');
  v.speed = 8;
  for (let i = 0; i < 60 * 4; i++) stepVehicle(v, { throttle: 1 }, DT, env);
  assert.ok(v.x > 610, `x=${v.x.toFixed(1)}`);
});

test('gateUrl dan kedatangan: alamat halaman tujuan membawa from=hotel; tamu yang datang muncul di luar zona gerbang', () => {
  for (const g of GATES) {
    const url = gateUrl(g, '?name=Sari&q=low&role=owner');
    assert.match(url, /from=hotel/);
    assert.match(url, /name=Sari/);
    assert.doesNotMatch(url, /role=/);
    assert.equal(arrivalGate(g.id)?.id, g.id);
    const a = gateArrival(g);
    assert.equal(gateAt(a.x, a.z), null, `${g.id}: tidak langsung memicu gerbang saat tiba`);
  }
  assert.equal(arrivalGate('hotel'), null);
  assert.equal(gateCarSpecs().length, 8);
});

test('spawn hotel tetap di drop-off (bukan di jalan raya atau gerbang)', () => {
  assert.equal(gateAt(HOTEL_SPAWN.x, HOTEL_SPAWN.z), null);
});
