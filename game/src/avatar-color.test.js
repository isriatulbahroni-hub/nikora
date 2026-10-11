import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForId, createAvatar, setAvatarColor } from './avatar.js';

test('colorForId: deterministik per id dan bervariasi antar id', () => {
  assert.equal(colorForId('a1b2c3d4'), colorForId('a1b2c3d4'));
  const colors = new Set(['a1b2c3d4', 'e5f6a7b8', '9c0d1e2f', 'ffee1100', '12345678', 'deadbeef'].map(colorForId));
  assert.ok(colors.size >= 5);
});

test('setAvatarColor mewarnai badan, penanda arah, dan lengan', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  setAvatarColor(g, 0xff0000);
  assert.equal(g.userData.tint.length, 3);
  for (const m of g.userData.tint) assert.equal(m.color.getHex(), 0xff0000);
});
