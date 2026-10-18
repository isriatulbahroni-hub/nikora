import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESSORIES, HAIR_STYLES, OUTFITS, configFromId, defaultConfig, loadConfig, randomConfig, sameConfig, sanitizeConfig, saveConfig, toWire } from './avatar-config.js';
import { applyPose, auraSpecFor, createAvatar, setAurasVisible, setAvatarAura, setAvatarConfig } from './avatar.js';

test('sanitizeConfig: nilai ngawur dari jaringan diganti default, array dan objek diterima', () => {
  assert.deepEqual(sanitizeConfig([99, -1, 1.5, 'x', null]), defaultConfig());
  assert.deepEqual(sanitizeConfig(null), defaultConfig());
  assert.deepEqual(sanitizeConfig('string'), defaultConfig());
  assert.deepEqual(sanitizeConfig({ o: 3, s: 2, h: 5, k: 4, a: 6, m: 1 }), { o: 3, s: 2, h: 5, k: 4, a: 6, m: 1 });
  assert.ok(sameConfig(sanitizeConfig(toWire({ o: 11, s: 5, h: 5, k: 11, a: 6, m: 1 })), { o: 11, s: 5, h: 5, k: 11, a: 6, m: 1 }));
  // klien lama mengirim 5 angka: karakter jatuh ke avatar sederhana; karakter di luar jangkauan juga
  assert.equal(sanitizeConfig([1, 1, 1, 1, 1]).m, 0);
  assert.equal(sanitizeConfig([1, 1, 1, 1, 1, 99]).m, 0);
});

test('configFromId deterministik dan randomConfig selalu valid', () => {
  assert.deepEqual(configFromId('abc'), configFromId('abc'));
  assert.notDeepEqual(configFromId('abc'), configFromId('abd'));
  for (let i = 0; i < 200; i += 1) {
    const cfg = randomConfig();
    assert.deepEqual(sanitizeConfig(cfg), cfg);
  }
  assert.equal(randomConfig(() => 0.999999).o, OUTFITS.length - 1);
});

test('loadConfig/saveConfig: bolak-balik, dan tahan data rusak atau penyimpanan hilang', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveConfig(storage, { o: 4, s: 3, h: 2, k: 1, a: 5, m: 1 });
  assert.deepEqual(loadConfig(storage), { o: 4, s: 3, h: 2, k: 1, a: 5, m: 1 });
  store.set('orbit-avatar', '{rusak');
  assert.deepEqual(loadConfig(storage), defaultConfig());
  assert.deepEqual(loadConfig(undefined), defaultConfig());
  assert.doesNotThrow(() => saveConfig(undefined, defaultConfig()));
});

test('createAvatar/setAvatarConfig: semua gaya rambut dan aksesori terbentuk tanpa error dan bisa diganti berulang', () => {
  const avatar = createAvatar({ config: defaultConfig() });
  for (let h = 0; h < HAIR_STYLES.length; h += 1) {
    for (let a = 0; a < ACCESSORIES.length; a += 1) {
      setAvatarConfig(avatar, { o: 1, s: 2, h, k: 3, a, m: 0 });
      assert.deepEqual(avatar.userData.config, { o: 1, s: 2, h, k: 3, a, m: 0 });
    }
  }
  assert.equal(avatar.userData.headPivot.children.filter((c) => c === avatar.userData.gear).length, 1); // tidak menumpuk (gear ikut pivot kepala)
  assert.equal(avatar.userData.skin.color.getHex(), 0xc99468);
  assert.equal(avatar.userData.tint[0].color.getHex(), OUTFITS[1].hex);
});

test('gestur spin memutar pivot tubuh (bukan grup) dan kembali ke 0 setelah selesai', () => {
  const avatar = createAvatar({ config: defaultConfig() });
  applyPose(avatar, 'spin', 0.3, 1 / 60);
  assert.ok(Math.abs(avatar.userData.pivot.rotation.y) > 0.1);
  assert.equal(avatar.rotation.y, 0, 'arah hadap grup tidak disentuh');
  applyPose(avatar, null, 0.4, 1 / 60);
  assert.equal(avatar.userData.pivot.rotation.y, 0);
});

test('aura: terpasang, beranimasi, bisa disembunyikan, diganti tanpa menumpuk, dan dilepas', () => {
  const avatar = createAvatar({ config: defaultConfig() });
  const before = avatar.children.length;
  setAvatarAura(avatar, auraSpecFor('Budi', 3));
  assert.equal(avatar.children.length, before + 1);
  applyPose(avatar, null, 1.5, 1 / 60);
  const pos = avatar.userData.aura.points.geometry.attributes.position;
  assert.ok(Number.isFinite(pos.getX(0)) && pos.getY(0) > 0);
  setAvatarAura(avatar, auraSpecFor('Budi', 0)); // ganti: tidak menumpuk
  assert.equal(avatar.children.length, before + 1);
  setAurasVisible(false);
  applyPose(avatar, null, 2, 1 / 60);
  assert.equal(avatar.userData.aura.group.visible, false);
  setAurasVisible(true);
  applyPose(avatar, null, 2.1, 1 / 60);
  assert.equal(avatar.userData.aura.group.visible, true);
  setAvatarAura(avatar, null);
  assert.equal(avatar.children.length, before);
  assert.equal(avatar.userData.aura, null);
});
