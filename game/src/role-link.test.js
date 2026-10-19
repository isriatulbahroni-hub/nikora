import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLink, checkInputs, deriveRoleKeyWeb, normalizeSecret } from './role-link.js';
import { deriveRoleKey, roleSecret, verifyRoleKey } from './token-issuer.js';

const SECRET = 'rahasia-panjang-untuk-uji-123';

test('kunci buatan browser identik dengan kunci server untuk semua kombinasi acara dan peran', async () => {
  for (const event of ['', 'pernikahan-ron-rina', 'acara-2026', 'a1b']) {
    for (const role of ['owner', 'mc']) {
      const web = await deriveRoleKeyWeb(SECRET, event, role);
      assert.equal(web, deriveRoleKey(SECRET, event, role), `${event || '(umum)'} ${role}`);
      assert.equal(verifyRoleKey(SECRET, event, web), role, 'server menerima kunci buatan browser');
    }
  }
});

test('rahasia dengan spasi/kutip salah tempel dinormalkan sama seperti di server', async () => {
  for (const messy of [`  ${SECRET}\n`, `"${SECRET}"`, `'${SECRET}'`, ` " ${SECRET} " `]) {
    assert.equal(normalizeSecret(messy), SECRET);
    assert.equal(roleSecret({ EVENT_ROLE_SECRET: messy }), SECRET);
    assert.equal(await deriveRoleKeyWeb(normalizeSecret(messy), '', 'mc'), deriveRoleKey(SECRET, '', 'mc'));
  }
});

test('checkInputs: rahasia pendek, slug tidak valid, ruang umum ("-" atau kosong)', () => {
  assert.equal(checkInputs({ secret: 'pendek', slug: '' }).ok, false);
  assert.equal(checkInputs({ secret: SECRET, slug: 'Bukan Slug!' }).ok, false);
  assert.equal(checkInputs({ secret: SECRET, slug: 'ab' }).ok, false);
  for (const slug of ['', '-', '  ', undefined]) assert.equal(checkInputs({ secret: SECRET, slug }).event, '');
  const ok = checkInputs({ secret: SECRET, slug: ' Pernikahan-Ron-Rina ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.event, 'pernikahan-ron-rina', 'huruf besar diubah ke kecil');
});

test('buildLink: format tautan vila/aula, dengan dan tanpa acara; peran tidak dikenal ditolak', async () => {
  const a = await buildLink({ origin: 'https://x.vercel.app', page: 'villa', event: '', role: 'owner', secret: SECRET });
  assert.match(a.url, /^https:\/\/x\.vercel\.app\/villa\.html\?key=owner-[A-Za-z0-9_-]{24}$/);
  const b = await buildLink({ origin: 'https://x.vercel.app', page: 'hall', event: 'acara-uji', role: 'mc', secret: SECRET });
  assert.match(b.url, /^https:\/\/x\.vercel\.app\/\?e=acara-uji&key=mc-[A-Za-z0-9_-]{24}$/);
  await assert.rejects(() => buildLink({ origin: 'https://x', event: '', role: 'admin', secret: SECRET }));
  await assert.rejects(() => deriveRoleKeyWeb(SECRET, '', 'owner', null), /WebCrypto/);
});

import { generateSecret, interpretServerCheck, MIN_SECRET } from './role-link.js';

test('generateSecret: 32 karakter dari alfabet aman, berbeda tiap panggilan, memenuhi panjang minimum', () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.equal(a.length, 32);
  assert.match(a, /^[A-HJ-NP-Za-km-z2-9]{32}$/, 'tanpa huruf mirip');
  assert.notEqual(a, b);
  assert.ok(a.length >= MIN_SECRET);
  assert.equal(generateSecret(48).length, 48);
  assert.throws(() => generateSecret(32, {}), /WebCrypto/);
});

test('generateSecret: sebaran merata (tanpa bias modulo yang mencolok)', () => {
  const counts = new Map();
  for (let i = 0; i < 4000; i++) for (const ch of generateSecret(32)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const values = [...counts.values()];
  assert.equal(counts.size, 57, 'semua huruf alfabet muncul');
  assert.ok(Math.max(...values) / Math.min(...values) < 1.5, 'sebaran kira-kira merata');
});

test('interpretServerCheck: diterima, ditolak, belum terpasang, server belum siap', () => {
  assert.equal(interpretServerCheck({ enabled: true, restricted: true, role: 'owner' }, 'owner').ok, true);
  assert.equal(interpretServerCheck({ enabled: true, restricted: true, role: 'mc' }, 'mc').ok, true);
  const wrong = interpretServerCheck({ enabled: true, restricted: true, role: 'guest' }, 'owner');
  assert.equal(wrong.ok, false);
  assert.match(wrong.message, /berbeda dengan EVENT_ROLE_SECRET/);
  const open = interpretServerCheck({ enabled: true, restricted: false, role: 'guest' }, 'owner');
  assert.equal(open.ok, false);
  assert.match(open.message, /belum membaca EVENT_ROLE_SECRET/);
  assert.match(interpretServerCheck({ enabled: false }, 'owner').message, /belum siap/);
  assert.match(interpretServerCheck(null, 'mc').message, /belum siap/);
  assert.equal(interpretServerCheck({ enabled: true, restricted: true, role: 'owner' }, 'mc').ok, false, 'peran berbeda dari yang diharapkan');
});
