import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService, handleAccounts, AdminError } from '../src/admin/accounts-core.js';

const OWNER = '00000000-0000-4000-8000-000000000001';
const ADMIN = '00000000-0000-4000-8000-000000000002';
const KLIEN = '00000000-0000-4000-8000-000000000003';
const ADMIN2 = '00000000-0000-4000-8000-000000000004';
const NEW = '00000000-0000-4000-8000-0000000000aa';
const TOKENS = {
  'tok-owner': { id: OWNER, email: 'owner@x.id' },
  'tok-admin': { id: ADMIN, email: 'admin@x.id' },
  'tok-klien': { id: KLIEN, email: 'klien@x.id' },
  'tok-banned': { id: ADMIN2, email: 'b@x.id', banned_until: '2999-01-01T00:00:00Z' },
};

/** Supabase palsu: GoTrue (user, admin/users) + PostgREST (staff, invitations, audit_logs). Mencatat semua panggilan. */
function fake({ staff = { [OWNER]: 'owner', [ADMIN]: 'admin', [ADMIN2]: 'admin' }, failStaffInsert = false } = {}) {
  const calls = [];
  const json = (status, data) => ({ ok: status < 300, status, json: async () => data });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, headers: init.headers });
    if (url.endsWith('/auth/v1/user')) {
      const u = TOKENS[String(init.headers.Authorization).replace('Bearer ', '')];
      return u ? json(200, u) : json(401, { msg: 'invalid' });
    }
    const one = /\/rest\/v1\/staff\?user_id=eq\.([^&]+)&active=eq\.true/.exec(url);
    if (one) return json(200, staff[one[1]] ? [{ role: staff[one[1]] }] : []);
    if (url.includes('/rest/v1/staff?select=')) return json(200, Object.entries(staff).map(([user_id, role]) => ({ user_id, role, active: true })));
    if (url.includes('/rest/v1/staff') && method === 'POST') return failStaffInsert ? json(500, { message: 'boom' }) : json(201, null);
    if (url.includes('/rest/v1/invitations')) return json(200, [{ owner_id: KLIEN }, { owner_id: KLIEN }, { owner_id: ADMIN }]);
    if (url.includes('/rest/v1/audit_logs')) return json(201, null);
    if (url.endsWith('/auth/v1/admin/users') && method === 'POST') {
      return body.email === 'ada@x.id' ? json(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' }) : json(200, { id: NEW, email: body.email });
    }
    if (url.includes('/auth/v1/admin/users?')) {
      return json(200, { users: [
        { id: ADMIN, email: 'admin@x.id', created_at: '2026-10-01T00:00:00Z' },
        { id: KLIEN, email: 'klien@x.id', created_at: '2026-10-05T00:00:00Z', banned_until: '2999-01-01T00:00:00Z' },
      ] });
    }
    if (url.includes('/auth/v1/admin/users/')) return json(200, {});
    return json(404, {});
  };
  return { calls, fetchImpl, service: createAdminService({ url: 'https://x.supabase.co/', serviceKey: 'svc', anonKey: 'anon', fetchImpl, now: () => Date.parse('2026-10-19T00:00:00Z'), onError() {} }) };
}
const writes = (calls) => calls.filter((c) => c.method !== 'GET' && !c.url.includes('/audit_logs'));

test('tanpa kunci service role layanan tertutup (503), bukan jalan tanpa pemeriksaan', () => {
  assert.throws(() => createAdminService({ url: 'https://x.supabase.co', serviceKey: '' }), (e) => e instanceof AdminError && e.status === 503);
});

test('authenticate: tanpa token 401; token palsu 401; bukan staf 403; akun terblokir 401; admin dan owner lolos', async () => {
  const { service } = fake();
  await assert.rejects(() => service.authenticate(undefined), (e) => e.status === 401);
  await assert.rejects(() => service.authenticate('Bearer salah'), (e) => e.status === 401);
  await assert.rejects(() => service.authenticate('Bearer tok-klien'), (e) => e.status === 403);
  await assert.rejects(() => service.authenticate('Bearer tok-banned'), (e) => e.status === 401);
  assert.deepEqual(await service.authenticate('Bearer tok-admin'), { id: ADMIN, email: 'admin@x.id', role: 'admin' });
  assert.equal((await service.authenticate('bearer tok-owner')).role, 'owner');
});

