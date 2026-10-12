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
