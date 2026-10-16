import test from 'node:test';
import assert from 'node:assert/strict';
import { getVillaWorld } from './villa-layout.js';
import { placeTvs, nearestTv, classifyMedia, TV_RANGE, TV_SIZE } from './room-tv.js';

const world = getVillaWorld();
const tvs = placeTvs(world);

test('setiap ruangan (kecuali lorong, teras, tangga, aula) punya satu TV di dalam ruangannya', () => {
  const skip = new Set(['stair', 'terrace', 'corridor', 'hall']);
  const expected = world.levels.flatMap((L) => L.rooms.filter((r) => !skip.has(r.kind)).map((r) => `${r.id}@${L.level}`));
  assert.ok(expected.length > 20);
  const got = tvs.map((t) => `${t.room}@${t.level}`);
  for (const e of expected) assert.ok(got.includes(e), `TV untuk ${e}`);
  assert.equal(new Set(tvs.map((t) => t.id + t.level)).size, tvs.length);
  for (const t of tvs) {
    const [x1, z1, x2, z2] = t.rect;
    assert.ok(t.x >= x1 && t.x <= x2 && t.z >= z1 && t.z <= z2, `${t.id} di dalam ruangannya`);
    assert.equal(Math.abs(t.nx) + Math.abs(t.nz), 1);
  }
});

test('TV tidak menutupi pintu', () => {
  for (const t of tvs) {
    const L = world.levels[t.level];
    for (const d of L.doors) {
      const dx = Math.abs(d.x - t.x);
      const dz = Math.abs(d.z - t.z);
      const clear = d.orient === 'h' ? !(dz < 0.5 && dx < d.width / 2 + TV_SIZE.width / 2) : !(dx < 0.5 && dz < d.width / 2 + TV_SIZE.width / 2);
      assert.ok(clear, `${t.id} menutupi pintu (${d.x},${d.z})`);
    }
  }
});

test('TV kamar tamu berada di dinding yang jauh dari tempat tidur', () => {
  const g1 = tvs.find((t) => t.room === 'guest_1' && t.level === 0);
  const bed = world.levels[0].props.find((p) => p.type === 'bed' && p.x > 16 && p.x < 21.5 && p.z < 12);
  assert.ok(g1 && bed);
  assert.ok(Math.hypot(g1.x - bed.x, g1.z - bed.z) > 2.5);
});

test('nearestTv: hanya di ruangan dan lantai yang sama, dalam jangkauan', () => {
  const t = tvs.find((x) => x.room === 'guest_1' && x.level === 0);
  const me = { x: t.x + t.nx * 1.5, z: t.z + t.nz * 1.5, level: 0, stair: null };
  assert.equal(nearestTv(tvs, me)?.id, t.id);
  assert.equal(nearestTv(tvs, { ...me, level: 1 })?.room === 'guest_1', false, 'beda lantai bukan TV lantai 0');
  assert.equal(nearestTv(tvs, { ...me, stair: 'x' }), null);
  assert.equal(nearestTv(tvs, { x: 0, z: 37, level: 0, stair: null }), null, 'di luar ruangan');
  assert.ok(TV_RANGE > 2);
});

test('classifyMedia: YouTube, TikTok, video langsung, file lain, kosong', () => {
  const yt = classifyMedia('https://youtu.be/dQw4w9WgXcQ?t=30');
  assert.deepEqual([yt.kind, yt.provider], ['embed', 'youtube']);
  assert.ok(yt.src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  assert.equal(new URL(yt.src).searchParams.get('controls'), '1');
  assert.equal(classifyMedia('https://www.tiktok.com/@a/video/7234567890123456789').provider, 'tiktok');
  assert.equal(classifyMedia('https://vm.tiktok.com/ZMabc/').reason, 'tiktok-short');
  assert.deepEqual(classifyMedia('https://contoh.com/film/klip.mp4?x=1'), { kind: 'video', src: 'https://contoh.com/film/klip.mp4?x=1' });
  assert.equal(classifyMedia('http://contoh.com/klip.mp4').kind, 'unsupported', 'http polos ditolak');
  assert.equal(classifyMedia('https://contoh.com/halaman').reason, 'format');
  assert.equal(classifyMedia('  ').kind, 'none');
  assert.equal(classifyMedia('javascript:alert(1)').kind, 'unsupported');
});
