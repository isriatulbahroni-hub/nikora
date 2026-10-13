import test from 'node:test';
import assert from 'node:assert/strict';
import { takeRoleKey } from './role-key.js';

const KEY = 'owner-' + 'A'.repeat(24);
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
};

test('takeRoleKey: kunci di URL disimpan untuk sesi dan dihapus dari URL, parameter lain dipertahankan', () => {
  const storage = memory();
  let replaced = null;
  const key = takeRoleKey({ search: `?e=acara-a&key=${KEY}&to=Budi`, storage, replaceSearch: (s) => { replaced = s; } });
  assert.equal(key, KEY);
  assert.equal(replaced, '?e=acara-a&to=Budi');
  assert.equal(storage.getItem('orbit-role-key'), KEY);
  // muat ulang tanpa ?key= tetap memakai kunci sesi
  assert.equal(takeRoleKey({ search: '?e=acara-a', storage }), KEY);
});

test('takeRoleKey: format salah diabaikan, tanpa kunci mengembalikan kosong, penyimpanan rusak tidak melempar', () => {
  const storage = memory();
  assert.equal(takeRoleKey({ search: '?key=owner-pendek', storage, replaceSearch: () => {} }), '');
  assert.equal(takeRoleKey({ search: '?key=admin-' + 'A'.repeat(24), storage, replaceSearch: () => {} }), '');
  assert.equal(takeRoleKey({ search: '', storage }), '');
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(takeRoleKey({ search: `?key=${KEY}`, storage: broken, replaceSearch: () => {} }), KEY);
  assert.equal(takeRoleKey({ search: '', storage: broken }), '');
});
