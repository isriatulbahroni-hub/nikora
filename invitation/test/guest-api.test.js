import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRsvp, submitRsvp, loadWishes, loadGifts } from '../src/engine/guest-api.js';

const cfg = (fetchImpl) => ({ url: 'https://x.supabase.co/', key: 'anon', fetchImpl });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('cleanRsvp: nama wajib, jumlah tamu dijepit 1-10, tidak hadir -> 1 tamu tanpa menu', () => {
  assert.throws(() => cleanRsvp({ name: '   ' }), /Nama wajib/);
  assert.equal(cleanRsvp({ name: 'Budi', attending: true, guests: 99 }).guests, 10);
  assert.equal(cleanRsvp({ name: 'Budi', attending: true, guests: 'abc' }).guests, 1);
  const no = cleanRsvp({ name: 'Budi', attending: false, guests: 5, meal: 'Nasi' });
  assert.equal(no.guests, 1);
  assert.equal(no.meal, null);
});

test('cleanRsvp: teks dibersihkan dan dipotong sesuai batas database', () => {
  const r = cleanRsvp({ name: 'A'.repeat(200), attending: true, wish: 'x\u0000y'.repeat(300) });
  assert.equal(r.name.length, 80);
  assert.ok(r.wish.length <= 300);
  assert.ok(!/\u0000/.test(r.wish));
});

test('submitRsvp: POST ke rsvps dengan slug, tanpa meminta data balik', async () => {
  let call;
  const row = await submitRsvp('rani-dimas', { name: 'Budi', attending: true, guests: 2, wish: 'Selamat' }, cfg(async (url, init) => { call = { url, init }; return ok({}); }));
  assert.equal(call.url, 'https://x.supabase.co/rest/v1/rsvps');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Prefer, 'return=minimal');
  assert.equal(JSON.parse(call.init.body).slug, 'rani-dimas');
  assert.equal(row.guests, 2);
});

test('submitRsvp: slug buruk ditolak sebelum jaringan; galat server -> pesan jelas', async () => {
  let hit = 0;
  const f = async () => { hit++; return ok({}); };
  await assert.rejects(() => submitRsvp("a'; drop", { name: 'Budi' }, cfg(f)), /tidak valid/);
  assert.equal(hit, 0);
  await assert.rejects(() => submitRsvp('abc-def', { name: 'Budi' }, cfg(async () => ({ ok: false, status: 403 }))), /403/);
});

test('loadWishes: hanya nama + ucapan, baris kosong dibuang, limit dijepit', async () => {
  let url;
  const out = await loadWishes('abc-def', cfg(async (u) => { url = u; return ok([
    { name: 'Siti', wish: 'Barakallah', created_at: '2026-10-01', guests: 3, meal: 'x' },
    { name: '', wish: 'tanpa nama' },
    { name: 'Joko', wish: null },
  ]); }), { limit: 5000 });
  assert.deepEqual(out, [{ name: 'Siti', wish: 'Barakallah', at: '2026-10-01' }]);
  assert.match(url, /limit=100$/);
  assert.match(url, /select=name,wish,created_at/);
});

test('loadGifts: hanya jenis valid dan aktif, nomor rekening tidak diubah bentuknya', async () => {
  let url;
  const out = await loadGifts('abc-def', cfg(async (u) => { url = u; return ok([
    { kind: 'bank', label: 'BCA', account_name: 'Dimas', account_no: '1234567890', qr_path: null },
    { kind: 'crypto', label: 'x' },
  ]); }));
  assert.match(url, /active=eq\.true/);
  assert.equal(out.length, 1);
  assert.equal(out[0].accountNo, '1234567890');
});

test('tanpa konfigurasi Supabase -> pesan jelas', async () => {
  await assert.rejects(() => loadGifts('abc-def', { fetchImpl: async () => ok([]) }), /Konfigurasi Supabase/);
});
