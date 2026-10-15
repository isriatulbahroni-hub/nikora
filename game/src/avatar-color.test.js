import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PANTS_SHADE } from './avatar-body.js';
import { colorForId, createAvatar, setAvatarColor } from './avatar.js';

test('colorForId: deterministik per id dan bervariasi antar id', () => {
  assert.equal(colorForId('a1b2c3d4'), colorForId('a1b2c3d4'));
  const colors = new Set(['a1b2c3d4', 'e5f6a7b8', '9c0d1e2f', 'ffee1100', '12345678', 'deadbeef'].map(colorForId));
  assert.ok(colors.size >= 5);
});

// Avatar sederhana kini tubuh manusia lengkap (avatar-body.js): baju satu bahan, celana lebih gelap.
test('setAvatarColor mewarnai baju dan celana (celana lebih gelap)', () => {
  const g = createAvatar({ color: 0x70c7a2 });
  setAvatarColor(g, 0xff0000);
  assert.ok(g.userData.tint.length >= 1);
  for (const m of g.userData.tint) assert.equal(m.color.getHex(), 0xff0000);
  const pants = new THREE.Color(0xff0000).multiplyScalar(PANTS_SHADE).getHex();
  assert.equal(g.userData.pants.color.getHex(), pants);
});
