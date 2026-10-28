import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: lalu lintas karyawan villa hanya tampil bila dunia perjalanan villa memasangnya, mengikuti kamera, dan membongkarnya.
test('hotel-journey.js memasang, memperbarui, dan membongkar lalu lintas jalan villa', () => {
  const src = readFileSync(new URL('./hotel-journey.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/road-traffic-view\.js'/, 'impor road-traffic-view');
  assert.match(src, /createRoadTrafficView\(\{[^}]*group: world\.group/, 'dipasang di grup dunia perjalanan');
  assert.match(src, /gate\.id === 'villa' \? createRoadTrafficView/, 'hanya untuk gerbang villa');
  assert.match(src, /w\.traffic\?\.update\(/, 'diperbarui tiap frame');
  assert.match(src, /w\.traffic\?\.dispose\(\)/, 'dibongkar bersama dunia perjalanan');
});
