import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CABANAS, CLIFF, CLIFF_COLLIDERS, CLIFF_TOP, DECK_ROCKS, FALLS, LAGOON_COLLIDERS, LAGOON_POOL, LAGOON_RECT, LAGOON_VIEW, LOUNGERS, PALMS, PARASOLS, PIER, PIER_WALK, PLANTERS, SIGN,
  SOUND_SOURCES, WATER_BLOCKS, cabanaColliders, cliffBlocks, inPoolWater, lagoonRocks, lagoonSoundLevel, loudestSource, loungerRect, onPier, soundPan, waterfallGain,
} from './hotel-lagoon-data.js';
import { HOTEL_BUILDING, HOTEL_FORECOURT, HOTEL_SITE, getHotelWorld, roomAt } from './hotel-layout.js';
import { OWNER_GARAGE, OWNER_LANE, PARKING_KEEP_OUT } from './hotel-parking.js';
import { HIGHWAY_HALF, RING } from './highway.js';
import { hotelPlaces } from './hotel-places.js';

const overlap = (a, b) => a[0] < b[2] - 1e-9 && a[2] > b[0] + 1e-9 && a[1] < b[3] - 1e-9 && a[3] > b[1] + 1e-9;
const toRect = (c) => [c.minX, c.minZ, c.maxX, c.maxZ];
const insideRect = (r, outer) => r[0] >= outer[0] - 1e-9 && r[1] >= outer[1] - 1e-9 && r[2] <= outer[2] + 1e-9 && r[3] <= outer[3] + 1e-9;
const world = getHotelWorld();

test('lagoon: berada di dalam tapak dan jalan Lingkar, tidak menimpa menara, halaman, parkir, atau Royal Garage', () => {
  assert.ok(LAGOON_RECT[0] >= HOTEL_SITE.minX && LAGOON_RECT[2] <= HOTEL_SITE.maxX && LAGOON_RECT[1] >= HOTEL_SITE.minZ && LAGOON_RECT[3] <= HOTEL_SITE.maxZ, 'di dalam tapak');
  assert.ok(LAGOON_RECT[2] < RING.maxX - HIGHWAY_HALF && LAGOON_RECT[3] < RING.maxZ - HIGHWAY_HALF, 'di dalam tepi dalam jalan Lingkar');
  assert.ok(!overlap(LAGOON_RECT, HOTEL_BUILDING), 'bukan di atas menara');
  assert.ok(LAGOON_RECT[0] - HOTEL_BUILDING[2] >= 3, 'ada jalan setapak di antara menara dan taman');
  assert.ok(!overlap(LAGOON_RECT, HOTEL_FORECOURT));
  for (const r of PARKING_KEEP_OUT) assert.ok(!overlap(LAGOON_RECT, r), `tidak menimpa parkir ${r}`);
  assert.ok(LAGOON_RECT[1] - OWNER_GARAGE[3] >= 3, 'ada jarak dari Royal Garage');
  assert.ok(!overlap(LAGOON_RECT, OWNER_LANE));
});

test('lagoon: kolam, dermaga, tebing, dan air terjun saling cocok', () => {
  const pool = LAGOON_POOL.rect;
  assert.ok(insideRect(pool, LAGOON_RECT));
  assert.equal(LAGOON_POOL.x, (pool[0] + pool[2]) / 2);
  assert.equal(LAGOON_POOL.z, (pool[1] + pool[3]) / 2);
  assert.equal(LAGOON_POOL.width, pool[2] - pool[0]);
  assert.equal(LAGOON_POOL.depth, pool[3] - pool[1]);
  assert.equal(CLIFF.faceX, pool[2], 'kaki tebing tepat di tepi timur kolam');
  assert.ok(CLIFF.backX <= LAGOON_RECT[2]);
  assert.ok(PIER.x0 < pool[0] && PIER.x1 < CLIFF.faceX, 'dermaga mulai dari dek dan berhenti sebelum tebing');
  assert.ok(PIER.x1 === PIER.platform[2]);
  for (const f of FALLS) {
    const seg = CLIFF.profile.find(([z0, z1]) => f.z > z0 && f.z < z1);
    assert.ok(seg, `${f.id}: jatuh dari tebing`);
    assert.equal(f.top, seg[2], `${f.id}: bibir air = tinggi tebing`);
    assert.ok(f.z - f.width / 2 >= seg[0] && f.z + f.width / 2 <= seg[1], `${f.id}: lebar air di dalam jalurnya`);
    assert.ok(f.landX > pool[0] && f.landX < pool[2] && f.z > pool[1] && f.z < pool[3], `${f.id}: mendarat di kolam`);
    assert.ok(f.bottom === LAGOON_POOL.waterY);
  }
  assert.equal(Math.max(...CLIFF.profile.map((p) => p[2])), CLIFF_TOP);
  // profil menutup tebing tanpa celah
  for (let i = 1; i < CLIFF.profile.length; i++) assert.equal(CLIFF.profile[i][0], CLIFF.profile[i - 1][1]);
  assert.ok(CLIFF.profile[0][0] >= LAGOON_RECT[1] && CLIFF.profile.at(-1)[1] <= pool[3]);
});

