import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateInvitation, safeUrl, invitationRow, shareLinks, createClient, SLUG, RESERVED } from '../src/studio/api.js';

const memStore = (init = null) => { let v = init; return { get: () => v, set: (x) => { v = x; }, peek: () => v }; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const base = { eventType: 'pernikahan', groom: 'Dimas', bride: 'Rani', eventDate: '2026-12-12T10:00', slug: 'rani-dimas', theme: 'pernikahan-adat-sasak' };

test('slugify: hasil selalu lolos aturan database', () => {
  assert.equal(slugify('Rani & Dimas'), 'rani-dimas');
  assert.equal(slugify('  Ékó  Pútra!! '), 'eko-putra');
  assert.equal(slugify('a'), '');
  assert.equal(slugify('admin'), '');
  const long = slugify('x'.repeat(100) + ' y');
  assert.ok(long.length <= 40 && SLUG.test(long));
  for (const r of RESERVED) assert.ok(!slugify(r) || !RESERVED.includes(slugify(r)));
});

test('validateInvitation: pernikahan butuh dua nama, tanggal, slug dan tema yang cocok jenis acara', () => {
  assert.equal(validateInvitation(base).ok, true);
  const bad = validateInvitation({ ...base, bride: '', eventDate: '', slug: 'A', theme: 'ulang_tahun-pesta' }); // tema ada, tapi bukan untuk pernikahan
  assert.equal(bad.ok, false);
  for (const k of ['bride', 'eventDate', 'slug', 'theme']) assert.ok(bad.errors[k], k);
  assert.ok(validateInvitation({ ...base, slug: 'admin' }).errors.slug);
  assert.ok(validateInvitation({ ...base, eventType: 'bukan-jenis' }).errors.eventType);
});

test('safeUrl: hanya http(s)', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.match(safeUrl('https://maps.google.com/?q=a'), /^https:/);
});

test('invitationRow: pemilik dari sesi, extra hanya tz/world, status aktif oleh pemilik', () => {
  const v = validateInvitation({ ...base, world: 'hall', mapsUrl: 'javascript:x' }).value;
  const row = invitationRow(v, 'user-1');
  assert.equal(row.owner_id, 'user-1');
  assert.deepEqual(row.extra, { tz: 'Asia/Jakarta', world: 'hall' });
  assert.equal(row.maps_url, null);
  assert.equal(row.status_by, 'owner');
  assert.match(row.event_date, /Z$/);
});

test('shareLinks: link undangan, per tamu (nama ter-encode), dan dunia dengan ?e=slug', () => {
  const l = shareLinks({ slug: 'rani-dimas', inviteBase: 'https://undangan.example/', worldBase: 'https://dunia.example' });
  assert.equal(l.invite, 'https://undangan.example/?slug=rani-dimas');
  const g = new URL(l.forGuest('Bapak Ahmad & Keluarga'));
  assert.equal(g.searchParams.get('slug'), 'rani-dimas');
  assert.equal(g.searchParams.get('to'), 'Bapak Ahmad & Keluarga');
  assert.equal(l.forGuest('  '), l.invite);
  assert.equal(l.world, 'https://dunia.example/villa.html?e=rani-dimas');
});

test('signIn: sesi tersimpan; kata sandi salah -> pesan Indonesia', async () => {
  const store = memStore();
  const ok = createClient({ url: 'https://x.supabase.co/', key: 'anon', store, fetchImpl: async () => res(200, { access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: 'a@b.c' } }) });
  const s = await ok.signIn('a@b.c', 'rahasia');
  assert.equal(s.user.id, 'u1');
  assert.equal(ok.userId(), 'u1');
  const bad = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(), fetchImpl: async () => res(400, { msg: 'Invalid login credentials' }) });
  await assert.rejects(() => bad.signIn('a@b.c', 'x'), /Email atau kata sandi salah/);
});

test('signUp: tanpa token -> perlu konfirmasi email', async () => {
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(), fetchImpl: async () => res(200, { user: { id: 'u2' } }) });
  const r = await c.signUp('a@b.c', 'rahasia1');
  assert.equal(r.needsConfirm, true);
});

