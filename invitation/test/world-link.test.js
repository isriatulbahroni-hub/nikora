import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorld, enterLabel, worldUrl } from '../src/engine/world-link.js';
import { buildView } from '../src/engine/config.js';

test('defaultWorld: pernikahan ke villa, acara lain ke aula', () => {
  assert.equal(defaultWorld('pernikahan'), 'villa');
  for (const t of ['ulang_tahun', 'khitanan', 'karaoke', 'komunitas']) assert.equal(defaultWorld(t), 'hall');
});

test('buildView: dunia bawaan menurut jenis acara, dapat ditimpa extra.world, nilai asing diabaikan', () => {
  assert.equal(buildView({ invitation: { slug: 'a-b', event_type: 'pernikahan' } }).world, 'villa');
  assert.equal(buildView({ invitation: { slug: 'a-b', event_type: 'ulang_tahun' } }).world, 'hall');
  assert.equal(buildView({ invitation: { slug: 'a-b', event_type: 'pernikahan', extra: { world: 'hall' } } }).world, 'hall');
  assert.equal(buildView({ invitation: { slug: 'a-b', event_type: 'pernikahan', extra: { world: 'javascript:x' } } }).world, 'villa');
});

test('worldUrl: membawa slug dan nama tamu; demo tanpa slug; base kustom; label tombol', () => {
  const v = buildView({ invitation: { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan' }, query: { to: 'Bapak Ahmad & keluarga' } });
  const u = new URL(worldUrl(v));
  assert.equal(u.origin + u.pathname, 'https://nikora-ten.vercel.app/villa.html');
  assert.equal(u.searchParams.get('e'), 'dimas-rani');
  assert.equal(u.searchParams.get('to'), 'Bapak Ahmad & keluarga');
  const hall = buildView({ invitation: { slug: 'aira-7', event_type: 'ulang_tahun' } });
  assert.equal(new URL(worldUrl(hall, { base: 'https://dunia.example.com/' })).pathname, '/');
  const demo = buildView({ invitation: { slug: 'demo', event_type: 'pernikahan' } });
  assert.equal(new URL(worldUrl(demo)).searchParams.has('e'), false);
  assert.equal(enterLabel('pernikahan'), 'Masuk ke dunia pernikahan');
  assert.equal(enterLabel('ulang_tahun'), 'Masuk ke dunia acara');
});

import { WORLDS, WORLD_LABELS, worldPage, worldOfRow } from '../src/engine/world-link.js';

test('tempat acara: Istana Cinta dan Masjid terdaftar, setiap tempat punya label dan halaman', () => {
  assert.deepEqual([...WORLDS], ['villa', 'royal', 'hall', 'masjid']);
  for (const w of WORLDS) assert.ok(WORLD_LABELS[w], w);
  assert.match(WORLD_LABELS.royal, /Istana Cinta/);
  assert.match(WORLD_LABELS.masjid, /Masjid/);
  assert.equal(worldPage('villa'), 'villa.html');
  assert.equal(worldPage('royal'), 'royal.html');
  assert.equal(worldPage('hall'), '');
  assert.equal(worldPage('masjid'), 'masjid.html');
  assert.equal(worldPage('asing'), 'villa.html');          // tak dikenal = perilaku lama (villa)
  assert.equal(worldPage(undefined), 'villa.html');
});

test('buildView + worldUrl: pemilik memilih Istana Cinta -> tamu masuk ke royal.html membawa slug dan nama', () => {
  const inv = { slug: 'dimas-rani', event_type: 'pernikahan', extra: { world: 'royal' } };
  const v = buildView({ invitation: inv, query: { to: 'Bapak Ahmad' } });
  assert.equal(v.world, 'royal');
  const u = new URL(worldUrl(v));
  assert.equal(u.origin + u.pathname, 'https://nikora-ten.vercel.app/royal.html');
  assert.equal(u.searchParams.get('e'), 'dimas-rani');
  assert.equal(u.searchParams.get('to'), 'Bapak Ahmad');
  // tempat lain tetap benar, dan acara yang memilih Istana Cinta tanpa slug demo tidak membawa e
  assert.equal(new URL(worldUrl(buildView({ invitation: { slug: 'a-b', event_type: 'pernikahan' } }))).pathname, '/villa.html');
  assert.equal(new URL(worldUrl(buildView({ invitation: { slug: 'a-b', event_type: 'pernikahan', extra: { world: 'hall' } } }))).pathname, '/');
  assert.equal(new URL(worldUrl(buildView({ invitation: { slug: 'demo', event_type: 'pernikahan', extra: { world: 'royal' } } }))).searchParams.has('e'), false);
});

test('buildView + worldUrl: tazkirah yang memilih Masjid -> tamu masuk ke masjid.html membawa slug dan nama', () => {
  const inv = { slug: 'tazkirah-akbar', event_type: 'tazkirah', extra: { world: 'masjid' } };
  const v = buildView({ invitation: inv, query: { to: 'Ibu Siti' } });
  assert.equal(v.world, 'masjid');
  const u = new URL(worldUrl(v));
  assert.equal(u.origin + u.pathname, 'https://nikora-ten.vercel.app/masjid.html');
  assert.equal(u.searchParams.get('e'), 'tazkirah-akbar');
  assert.equal(u.searchParams.get('to'), 'Ibu Siti');
  // tanpa pilihan pemilik, jenis acara yang sama tetap ke aula (Masjid hanya lewat pilihan pemilik)
  assert.equal(buildView({ invitation: { slug: 'tazkirah-akbar', event_type: 'tazkirah' } }).world, 'hall');
});

test('worldOfRow: pilihan pemilik, lalu jenis acara; tanpa info = undefined (tautan lama tetap villa)', () => {
  assert.equal(worldOfRow({ event_type: 'pernikahan', extra: { world: 'royal' } }), 'royal');
  assert.equal(worldOfRow({ event_type: 'tazkirah', extra: { world: 'masjid' } }), 'masjid');
  assert.equal(worldOfRow({ event_type: 'pernikahan', extra: {} }), 'villa');
  assert.equal(worldOfRow({ event_type: 'ulang_tahun', extra: null }), 'hall');
  assert.equal(worldOfRow({ event_type: 'pernikahan', extra: { world: 'javascript:x' } }), 'villa');
  assert.equal(worldOfRow({ slug: 'x' }), undefined);
  assert.equal(worldOfRow(null), undefined);
});
