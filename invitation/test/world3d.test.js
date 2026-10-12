import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGNS, THEME_DESIGN, designFor } from '../src/world3d/designs.js';
import { wrapLines, fitSize } from '../src/world3d/textures.js';
import { THEMES } from '../src/themes/index.js';
import { contrast } from '../src/engine/color.js';

test('desain 3D: id unik, kolom lengkap, dan teks surat terbaca (kontras)', () => {
  assert.equal(new Set(DESIGNS.map((d) => d.id)).size, DESIGNS.length);
  for (const d of DESIGNS) {
    for (const k of ['body', 'dark', 'liner', 'bgTop', 'bgBot', 'glow', 'letterBg', 'ink', 'nameColor', 'flap', 'seal', 'pattern']) assert.ok(d[k], `${d.id}.${k}`);
    assert.ok(contrast(d.ink, d.letterBg) >= 4.5, `${d.id} ink/surat ${contrast(d.ink, d.letterBg).toFixed(2)}`);
    assert.ok(contrast(d.nameColor, d.letterBg) >= 3, `${d.id} nama/surat ${contrast(d.nameColor, d.letterBg).toFixed(2)}`);
  }
});

test('padanan tema -> desain: semua tujuan ada, semua tema asal valid, dan tak ada dua tema berbagi desain', () => {
  const ids = new Set(DESIGNS.map((d) => d.id)), themes = new Set(THEMES.map((t) => t.id));
  for (const [theme, design] of Object.entries(THEME_DESIGN)) { assert.ok(themes.has(theme), theme); assert.ok(ids.has(design), design); }
  assert.equal(new Set(Object.values(THEME_DESIGN)).size, Object.keys(THEME_DESIGN).length);
});

test('designFor: padanan tema, pilihan editor menang, nilai ngawur diabaikan', () => {
  const view = (themeId, config) => ({ theme: { id: themeId }, scenes: [{ kind: 'amplop', config }] });
  assert.equal(designFor(view('pernikahan-islami')).id, 'navyemas');
  assert.equal(designFor(view('pernikahan-islami', { design3d: 'zamrud' })).id, 'zamrud');
  assert.equal(designFor(view('pernikahan-islami', { design3d: '<script>' })).id, 'navyemas');
  assert.equal(designFor(view('pernikahan-minimalis')), null);
  assert.equal(designFor(view('ulang_tahun-pesta')), null);
  assert.equal(designFor(view('pernikahan-minimalis'), 'mauve').id, 'mauve');
  assert.equal(designFor({}), null);
});

test('wrapLines: pecah sesuai lebar, batasi baris, potong dengan elipsis', () => {
  const measure = (t) => t.length * 10;
  assert.deepEqual(wrapLines(measure, 'satu dua tiga empat', 100), ['satu dua', 'tiga empat']);
  assert.deepEqual(wrapLines(measure, '', 100), []);
  assert.deepEqual(wrapLines(measure, 'kata-yang-sangat-panjang-sekali', 100), ['kata-yang-sangat-panjang-sekali']);
  const long = wrapLines(measure, 'a bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr', 60, 3);
  assert.equal(long.length, 3);
  assert.ok(long[2].endsWith('…') && measure(long[2]) <= 60);
});

test('fitSize: mengecil hanya bila perlu dan tidak kurang dari 45% ukuran dasar', () => {
  const at = (n) => (b) => n * b;
  assert.equal(fitSize(at(2), 58, 300), 58);
  assert.ok(Math.abs(fitSize(at(10), 58, 300) - 30) < 1e-9);
  assert.equal(fitSize(at(1000), 58, 100), 58 * .45);
});

test('tombol 3D terbaca: teks tombol vs warna sorot setiap desain (WCAG AA)', async () => {
  const { ctaInk } = await import('../src/scenes/envelope.js');
  for (const d of DESIGNS) {
    const ink = ctaInk({ bg1: d.bgBot, ink: d.ink, accent2: d.glow });
    assert.ok(contrast(ink, d.glow) >= 4.5, `${d.id} ${contrast(ink, d.glow).toFixed(2)}`);
  }
  for (const d of DESIGNS) assert.ok(contrast('#f6ebd0', d.bgBot) >= 7, `${d.id} teks di latar`);
});
