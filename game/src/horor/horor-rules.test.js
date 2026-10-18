import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRE_COOLDOWN, GUNSHOT_NOISE, addItem, countItem, createInventory, createPlayer, createWeapon, damagePlayer, fireWeapon,
  freeSlots, hasItem, itemDef, reloadWeapon, removeItem, tickWeapon, useHeal,
} from './horor-rules.js';

test('itemDef: item tetap, kunci/berkas dinamis, dan id ngawur ditolak', () => {
  assert.equal(itemDef('ammo').stack, 24);
  assert.equal(itemDef('kunci:gudang').kind, 'key');
  assert.equal(itemDef('berkas:catatan-1').kind, 'file');
  assert.equal(itemDef('kunci:'), null);
  assert.equal(itemDef('tidak-ada'), null);
  assert.equal(itemDef(undefined), null);
});

test('addItem: menumpuk sampai batas stack lalu pindah slot baru', () => {
  const inv = createInventory(4);
  assert.deepEqual(addItem(inv, 'ammo', 30), { added: 30, left: 0 });
  assert.deepEqual(inv.items, [{ id: 'ammo', qty: 24 }, { id: 'ammo', qty: 6 }]);
  assert.deepEqual(addItem(inv, 'ammo', 10), { added: 10, left: 0 });
  assert.deepEqual(inv.items, [{ id: 'ammo', qty: 24 }, { id: 'ammo', qty: 16 }]);
  assert.equal(countItem(inv, 'ammo'), 40);
});

test('addItem: inventori penuh menyisakan jumlah yang tidak muat', () => {
  const inv = createInventory(2);
  assert.deepEqual(addItem(inv, 'kunci:a'), { added: 1, left: 0 });
  assert.deepEqual(addItem(inv, 'kunci:b'), { added: 1, left: 0 });
  assert.equal(freeSlots(inv), 0);
  assert.deepEqual(addItem(inv, 'kunci:c'), { added: 0, left: 1 });
  assert.deepEqual(addItem(inv, 'ammo', 5), { added: 0, left: 5 });
  assert.equal(hasItem(inv, 'kunci:c'), false);
});

test('addItem: jumlah dan id tidak valid tidak mengubah inventori', () => {
  const inv = createInventory();
  for (const bad of [0, -3, 1.5, NaN]) assert.equal(addItem(inv, 'ammo', bad).added, 0);
  assert.equal(addItem(inv, 'tidak-ada', 1).added, 0);
  assert.deepEqual(inv.items, []);
});

test('removeItem: semua-atau-tidak-sama-sekali dan slot kosong dibuang', () => {
  const inv = createInventory();
  addItem(inv, 'ammo', 30);
  assert.equal(removeItem(inv, 'ammo', 31), false);
  assert.equal(countItem(inv, 'ammo'), 30);
  assert.equal(removeItem(inv, 'ammo', 7), true);
  assert.equal(countItem(inv, 'ammo'), 23);
  assert.equal(removeItem(inv, 'ammo', 23), true);
  assert.deepEqual(inv.items, []);
  assert.equal(removeItem(inv, 'ammo', 0), false);
});

test('useHeal: menyembuhkan sampai batas, memakai satu tonik, dan menolak bila nyawa penuh', () => {
  const inv = createInventory();
  const p = createPlayer({ hp: 50 });
  addItem(inv, 'tonik', 2);
  assert.deepEqual(useHeal(inv, p), { ok: true, healed: 35 });
  assert.equal(p.hp, 85);
  assert.deepEqual(useHeal(inv, p), { ok: true, healed: 15 }); // dibatasi maxHp
  assert.equal(p.hp, 100);
  assert.equal(countItem(inv, 'tonik'), 0);
  addItem(inv, 'tonik', 1);
  assert.deepEqual(useHeal(inv, p), { ok: false, healed: 0 }); // nyawa penuh: tonik tidak terbuang
  assert.equal(countItem(inv, 'tonik'), 1);
});

test('useHeal: tidak bisa tanpa tonik, untuk item lain, atau saat mati', () => {
  const inv = createInventory();
  const p = createPlayer({ hp: 10 });
  assert.equal(useHeal(inv, p).ok, false);
  addItem(inv, 'ammo', 3);
  assert.equal(useHeal(inv, p, 'ammo').ok, false);
  addItem(inv, 'tonik');
  damagePlayer(p, 999);
  assert.equal(useHeal(inv, p).ok, false);
  assert.equal(p.hp, 0);
});

test('damagePlayer: nyawa tidak negatif, mati di 0, kerusakan tidak valid diabaikan', () => {
  const p = createPlayer();
  assert.deepEqual(damagePlayer(p, 30), { dead: false });
  assert.equal(p.hp, 70);
  damagePlayer(p, -10);
  damagePlayer(p, 0);
  assert.equal(p.hp, 70);
  assert.deepEqual(damagePlayer(p, 500), { dead: true });
  assert.equal(p.hp, 0);
});

test('fireWeapon: menembak mengurangi peluru, ada jeda, dan magasin kosong hanya klik', () => {
  const w = createWeapon(2);
  const a = fireWeapon(w);
  assert.deepEqual(a, { fired: true, noise: GUNSHOT_NOISE });
  assert.equal(w.mag, 1);
  assert.equal(fireWeapon(w).fired, false); // masih jeda
  assert.equal(w.mag, 1);
  tickWeapon(w, FIRE_COOLDOWN);
  assert.equal(fireWeapon(w).fired, true);
  tickWeapon(w, FIRE_COOLDOWN);
  const empty = fireWeapon(w);
  assert.equal(empty.fired, false);
  assert.equal(empty.empty, true);
  assert.ok(empty.noise < GUNSHOT_NOISE);
  assert.equal(w.mag, 0);
});

test('reloadWeapon: memakai peluru dari inventori sebatas yang ada dan yang dibutuhkan', () => {
  const inv = createInventory();
  const w = createWeapon(8);
  w.mag = 3;
  addItem(inv, 'ammo', 3);
  assert.equal(reloadWeapon(w, inv), 3);
  assert.equal(w.mag, 6);
  assert.equal(countItem(inv, 'ammo'), 0);
  assert.equal(reloadWeapon(w, inv), 0); // tidak ada peluru
  addItem(inv, 'ammo', 20);
  assert.equal(reloadWeapon(w, inv), 2); // hanya sebanyak yang muat
  assert.equal(w.mag, 8);
  assert.equal(countItem(inv, 'ammo'), 18);
  assert.equal(reloadWeapon(w, inv), 0); // magasin penuh
});
