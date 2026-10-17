import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TALKING_AVATARS, DEFAULT_TALKING_AVATAR, MOODS, VOICE_PARAMS, getTalkingAvatar, avatarUrl,
} from './avatar-talking-config.js';

test('id avatar bicara unik dan ada bawaan', () => {
  const ids = TALKING_AVATARS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(getTalkingAvatar(DEFAULT_TALKING_AVATAR));
});

test('setiap avatar punya lisensi, file .glb di avatars/, dan mood valid', () => {
  for (const a of TALKING_AVATARS) {
    assert.ok(a.license, `${a.id} tanpa lisensi`);
    assert.match(a.file, /^avatars\/.+\.glb$/);
    assert.ok(['M', 'F'].includes(a.body));
    assert.ok(MOODS.includes(a.mood));
    assert.equal(typeof a.commercialOk, 'boolean');
  }
});

test('avatar tak dikenal mengembalikan null', () => {
  assert.equal(getTalkingAvatar('tidak-ada'), null);
});

test('avatarUrl menggabungkan base dan file', () => {
  assert.equal(avatarUrl({ file: 'avatars/x.glb' }, '/nikora/'), '/nikora/avatars/x.glb');
});

test('parameter suara memakai ambang dB yang masuk akal', () => {
  assert.ok(VOICE_PARAMS.vadGateActiveDb > VOICE_PARAMS.vadGateInactiveDb);
});
