import test from 'node:test';
import assert from 'node:assert/strict';
import { buildView, envelopeSettings, mergeTokens, cleanText, initialsOf, titleOf, defaultScenes, SCENE_KINDS } from '../src/engine/config.js';
import { getTheme } from '../src/themes/index.js';
import { contrast } from '../src/engine/color.js';

const inv = { slug: 'rani-dimas', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan', theme: 'pernikahan-fantasi', event_date: '2026-12-12T10:00:00+08:00', extra: { tz: 'Asia/Makassar' } };

test('adegan bawaan: 12 adegan berurutan, nama cocok dengan constraint database', () => {
  const s = defaultScenes();
  assert.equal(s.length, 12);
  assert.deepEqual(s.map((x) => x.kind), SCENE_KINDS);
  assert.deepEqual(s.map((x) => x.position), [...Array(12).keys()]);
});

test('buildView: judul, tanggal Indonesia, tema dari kolom theme', () => {
  const v = buildView({ invitation: inv });
  assert.equal(v.title, 'Dimas & Rani');
  assert.equal(v.theme.id, 'pernikahan-fantasi');
  assert.equal(v.dateText, 'Sabtu, 12 Desember 2026');
  assert.equal(v.scenes.length, 12);
});

test('buildView: acara non-pernikahan memakai extra.title; adegan nonaktif dibuang & diurutkan', () => {
  const v = buildView({
    invitation: { ...inv, event_type: 'ulang_tahun', theme: 'ulang_tahun', bride: '', extra: { title: 'Aira berusia 7 tahun' } },
    scenes: [{ kind: 'cover', position: 2, active: true, config: {} }, { kind: 'amplop', position: 0, active: true, config: {} }, { kind: 'surat', position: 1, active: false, config: {} }],
  });
  assert.equal(v.title, 'Aira berusia 7 tahun');
  assert.equal(v.theme.id, 'ulang_tahun-pesta');
  assert.deepEqual(v.scenes.map((s) => s.kind), ['amplop', 'cover']);
});

test('nama tamu dari ?to= dibersihkan dan dibatasi', () => {
  assert.equal(buildView({ invitation: inv, query: { to: '  Bapak\n\tAhmad  ' } }).recipient, 'Bapak Ahmad');
  assert.equal(buildView({ invitation: inv, query: { to: 'x'.repeat(500) } }).recipient.length, 60);
  assert.equal(buildView({ invitation: inv, query: { to: '   ' } }).recipient, null);
  assert.equal(cleanText({ a: 1 }), null);
});

test('semua teks amplop bisa ditimpa dari config editor', () => {
  const view = buildView({ invitation: inv, scenes: [{ kind: 'amplop', position: 0, active: true, config: { hint: 'Ketuk segel', tagline: 'Halo!', lead: 'Isi surat baru', openLabel: 'Masuk', sealText: 'DR', speed: 1.5 } }] });
  const s = envelopeSettings(view);
  assert.equal(s.text.hint, 'Ketuk segel');
  assert.equal(s.text.tagline, 'Halo!');
  assert.equal(s.text.lead, 'Isi surat baru');
  assert.equal(s.text.openLabel, 'Masuk');
  assert.equal(s.sealText, 'DR');
  assert.equal(s.speed, 1.5);
});

test('config kosong/rusak jatuh ke teks dan kecepatan tema', () => {
  const view = buildView({ invitation: inv, scenes: [{ kind: 'amplop', position: 0, active: true, config: { hint: 123, speed: 'cepat' } }] });
  const s = envelopeSettings(view);
  assert.equal(s.text.hint, getTheme('pernikahan-fantasi').copy.hint);
  assert.equal(s.speed, getTheme('pernikahan-fantasi').motion.speed);
  assert.equal(s.sealText, 'D&R');
});

test('warna kustom: hex valid diterima, tidak valid diabaikan, tidak terbaca ditolak', () => {
  const base = getTheme('pernikahan-taman').tokens;
  assert.equal(mergeTokens(base, { accent: '#112233' }).accent, '#112233');
  assert.equal(mergeTokens(base, { accent: 'red; background:url(x)' }).accent, base.accent);
  const bad = mergeTokens(base, { ink: base.letter }); // teks sama dengan kertas
  assert.equal(bad.ink, base.ink);
  assert.ok(contrast(bad.ink, bad.letter) >= 4.5);
  const bad2 = mergeTokens(base, { stageInk: base.bg1 });
  assert.equal(bad2.stageInk, base.stageInk);
});

test('inisial segel', () => {
  assert.equal(initialsOf('Dimas & Rani'), 'D&R');
  assert.equal(initialsOf('Aira berusia 7 tahun'), 'A');
  assert.equal(titleOf({ groom: 'Aira', bride: '' }), 'Aira');
  assert.equal(titleOf({}), 'Undangan');
});
