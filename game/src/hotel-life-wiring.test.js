import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: hotel-life.js, hotel-life-data.js, dan hotel-ambience.js dulu sempat digabung tanpa dipanggil siapa pun,
// sehingga di game tidak ada yang berubah (sama seperti rain-boot.js dan cabin-look.js).
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('hotel-main.js memasang lalu lintas, burung, dan suara sekitar, dan melangkahkannya tiap frame', () => {
  const hotel = src('./hotel-main.js');
  assert.match(hotel, /from '\.\/hotel-life\.js'/);
  assert.match(hotel, /from '\.\/hotel-ambience\.js'/);
  assert.match(hotel, /createHotelLife\(\{ scene,/);
  assert.match(hotel, /createHotelAmbience\(\{ search:/);
  assert.match(hotel, /life\.update\(\{/);
  assert.match(hotel, /ambience\.update\(\{/);
  assert.match(hotel, /active: journey\.state === 'idle'/, 'lalu lintas disembunyikan selama lorong perjalanan');
});

test('hotel-life.js memakai data murni hotel-life-data.js', () => {
  const life = src('./hotel-life.js');
  assert.match(life, /from '\.\/hotel-life-data\.js'/);
});
