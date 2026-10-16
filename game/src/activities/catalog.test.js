import test from 'node:test';
import assert from 'node:assert/strict';
import { VENUES } from '../venues.js';
import { ACTIVITIES, CATALOG, validateCatalog, activitiesFor, activitiesIn, zonesOf } from './catalog.js';

test('katalog valid: id dikenal, zona tenang hanya aktivitas tenang, tiap lokasi banyak pilihan', () => {
  assert.deepEqual(validateCatalog(), []);
});

test('setiap lokasi terdaftar di VENUES punya katalog permainan', () => {
  for (const id of Object.keys(VENUES)) assert.ok(CATALOG[id], `katalog untuk ${id}`);
});

test('lokasi hajat biasa punya banyak permainan lintas kategori', () => {
  for (const id of ['villa', 'royal', 'hall']) {
    const acts = activitiesFor(id);
    assert.ok(acts.length >= 5, `${id}: ${acts.length}`);
    assert.ok(new Set(acts.map((a) => a.category)).size >= 3, `${id}: kategori`);
  }
});

test('masjid: semua zona tenang, tanpa game pesta, aula utama tanpa permainan', () => {
  const zones = zonesOf('masjid');
  assert.deepEqual(Object.keys(zones).sort(), ['aula-utama', 'halaman', 'museum', 'perpustakaan', 'ruang-tahfidz']);
  assert.ok(Object.values(zones).every((z) => z.quiet));
  assert.deepEqual(activitiesIn('masjid', 'aula-utama'), []);
  assert.ok(activitiesFor('masjid').every((a) => a.tone === 'tenang'));
  assert.equal(ACTIVITIES['tantangan-hafalan'].voluntary, true);
});

test('validateCatalog menangkap pelanggaran', () => {
  const bad = { x: { z: { label: 'Z', quiet: true, activities: ['bulu-tangkis', 'tidak-ada'] } } };
  const problems = validateCatalog(bad);
  assert.ok(problems.some((p) => p.includes('zona tenang memuat aktivitas ramai')));
  assert.ok(problems.some((p) => p.includes('tidak dikenal')));
  assert.ok(problems.some((p) => p.includes('minimal 4')));
});

test('lokasi/zona tak dikenal mengembalikan kosong', () => {
  assert.deepEqual(activitiesFor('antah-berantah'), []);
  assert.deepEqual(activitiesIn('villa', 'tidak-ada'), []);
});