test('lagoon: seluruh air kolam tertutup penghalang kecuali dermaga dan peron', () => {
  const [x0, z0, x1, z1] = LAGOON_POOL.rect;
  let cells = 0;
  for (let x = x0 + 0.125; x < x1; x += 0.25) {
    for (let z = z0 + 0.125; z < z1; z += 0.25) {
      const blocked = WATER_BLOCKS.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
      assert.equal(blocked, !onPier(x, z), `(${x}, ${z})`);
      assert.equal(inPoolWater(x, z), !onPier(x, z));
      cells++;
    }
  }
  assert.ok(cells > 10000);
  for (const r of PIER_WALK) assert.ok(insideRect(r, LAGOON_POOL.rect));
});

test('lagoon: semua benda berada di dalam taman, tidak saling menimpa, dan jalur dermaga tetap lapang', () => {
  for (const c of LAGOON_COLLIDERS) assert.ok(insideRect(toRect(c), LAGOON_RECT), `tabrakan ${JSON.stringify(c)}`);
  for (const l of LOUNGERS) assert.ok(insideRect(loungerRect(l), LAGOON_RECT));
  for (const c of CABANAS) assert.ok(insideRect([c.x - c.half, c.z - c.half, c.x + c.half, c.z + c.half], LAGOON_RECT));
  for (const p of [...PALMS, ...PARASOLS]) assert.ok(p.x >= LAGOON_RECT[0] && p.x <= LAGOON_RECT[2] && p.z >= LAGOON_RECT[1] && p.z <= LAGOON_RECT[3]);
  for (const r of lagoonRocks()) assert.ok(r.x >= LAGOON_RECT[0] && r.x <= LAGOON_RECT[2] && r.z >= LAGOON_RECT[1] && r.z <= LAGOON_RECT[3], 'batu di dalam taman');
  for (const b of cliffBlocks()) assert.ok(b.minX >= CLIFF.faceX - 0.7 && b.maxX <= CLIFF.backX && b.minZ >= CLIFF.profile[0][0] && b.maxZ <= CLIFF.profile.at(-1)[1]);
  // kursi, kabana, papan tidak menimpa kolam (termasuk tepinya) dan tidak saling menimpa
  const pool = LAGOON_POOL.rect;
  const grown = [pool[0] - 0.8, pool[1] - 0.8, pool[2] + 0.8, pool[3] + 0.8];
  const items = [
    ...LOUNGERS.map((l, i) => ({ id: `kursi ${i}`, r: loungerRect(l) })),
    ...CABANAS.map((c, i) => ({ id: `kabana ${i}`, r: [c.x - c.half, c.z - c.half, c.x + c.half, c.z + c.half] })),
    { id: 'papan', r: [SIGN.x - 0.3, SIGN.z - SIGN.width / 2, SIGN.x + 0.3, SIGN.z + SIGN.width / 2] },
  ];
  for (const it of items) assert.ok(!overlap(it.r, grown), `${it.id} tidak menimpa kolam`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) assert.ok(!overlap(items[i].r, items[j].r), `${items[i].id} menimpa ${items[j].id}`);
  // jalur dari tepi barat ke ujung peron lapang dari semua penghalang selain penutup air di sekitar peron
  const lane = [LAGOON_RECT[0], PIER.z0 + 0.1, PIER.platform[0], PIER.z1 - 0.1];
  for (const c of LAGOON_COLLIDERS) assert.ok(!overlap(toRect(c), lane), `jalur dermaga tertutup ${JSON.stringify(c)}`);
  for (const c of PLANTERS) assert.ok(c[1] < LAGOON_POOL.rect[1] || c[1] > LAGOON_POOL.rect[3]);
  for (const [x, z] of DECK_ROCKS) assert.ok(!inPoolWater(x, z));
  for (const c of CABANAS) for (const k of cabanaColliders(c)) assert.ok(insideRect(toRect(k), [c.x - c.half, c.z - c.half, c.x + c.half, c.z + c.half]));
});

test('lagoon: batu dan tebing deterministik', () => {
  assert.deepEqual(lagoonRocks(), lagoonRocks());
  assert.equal(cliffBlocks().length, cliffBlocks().length);
  assert.ok(lagoonRocks().length >= 20);
  assert.ok(CLIFF_COLLIDERS.length === CLIFF.profile.length);
});

