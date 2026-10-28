import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HumanRig, buildClip, readRest } from './avatar-human.js';
import { EXTRA_CLIPS, loadExtraNeutral, pickClip } from './avatar-extra-anims.js';
import { STICKERS } from './emoji-sticker-system.js';

function miniRig() {
  const root = new THREE.Group();
  const character = new THREE.Group();
  character.scale.setScalar(0.01);
  const mk = (name, pos) => { const b = new THREE.Bone(); b.name = name; b.position.set(...pos); return b; };
  const hips = mk('mixamorigHips', [0, 100, 0]);
  const spine = mk('mixamorigSpine', [0, 10, 0]);
  hips.add(spine); character.add(hips); root.add(character);
  return root;
}
const NEUTRAL = { duration: 1, fps: 2, times: [0, 0.5, 1], bones: { Hips: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, hips: null };
function makeRig() {
  const holder = new THREE.Group();
  holder.add(miniRig());
  const rest = readRest(holder);
  return new HumanRig({ holder, rest, clips: { idle: buildClip('idle', NEUTRAL, rest) } });
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const withFetch = async (impl, fn) => {
  const prev = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return impl(String(url)); };
  try { await fn(calls); } finally { globalThis.fetch = prev; }
};
const ok = (json) => ({ ok: true, json: async () => json });
const missing = () => ({ ok: false, status: 404, json: async () => { throw new Error('404'); } });

test('katalog klip tambahan: id unik berformat aman dan penanda loop berupa boolean', () => {
  const ids = Object.keys(EXTRA_CLIPS);
  assert.ok(ids.length >= 40);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9_]+$/, id);
    assert.equal(typeof EXTRA_CLIPS[id], 'boolean', id);
  }
});

test('pickClip: id tunggal, daftar (acak), dan kosong', () => {
  assert.equal(pickClip('clap'), 'clap');
  assert.equal(pickClip(['a', 'b', 'c'], () => 0.99), 'c');
  assert.equal(pickClip(['a', 'b', 'c'], () => 0), 'a');
  assert.equal(pickClip([]), null);
  assert.equal(pickClip(undefined), null);
});

test('stiker: setiap klip yang dirujuk ada di katalog klip tambahan', () => {
  let dipakai = 0;
  for (const s of STICKERS) {
    if (s.clip === undefined) continue;
    for (const id of [].concat(s.clip)) { assert.ok(Object.hasOwn(EXTRA_CLIPS, id), `${s.id}: klip ${id}`); dipakai += 1; }
  }
  assert.ok(dipakai >= 8);
});

test('loadExtraNeutral: id tak dikenal tidak memanggil fetch; berkas ada diambil sekali; berkas hilang jadi null', async () => {
  await withFetch((url) => (url.endsWith('/talk1.json') ? ok(NEUTRAL) : missing()), async (calls) => {
    assert.equal(await loadExtraNeutral('constructor'), null);
    assert.equal(await loadExtraNeutral('tidak-ada'), null);
    assert.equal(calls.length, 0);
    assert.deepEqual(await loadExtraNeutral('talk1'), NEUTRAL);
    await loadExtraNeutral('talk1');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith('anims/extra/talk1.json'));
    assert.equal(await loadExtraNeutral('talk2'), null);
  });
});

test('HumanRig: klip paksa dimuat lalu diputar; selama belum siap tetap memakai animasi lama', async () => {
  await withFetch(() => ok(NEUTRAL), async (calls) => {
    const rig = makeRig();
    rig.forcedClip = 'laugh';
    rig.update(null, 0, 1 / 60);
    assert.equal(rig.current, 'idle', 'belum siap: tetap diam');
    await flush();
    rig.update(null, 0.02, 1 / 60);
    assert.equal(rig.current, 'laugh');
    assert.equal(calls.length, 1);
    rig.forcedClip = null;
    rig.update(null, 0.04, 1 / 60);
    assert.equal(rig.current, 'idle', 'stiker selesai: kembali diam');
    rig.dispose();
  });
});

test('HumanRig: klip sekali (loop false) diputar LoopOnce dan menahan pose akhir', async () => {
  await withFetch(() => ok(NEUTRAL), async () => {
    const rig = makeRig();
    rig.forcedClip = 'wave2';
    rig.update(null, 0, 1 / 60);
    await flush();
    rig.update(null, 0.02, 1 / 60);
    assert.equal(rig.actions.wave2.loop, THREE.LoopOnce);
    assert.equal(rig.actions.wave2.clampWhenFinished, true);
  });
});

test('HumanRig: klip paksa diabaikan saat berjalan atau duduk, dan berkas hilang tidak diulang', async () => {
  await withFetch(() => missing(), async (calls) => {
    const rig = makeRig();
    rig.forcedClip = 'cry';
    rig.update('walk', 0, 1 / 60);
    rig.update(null, 0, 1 / 60, true);
    // klip duduk (sit_down/sit_idle/stand_up) memang dimuat saat duduk; yang dihitung hanya klip paksa 'cry'
    const cry = () => calls.filter((u) => u.includes('cry'));
    assert.equal(cry().length, 0, 'berjalan/duduk: klip paksa tidak perlu dimuat');
    for (let i = 0; i < 5; i += 1) { rig.update(null, i / 60, 1 / 60); await flush(); }
    assert.equal(rig.current, 'idle');
    assert.equal(cry().length, 1, 'berkas hilang hanya dicoba sekali');
  });
});

test('HumanRig: klip yang sudah dimuat satu rig dipakai ulang oleh rig lain dari model yang sama', async () => {
  await withFetch(() => ok(NEUTRAL), async (calls) => {
    const holder = new THREE.Group();
    holder.add(miniRig());
    const rest = readRest(holder);
    const model = { holder, rest, clips: { idle: buildClip('idle', NEUTRAL, rest) } };
    const a = new HumanRig(model);
    a.forcedClip = 'sad';
    a.update(null, 0, 1 / 60);
    await flush();
    const b = new HumanRig(model);
    assert.ok(b.actions.sad, 'rig baru langsung memiliki klip yang sudah dimuat');
    assert.equal(calls.length, 1);
  });
});
