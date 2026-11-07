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

test('lalu lintas tidak lagi menghilang dekat pemain, tetapi bisa menabrak', () => {
  const life = src('./hotel-life.js');
  assert.doesNotMatch(life, /proximityScale/, 'kendaraan tidak mengecil/menghilang lagi');
  assert.match(life, /hitVehicle\(/, 'tabrakan diperiksa tiap frame');
  assert.match(life, /return \{ hit, sources \}/, 'update() melaporkan tabrakan (dan kendaraan yang terdengar)');
});

test('hotel-main.js melempar pemain yang tertabrak, mengunci gerak, lalu membangunkannya', () => {
  const hotel = src('./hotel-main.js');
  assert.match(hotel, /from '\.\/hotel-life-data\.js'/);
  assert.match(hotel, /hittable:/, 'hanya pemain berjalan kaki di luar yang bisa tertabrak');
  assert.match(hotel, /startKnockdown\(lifeNow\.hit/);
  assert.match(hotel, /knockdownPose\(/);
  assert.match(hotel, /const rawInput = down \|\|/, 'gerak terkunci selama terlempar dan terbaring');
});
