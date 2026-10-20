import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_CLIPS } from './avatar-editor-clips.js';
import { EXTRA_CLIPS } from './avatar-extra-anims.js';

test('semua gerakan pratinjau dikenal pemuat klip tambahan', () => {
  for (const c of PREVIEW_CLIPS) assert.ok(Object.hasOwn(EXTRA_CLIPS, c.id), `klip ${c.id} tidak ada di EXTRA_CLIPS`);
});

test('id unik dan setiap gerakan punya label serta ikon', () => {
  const ids = PREVIEW_CLIPS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of PREVIEW_CLIPS) {
    assert.ok(c.label.trim() && c.icon.trim(), `gerakan ${c.id} butuh label dan ikon`);
  }
});

test('klip duduk dan transisi tidak masuk daftar pratinjau', () => {
  for (const c of PREVIEW_CLIPS) assert.ok(!/^(sit_|stand|walk|strafe|turn)/.test(c.id), `${c.id} tidak cocok untuk pratinjau`);
});

test('berkas klip ada di public/anims/extra', async () => {
  const { existsSync } = await import('node:fs');
  for (const c of PREVIEW_CLIPS) assert.ok(existsSync(new URL(`../public/anims/extra/${c.id}.json`, import.meta.url)), `${c.id}.json hilang`);
});
