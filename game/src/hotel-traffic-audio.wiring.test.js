import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: hotel-traffic-audio.js dulu sudah ditulis dan diuji sendiri, tetapi tidak pernah dipasang di hotel-main.js,
// jadi mesin, klakson, dan benturan lalu lintas tidak pernah terdengar di game. Uji ini gagal bila sambungannya hilang lagi.
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('sambungan: hotel-main.js membuat suara lalu lintas, memperbaruinya tiap frame, dan membunyikan benturan saat pemain tertabrak', () => {
  const main = src('./hotel-main.js');
  for (const re of [
    /from '\.\/hotel-traffic-audio\.js'/,
    /createTrafficAudio\(\{/,
    /trafficAudio\.update\(\{/,
    /sources: trafficSources/,
    /trafficAudio\?\.bump\(/,
    /trafficSources = lifeNow\?\.sources/,
  ]) assert.match(main, re);
});

test('sambungan: hotel-life.js melaporkan kendaraan yang terdengar dan tetap melaporkan tabrakan', () => {
  const life = src('./hotel-life.js');
  for (const re of [/sources\.push\(\{/, /return \{ hit, sources \}/, /return \{ hit, sources: NO_SOURCES \}/]) assert.match(life, re);
});