test('lagoon: dunia hotel memasang zona, menghalangi air dan tebing, dan dermaga bisa dijalani sampai ujung peron', () => {
  assert.equal(roomAt(LAGOON_VIEW.x, LAGOON_VIEW.z, 0).id, 'hotel_lagoon');
  assert.equal(roomAt(LAGOON_VIEW.x, LAGOON_VIEW.z, 0).name, 'Taman Air Terjun & Kolam Lagoon');
  assert.ok(onPier(LAGOON_VIEW.x, LAGOON_VIEW.z));
  assert.ok(world.canStand(0, LAGOON_VIEW.x, LAGOON_VIEW.z), 'titik Jelajah bisa diinjak');
  assert.ok(world.canStand(0, 92, 535), 'dek di depan dermaga');
  assert.ok(!world.canStand(0, 119, 520), 'air kolam');
  assert.ok(!world.canStand(0, 143, 535), 'di dalam tebing');
  assert.ok(!world.canStand(0, 96.8, 521), 'kursi berjemur');
  const spot = hotelPlaces(world).find((p) => p.id === 'hotel_lagoon');
  assert.ok(spot && spot.level === 0 && spot.group === 'Halaman & parkir');
  // berjalan dari tepi barat taman ke arah timur sepanjang dermaga: sampai ujung peron, tidak jatuh ke air, tidak menembus tebing
  let pos = { x: LAGOON_RECT[0] + 1, z: 535, level: 0 };
  for (let i = 0; i < 700; i++) pos = world.move(pos, 0.1, 0);
  assert.ok(pos.x > PIER.x1 - 1 && pos.x < CLIFF.faceX - 0.3, `berhenti di ujung peron, x=${pos.x}`);
  // mencoba melangkah ke air dari dermaga: tertahan di tepi dermaga
  let side = { x: 110, z: 535, level: 0 };
  for (let i = 0; i < 100; i++) side = world.move(side, 0, -0.1);
  assert.ok(side.z >= PIER.z0 + 0.3, `tidak masuk ke air, z=${side.z}`);
  // dari dek utara ke kolam: tepi kolam menahan
  let north = { x: 120, z: 510.2, level: 0 };
  for (let i = 0; i < 60; i++) north = world.move(north, 0, 0.1);
  assert.ok(north.z < LAGOON_POOL.rect[1], `tidak masuk ke kolam, z=${north.z}`);
});

test('lagoon: volume suara air terjun turun menurut jarak, hening jauh, redam di dalam ruangan', () => {
  assert.equal(waterfallGain(0), waterfallGain(8));
  assert.ok(waterfallGain(20) < waterfallGain(8));
  assert.ok(waterfallGain(60) < waterfallGain(20));
  assert.equal(waterfallGain(120), 0);
  assert.equal(waterfallGain(500), 0);
  assert.equal(waterfallGain(Infinity), 0);
  assert.equal(waterfallGain(NaN), 0);
  const main = SOUND_SOURCES.find((s) => s.id === 'main');
  const near = loudestSource(main.x - 3, main.z);
  assert.equal(near.source.id, 'main');
  assert.ok(near.gain > loudestSource(main.x - 60, main.z).gain);
  const base = { x: main.x - 6, z: main.z };
  assert.ok(lagoonSoundLevel(base).gain > 0.1);
  assert.equal(lagoonSoundLevel({ ...base, active: false }).gain, 0);
  assert.ok(lagoonSoundLevel({ ...base, indoor: 1 }).gain < lagoonSoundLevel(base).gain * 0.2);
  assert.ok(lagoonSoundLevel({ ...base, cabin: true }).gain < lagoonSoundLevel(base).gain);
  assert.equal(lagoonSoundLevel({ x: 0, z: 400 }).gain, 0, 'di halaman drop-off tidak terdengar');
  // air terjun utama tetap yang paling keras bahkan di dekat air terjun kecil (bobotnya lebih besar)
  const north = SOUND_SOURCES.find((s) => s.id === 'north');
  assert.equal(loudestSource(north.x - 2, north.z).source.id, 'main');
  assert.ok(loudestSource(north.x - 2, north.z).gain > 0);
});

test('lagoon: panning stereo mengikuti arah pandang', () => {
  const src = { x: 136, z: 535 };
  const at = { x: 110, z: 535 };
  assert.ok(soundPan({ ...at, fx: 0, fz: -1 }, src) > 0.9, 'menghadap utara: air di kanan');
  assert.ok(soundPan({ ...at, fx: 0, fz: 1 }, src) < -0.9, 'menghadap selatan: air di kiri');
  assert.ok(Math.abs(soundPan({ ...at, fx: 1, fz: 0 }, src)) < 1e-9, 'menghadap sumber: di tengah');
  assert.ok(Math.abs(soundPan({ x: 135.5, z: 535, fx: 0, fz: -1 }, src)) < 0.1, 'sangat dekat: kembali ke tengah');
  assert.equal(soundPan({ ...at, fx: 0, fz: 0 }, src), 0);
});
