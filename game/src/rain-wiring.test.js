import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: hujan 3D, kaca/wiper, getar, dan basah harus benar-benar dipakai game (pelajaran dari rain-boot.js dan hotel-life.js yang dulu tidak dimuat siapa pun).
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('hotel-life.js memasang hujan 3D dan melangkahkannya tiap frame, sebelum pemeriksaan active (juga di lorong)', () => {
  const life = src('./hotel-life.js');
  assert.match(life, /from '\.\/rain-3d\.js'/);
  assert.match(life, /createRain3D\(\{ scene, low, search \}\)/);
  assert.match(life, /rain3d\.update\(\{ time, me, rain, active \}\)/);
  assert.ok(life.indexOf('rain3d.update(') < life.indexOf('if (!active) return { hit, sources: NO_SOURCES }'), 'hujan tetap turun selama lorong perjalanan');
  assert.match(life, /rain3d\?\.dispose\?\.\(\)/);
});

test('hotel-main.js tetap memanggil life.update dengan rain dan me tiap frame', () => {
  const hotel = src('./hotel-main.js');
  assert.match(hotel, /life\.update\(\{/);
  assert.match(hotel, /rain: rainK/);
});

test('rain-boot.js memakai kaca/wiper, getar, saklar 4D, dan menyerahkan guratan ke hujan 3D', () => {
  const rb = src('./rain-boot.js');
  assert.match(rb, /from '\.\/glass-rain\.js'/);
  assert.match(rb, /from '\.\/weather-haptics\.js'/);
  assert.match(rb, /from '\.\/haptics\.js'/);
  assert.match(rb, /window\.__rain3d\?\.active\?\.\(\)/);
  assert.match(rb, /haptics\.thunder\(/);
  assert.match(rb, /glass\.step\(/);
  assert.match(rb, /glass\.draw\(ctx, W, H\)/);
  assert.match(rb, /window\.__weather4d = fourD/);
  assert.match(rb, /!glass\.active\(\)/, 'tetes kaca tetap digambar walau tidak ada guratan 2D');
});

test('rain-3d.js memakai atap, fisika, basah, dan teduh, dan menyediakan window.__rain3d', () => {
  const r = src('./rain-3d.js');
  assert.match(r, /from '\.\/rain-cover\.js'/);
  assert.match(r, /from '\.\/rain-physics\.js'/);
  assert.match(r, /from '\.\/wet-look\.js'/);
  assert.match(r, /from '\.\/weather-shelter\.js'/);
  assert.match(r, /win\.__rain3d = api/);
  assert.match(r, /cull/, 'hujan tidak masuk badan mobil yang dikendarai');
});
