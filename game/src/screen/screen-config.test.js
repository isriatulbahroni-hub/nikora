import test from 'node:test';
import assert from 'node:assert/strict';
import { disabledScreen, isScreenEnabled } from './screen-config.js';
import { createScreen } from './screen-setup.js';

test('layar mati secara bawaan dan hanya menyala dengan ?layar=1 (atau true/ya/on)', () => {
  for (const search of ['', '?', '?acara=abc&tamu=x', '?layar=0', '?layar=', '?layar=tidak', '?Layar=1']) {
    assert.equal(isScreenEnabled(search), false, search);
  }
  for (const search of ['?layar=1', '?acara=abc&layar=1', '?layar=true', '?layar=YA', '?layar=on', '?layar=%201']) {
    assert.equal(isScreenEnabled(search), true, search);
  }
});

test('disabledScreen: tidak melakukan apa pun dan tidak melempar error', () => {
  const s = disabledScreen();
  assert.equal(s.enabled, false);
  assert.equal(s.mesh, null);
  assert.equal(s.controller, null);
  assert.doesNotThrow(() => { s.attach({}); s.attach(null); s.render({}, {}); s.resize(1, 1); s.tick(1000); });
});

test('createScreen dengan enabled=false tidak menyentuh scene, renderer, atau host', () => {
  const scene = { add() { throw new Error('scene tidak boleh disentuh'); } };
  const screen = createScreen({ scene, spec: { x: 0, y: 0, z: 0, width: 1, height: 1 }, enabled: false });
  assert.equal(screen.enabled, false);
  assert.equal(screen.mesh, null);
});
