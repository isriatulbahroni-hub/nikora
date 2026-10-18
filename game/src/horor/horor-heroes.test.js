import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HERO_ID, heroPath, heroesFromFiles, loadHeroChoice, loadHeroList, resolveHeroId, sanitizeHeroList, saveHeroChoice, titleFromId } from './horor-heroes.js';

const DEFAULT_LIST = [{ id: 'hero', name: 'Hero', file: 'hero.glb' }];

test('titleFromId: tanda hubung dan garis bawah jadi spasi, tiap kata berhuruf besar', () => {
  assert.equal(titleFromId('kirana-merah'), 'Kirana Merah');
  assert.equal(titleFromId('hero'), 'Hero');
  assert.equal(titleFromId('a_satu'), 'A Satu');
});

test('heroesFromFiles: hanya .glb, id kembar dibuang, hero bawaan di depan, sisanya urut abjad', () => {
  const list = heroesFromFiles(['b.glb', 'hero.glb', 'README.md', 'A_Satu.GLB', '.gitkeep', 'heroes.json', 'hero.glb']);
  assert.deepEqual(list, [
    { id: 'hero', name: 'Hero', file: 'hero.glb' },
    { id: 'a-satu', name: 'A Satu', file: 'A_Satu.GLB' },
    { id: 'b', name: 'B', file: 'b.glb' },
  ]);
  assert.deepEqual(heroesFromFiles(undefined), []);
  assert.deepEqual(heroesFromFiles(['.gitkeep']), []);
});

test('sanitizeHeroList: data ngawur dibuang, kosong jatuh ke hero bawaan', () => {
  assert.deepEqual(sanitizeHeroList('x'), DEFAULT_LIST);
  assert.deepEqual(sanitizeHeroList(null), DEFAULT_LIST);
  assert.deepEqual(sanitizeHeroList([]), DEFAULT_LIST);
  const list = sanitizeHeroList([
    { id: 'Bad Id', file: 'a.glb' },
    { id: 'ok', name: 'Oke', file: 'ok.glb' },
    { id: 'ok', file: 'dup.glb' },
    { id: 'x', file: '../x.glb' },
    { id: 'y', file: 'y.png' },
    null,
  ]);
  assert.deepEqual(list, [{ id: 'ok', name: 'Oke', file: 'ok.glb' }]);
  assert.equal(sanitizeHeroList([{ id: 'kirana-merah', file: 'k.glb' }])[0].name, 'Kirana Merah');
});

test('resolveHeroId: pilihan valid dipakai, yang tidak dikenal jatuh ke hero bawaan lalu yang pertama', () => {
  const list = [{ id: 'hero', name: 'Hero', file: 'hero.glb' }, { id: 'kirana', name: 'Kirana', file: 'kirana.glb' }];
  assert.equal(resolveHeroId(list, 'kirana'), 'kirana');
  assert.equal(resolveHeroId(list, 'hilang'), DEFAULT_HERO_ID);
  assert.equal(resolveHeroId(list, null), DEFAULT_HERO_ID);
  assert.equal(resolveHeroId([{ id: 'kirana', name: 'Kirana', file: 'kirana.glb' }], 'hilang'), 'kirana');
});

test('heroPath: relatif terhadap folder horor', () => {
  assert.equal(heroPath({ file: 'kirana.glb' }), 'models/horor/kirana.glb');
});

test('loadHeroChoice/saveHeroChoice: bolak-balik, dan tahan penyimpanan hilang atau error', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadHeroChoice(storage), null);
  saveHeroChoice(storage, 'kirana');
  assert.equal(loadHeroChoice(storage), 'kirana');
  assert.equal(loadHeroChoice(undefined), null);
  assert.doesNotThrow(() => saveHeroChoice(undefined, 'x'));
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(loadHeroChoice(broken), null);
  assert.doesNotThrow(() => saveHeroChoice(broken, 'x'));
});

test('loadHeroList: membaca heroes.json; gagal, bukan ok, atau rusak jatuh ke hero bawaan', async () => {
  const ok = async () => ({ ok: true, json: async () => [{ id: 'kirana', file: 'kirana.glb' }] });
  assert.deepEqual(await loadHeroList({ fetchFn: ok }), [{ id: 'kirana', name: 'Kirana', file: 'kirana.glb' }]);
  const calls = [];
  await loadHeroList({ fetchFn: async (url) => { calls.push(url); return { ok: true, json: async () => [] }; }, base: '/app/' });
  assert.deepEqual(calls, ['/app/models/horor/heroes.json']);
  assert.deepEqual(await loadHeroList({ fetchFn: async () => ({ ok: false, status: 404 }) }), DEFAULT_LIST);
  assert.deepEqual(await loadHeroList({ fetchFn: async () => { throw new Error('offline'); } }), DEFAULT_LIST);
  assert.deepEqual(await loadHeroList({ fetchFn: async () => ({ ok: true, json: async () => { throw new Error('bukan json'); } }) }), DEFAULT_LIST);
  assert.deepEqual(await loadHeroList({ fetchFn: undefined }), DEFAULT_LIST);
});
