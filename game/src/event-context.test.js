import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEventInfo, parseEventParams, titleOfInvitation } from './event-context.js';

test('parseEventParams: slug valid dan nama tamu dibersihkan; selain itu null', () => {
  assert.deepEqual(parseEventParams('?e=dimas-rani&to=Bapak%20Ahmad'), { slug: 'dimas-rani', to: 'Bapak Ahmad' });
  assert.equal(parseEventParams('?e=DIMAS-RANI').slug, 'dimas-rani');
  for (const bad of ['?e=a', '?e=-abc', '?e=../x', '?e=a b c', '?e=' + 'a'.repeat(50), '']) assert.equal(parseEventParams(bad).slug, null, bad);
  assert.ok(!/[<>]/.test(parseEventParams('?to=<b>Budi</b>').to));
  assert.equal(parseEventParams('?to=' + 'x'.repeat(80)).to.length, 24);
});

test('titleOfInvitation: judul kustom, pasangan, atau satu nama', () => {
  assert.equal(titleOfInvitation({ groom: 'Dimas', bride: 'Rani' }), 'Dimas & Rani');
  assert.equal(titleOfInvitation({ groom: 'Aira', bride: '', extra: { title: 'Aira berusia 7 tahun' } }), 'Aira berusia 7 tahun');
  assert.equal(titleOfInvitation({ groom: 'Aira' }), 'Aira');
  assert.equal(titleOfInvitation(null), '');
});

test('loadEventInfo: sukses, tidak ditemukan, HTTP error, jaringan gagal, tanpa konfigurasi -> aman', async () => {
  const cfg = { url: 'https://x.supabase.co/', key: 'anon' };
  let seen;
  const ok = async (u, o) => { seen = { u, o }; return { ok: true, json: async () => [{ slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan', theme: 'pernikahan-adat-sasak', event_date: '2026-12-12' }] }; };
  const info = await loadEventInfo('dimas-rani', { ...cfg, fetchImpl: ok });
  assert.equal(info.title, 'Dimas & Rani');
  assert.equal(info.eventType, 'pernikahan');
  assert.match(seen.u, /^https:\/\/x\.supabase\.co\/rest\/v1\/invitations\?slug=eq\.dimas-rani/);
  assert.equal(seen.o.headers.apikey, 'anon');
  assert.equal(await loadEventInfo('dimas-rani', { ...cfg, fetchImpl: async () => ({ ok: true, json: async () => [] }) }), null);
  assert.equal(await loadEventInfo('dimas-rani', { ...cfg, fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await loadEventInfo('dimas-rani', { ...cfg, fetchImpl: async () => { throw new Error('net'); } }), null);
  assert.equal(await loadEventInfo('dimas-rani', { fetchImpl: ok }), null);
  assert.equal(await loadEventInfo('../x', { ...cfg, fetchImpl: ok }), null);
});