test('authenticate: staf nonaktif diperlakukan sebagai bukan staf', async () => {
  const { service } = fake({ staff: {} });
  await assert.rejects(() => service.authenticate('Bearer tok-admin'), (e) => e.status === 403);
});

test('buat akun klien: email dinormalkan, email_confirm diset, kunci service dipakai, audit tercatat', async () => {
  const { service, calls } = fake();
  const actor = await service.authenticate('Bearer tok-admin');
  const r = await service.createAccount(actor, { email: '  Klien.Baru@X.id ', password: 'sandi-aman-1' });
  assert.deepEqual(r, { id: NEW, email: 'klien.baru@x.id', role: 'klien' });
  const create = calls.find((c) => c.url.endsWith('/auth/v1/admin/users') && c.method === 'POST');
  assert.deepEqual(create.body, { email: 'klien.baru@x.id', password: 'sandi-aman-1', email_confirm: true });
  assert.equal(create.headers.Authorization, 'Bearer svc');
  assert.ok(!calls.some((c) => c.url.includes('/rest/v1/staff') && c.method === 'POST'), 'klien biasa tidak masuk tabel staff');
  const log = calls.find((c) => c.url.includes('/audit_logs'));
  assert.equal(log.body.action, 'akun_dibuat');
  assert.equal(log.body.actor_id, ADMIN);
  assert.equal(log.body.target_id, NEW);
});

test('buat akun: email/kata sandi tidak valid ditolak sebelum menyentuh database; email ganda -> 409', async () => {
  const { service, calls } = fake();
  const actor = await service.authenticate('Bearer tok-admin');
  const before = calls.length;
  await assert.rejects(() => service.createAccount(actor, { email: 'bukan-email', password: 'sandi-aman-1' }), (e) => e.code === 'bad_email');
  await assert.rejects(() => service.createAccount(actor, { email: 'a@x.id', password: 'pendek' }), (e) => e.code === 'bad_password');
  await assert.rejects(() => service.createAccount(actor, { email: 'a@x.id', password: 'x'.repeat(73) }), (e) => e.code === 'bad_password');
  assert.equal(calls.length, before);
  await assert.rejects(() => service.createAccount(actor, { email: 'ada@x.id', password: 'sandi-aman-1' }), (e) => e.status === 409 && /sudah terdaftar/.test(e.message));
});

test('membuat admin: admin biasa ditolak tanpa membuat apa pun; owner boleh dan masuk tabel staff', async () => {
  const a = fake();
  const admin = await a.service.authenticate('Bearer tok-admin');
  const before = a.calls.length;
  await assert.rejects(() => a.service.createAccount(admin, { email: 'baru@x.id', password: 'sandi-aman-1', makeAdmin: true }), (e) => e.status === 403);
  assert.equal(a.calls.length, before);

  const o = fake();
  const owner = await o.service.authenticate('Bearer tok-owner');
  const r = await o.service.createAccount(owner, { email: 'baru@x.id', password: 'sandi-aman-1', makeAdmin: true });
  assert.equal(r.role, 'admin');
  const insert = o.calls.find((c) => c.url.includes('/rest/v1/staff') && c.method === 'POST');
  assert.deepEqual(insert.body, { user_id: NEW, role: 'admin', created_by: OWNER });
});

