import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: modul badai dan teduh harus benar-benar dipakai game (pelajaran dari rain-boot.js yang dulu tidak dimuat siapa pun).
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('rain-boot.js memakai teduh, alur badai, dan suara badai', () => {
  const rb = src('./rain-boot.js');
  assert.match(rb, /from '\.\/storm-drama\.js'/);
  assert.match(rb, /from '\.\/weather-shelter\.js'/);
  assert.match(rb, /from '\.\/storm-sound\.js'/);
  assert.match(rb, /readShelter\(/);
  assert.match(rb, /streakAmount\(level, shelter\)/, 'guratan hujan dihitung dari teduh');
  assert.match(rb, /if \(rain < 0\.01\) return;/, 'tanpa guratan bila teduh');
  assert.match(rb, /sound\.thunder\(/);
});

test('hotel-ambience.js meneruskan indoor dan kabin ke weather-shelter.js, juga saat ?suara=0', () => {
  const am = src('./hotel-ambience.js');
  assert.match(am, /from '\.\/weather-shelter\.js'/);
  assert.equal((am.match(/publishShelter\(\{ indoor, cabin \}\)/g) ?? []).length, 2, 'versi senyap dan versi bersuara');
});

test('hotel-main.js tetap mengirim indoor dan kabin ke ambience tiap frame', () => {
  const hotel = src('./hotel-main.js');
  assert.match(hotel, /ambience\.update\(\{ time: time \/ 1000, night: nightK, rain: rainK, indoor: indoorK, cabin: inCabin \}\)/);
});

test('hotel.html memuat rain-boot.js sebelum hotel-main.js', () => {
  const html = readFileSync(new URL('../hotel.html', import.meta.url), 'utf8');
  const a = html.indexOf('/src/rain-boot.js');
  const b = html.indexOf('/src/hotel-main.js');
  assert.ok(a > 0 && b > a);
});