test('token kedaluwarsa diperbarui; gagal diperbarui -> sesi dihapus', async () => {
  const old = JSON.stringify({ access_token: 'lama', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } });
  const store = memStore(old);
  const calls = [];
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store, fetchImpl: async (u, i) => {
    calls.push(u);
    if (u.includes('grant_type=refresh_token')) return res(200, { access_token: 'baru', refresh_token: 'r2', expires_in: 3600 });
    assert.equal(i.headers.Authorization, 'Bearer baru');
    return res(200, []);
  } });
  await c.myInvitations();
  assert.ok(calls[0].includes('refresh_token'));
  assert.equal(JSON.parse(store.peek()).user.id, 'u1');
  const dead = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(old), fetchImpl: async () => res(400, { msg: 'x' }) });
  await assert.rejects(() => dead.myInvitations(), /Sesi berakhir/);
});

test('createInvitation: undangan lalu 12 adegan bawaan; slug bentrok -> pesan jelas', async () => {
  const live = JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 9999999999, user: { id: 'owner-1' } });
  const posts = [];
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(live), fetchImpl: async (u, i) => { posts.push({ u, b: JSON.parse(i.body) }); return res(201, null); } });
  const v = validateInvitation(base).value;
  assert.equal(await c.createInvitation(v), 'rani-dimas');
  assert.equal(posts[0].b.owner_id, 'owner-1');
  assert.equal(posts[1].b.length, 12);
  assert.ok(posts[1].b.every((s) => s.slug === 'rani-dimas'));
  const dup = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(live), fetchImpl: async () => res(409, { code: '23505' }) });
  await assert.rejects(() => dup.createInvitation(v), /sudah dipakai/);
});

test('createInvitation tanpa sesi ditolak sebelum jaringan', async () => {
  let hit = 0;
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(), fetchImpl: async () => { hit++; return res(200, {}); } });
  await assert.rejects(() => c.createInvitation(validateInvitation(base).value), /masuk dulu/);
  assert.equal(hit, 0);
});

test('hapus hadiah/tamu: id dipaksa angka dan dibatasi slug (tidak bisa menyisipkan filter)', async () => {
  const live = JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 9999999999, user: { id: 'o' } });
  const urls = [];
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(live), fetchImpl: async (u) => { urls.push(u); return res(204, null); } });
  await assert.rejects(() => c.deleteGift('rani-dimas', '5&slug=neq.x'), /ID tidak valid/);
  await assert.rejects(() => c.deleteGuest('rani-dimas', 0), /ID tidak valid/);
  assert.equal(urls.length, 0);
  await c.deleteGift('rani-dimas', 5);
  assert.match(urls[0], /id=eq\.5&slug=eq\.rani-dimas/);
});

test('tempat acara: Istana Cinta diterima dan tersimpan di extra.world; nilai asing dibuang', () => {
  const ok = validateInvitation({ ...base, world: 'royal' });
  assert.equal(ok.ok, true); assert.equal(ok.value.world, 'royal');
  assert.equal(invitationRow(ok.value, 'u1').extra.world, 'royal');
  assert.equal(validateInvitation({ ...base, world: 'hall' }).value.world, 'hall');
  assert.equal(validateInvitation({ ...base, world: 'javascript:x' }).value.world, null);
  assert.equal(invitationRow(validateInvitation({ ...base }).value, 'u1').extra.world, undefined);
});

test('shareLinks: link dunia mengikuti tempat acara; tanpa world tetap villa (kompatibel)', () => {
  const mk = (world) => shareLinks({ slug: 'rani-dimas', inviteBase: 'https://undangan.example/', worldBase: 'https://dunia.example', world }).world;
  assert.equal(mk(), 'https://dunia.example/villa.html?e=rani-dimas');
  assert.equal(mk('villa'), 'https://dunia.example/villa.html?e=rani-dimas');
  assert.equal(mk('royal'), 'https://dunia.example/royal.html?e=rani-dimas');
  assert.equal(mk('hall'), 'https://dunia.example/?e=rani-dimas');
});