test('gagal memasukkan ke staff: akun yang baru dibuat dibatalkan (tidak ada akun setengah jadi)', async () => {
  const { service, calls } = fake({ staff: { [OWNER]: 'owner' }, failStaffInsert: true });
  const owner = await service.authenticate('Bearer tok-owner');
  await assert.rejects(() => service.createAccount(owner, { email: 'baru@x.id', password: 'sandi-aman-1', makeAdmin: true }));
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/auth/v1/admin/users/${NEW}`)));
});

test('nonaktifkan/aktifkan: memakai ban_duration; tidak bisa menonaktifkan diri sendiri', async () => {
  const { service, calls } = fake();
  const admin = await service.authenticate('Bearer tok-admin');
  await service.setActive(admin, KLIEN, false);
  assert.deepEqual(calls.find((c) => c.method === 'PUT').body, { ban_duration: '876000h' });
  await service.setActive(admin, KLIEN, true);
  assert.deepEqual(calls.filter((c) => c.method === 'PUT')[1].body, { ban_duration: 'none' });
  const before = writes(calls).length;
  await assert.rejects(() => service.setActive(admin, ADMIN, false), (e) => e.code === 'self');
  assert.equal(writes(calls).length, before);
});

test('admin tidak boleh mengubah admin lain atau owner; owner boleh mengubah admin tetapi bukan owner lain', async () => {
  const a = fake();
  const admin = await a.service.authenticate('Bearer tok-admin');
  await assert.rejects(() => a.service.setActive(admin, ADMIN2, false), (e) => e.status === 403);
  await assert.rejects(() => a.service.setPassword(admin, OWNER, 'sandi-aman-1'), (e) => e.status === 403);
  assert.equal(writes(a.calls).length, 0);

  const o = fake();
  const owner = await o.service.authenticate('Bearer tok-owner');
  await o.service.setActive(owner, ADMIN2, false);
  assert.equal(writes(o.calls).length, 1);
  const other = fake({ staff: { [OWNER]: 'owner', [ADMIN]: 'owner' } });
  const o2 = await other.service.authenticate('Bearer tok-owner');
  await assert.rejects(() => other.service.setActive(o2, ADMIN, false), (e) => e.status === 403);
});

test('atur ulang sandi: panjang dicek; id harus UUID (tidak bisa menyisipkan filter)', async () => {
  const { service, calls } = fake();
  const admin = await service.authenticate('Bearer tok-admin');
  await assert.rejects(() => service.setPassword(admin, KLIEN, '123'), (e) => e.code === 'bad_password');
  await assert.rejects(() => service.setPassword(admin, `${KLIEN}&role=eq.owner`, 'sandi-aman-1'), (e) => e.code === 'bad_id');
  await assert.rejects(() => service.setActive(admin, '../../x', true), (e) => e.code === 'bad_id');
  assert.equal(writes(calls).length, 0);
  await service.setPassword(admin, KLIEN, 'sandi-aman-1');
  assert.deepEqual(calls.find((c) => c.method === 'PUT').body, { password: 'sandi-aman-1' });
  assert.equal(calls.find((c) => c.url.includes('/audit_logs')).body.action, 'sandi_diatur_ulang');
});

test('daftar akun: peran, jumlah undangan, status aktif, terbaru dulu', async () => {
  const { service } = fake();
  const list = await service.listAccounts();
  assert.deepEqual(list.map((a) => a.email), ['klien@x.id', 'admin@x.id']);
  const klien = list[0];
  assert.deepEqual([klien.role, klien.invitations, klien.active], ['klien', 2, false]);
  const admin = list[1];
  assert.deepEqual([admin.role, admin.invitations, admin.active], ['admin', 1, true]);
});

test('handleAccounts: GET/POST/PATCH, 405, 400, dan galat diubah menjadi status yang tepat', async () => {
  const { service } = fake();
  const get = await handleAccounts(service, { method: 'GET', authorization: 'Bearer tok-admin' });
  assert.equal(get.status, 200);
  assert.equal(get.body.me.role, 'admin');
  assert.equal(get.body.accounts.length, 2);

  const post = await handleAccounts(service, { method: 'POST', authorization: 'Bearer tok-admin', body: { email: 'baru@x.id', password: 'sandi-aman-1' } });
  assert.equal(post.status, 201);

  assert.equal((await handleAccounts(service, { method: 'PATCH', authorization: 'Bearer tok-admin', body: { id: KLIEN, active: true } })).status, 200);
  assert.equal((await handleAccounts(service, { method: 'PATCH', authorization: 'Bearer tok-admin', body: { id: KLIEN } })).status, 400);
  assert.equal((await handleAccounts(service, { method: 'DELETE', authorization: 'Bearer tok-admin' })).status, 405);
  assert.equal((await handleAccounts(service, { method: 'GET' })).status, 401);
  assert.equal((await handleAccounts(service, { method: 'GET', authorization: 'Bearer tok-klien' })).status, 403);
  const dup = await handleAccounts(service, { method: 'POST', authorization: 'Bearer tok-admin', body: { email: 'ada@x.id', password: 'sandi-aman-1' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'email_exists');
});

test('handleAccounts: galat tak terduga -> 500 generik tanpa membocorkan isi galat', async () => {
  let reported = null;
  const boom = { authenticate: async () => { throw new Error('kunci rahasia bocor di sini'); } };
  const r = await handleAccounts(boom, { method: 'GET', authorization: 'Bearer x', onError: (e) => { reported = e.message; } });
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /rahasia/);
  assert.match(reported, /rahasia/);
});
