import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: hotel-aircraft.js (helikopter dan pesawat yang mengorbit menara) dulu sempat ada tanpa di-import siapa pun,
// sehingga di game tidak ada yang berubah. Sekarang dipasang lewat hotel-life.js, yang dipanggil tiap frame oleh hotel-main.js.
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('hotel-life.js memasang helikopter dan pesawat dan melangkahkannya tiap frame', () => {
  const life = src('./hotel-life.js');
  assert.match(life, /from '\.\/hotel-aircraft\.js'/);
  assert.match(life, /buildAircraft\(root\)/);
  assert.match(life, /aircraft\.update\(time\)/);
  assert.match(life, /get\('pesawat'\) !== '0'/, '?pesawat=0 mematikannya');
});

test('hotel-main.js memanggil hotel-life.js tiap frame (sambungan ke game)', () => {
  const main = src('./hotel-main.js');
  assert.match(main, /from '\.\/hotel-life\.js'/);
  assert.match(main, /createHotelLife\(\{ scene,/);
  assert.match(main, /life\.update\(\{/);
});
