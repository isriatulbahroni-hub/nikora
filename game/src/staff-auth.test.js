import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAdminHeader } from './admin-stats.js';
import { authStatus, authorizeAdmin, createAccount, signInWithPassword, staffFromToken } from './staff-auth.js';

const SECRET = 'rahasia-induk-untuk-uji-0123456789';
const ENV = { SUPABASE_URL: 'https://proj.supabase.co/', SUPABASE_ANON_KEY: 'anon-key-0123456789', SUPABASE_SERVICE_ROLE_KEY: 'service-key-0123456789', EVENT_ROLE_SECRET: SECRET };
const ENV_NO_SERVICE = { SUPABASE_URL: ENV.SUPABASE_URL, SUPABASE_ANON_KEY: ENV.SUPABASE_ANON_KEY, EVENT_ROLE_SECRET: SECRET };
const UID = '11111111-1111-4111-8111-111111111111';
const NEW_UID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'eyJ'.padEnd(40, 'x');

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fake(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return handler(call);
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------- masuk
test('signInWithPassword: sukses mengembalikan token dan waktu habis; memakai kunci anon dan tidak membawa refresh token', async () => {
  const fetchImpl = fake(() => reply(200, { access_token: TOKEN, refresh_token: 'rahasia-refresh', expires_in: 3600 }));
  const r = await signInWithPassword(' Admin@Contoh.com ', 'sandi-rahasia', { env: ENV, fetchImpl, now: 1_000_000 });
  assert.equal(r.ok, true);
  assert.equal(r.accessToken, TOKEN);
  assert.equal(r.expiresAt, 1_000_000 + 3_600_000);
  assert.equal('refreshToken' in r, false);
  const [call] = fetchImpl.calls;
  assert.equal(call.url, 'https://proj.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.apikey, ENV.SUPABASE_ANON_KEY);
  assert.deepEqual(call.body, { email: 'admin@contoh.com', password: 'sandi-rahasia' });
});

test('signInWithPassword: waktu habis absolut dari Supabase dipakai bila ada', async () => {
  const r = await signInWithPassword('a@b.co', 'x', { env: ENV, fetchImpl: fake(() => reply(200, { access_token: TOKEN, expires_at: 2_000_000_000 })), now: 5 });
  assert.equal(r.expiresAt, 2_000_000_000_000);
});

test('signInWithPassword: kegagalan dipetakan ke alasan yang jelas', async () => {
  const err = async (res, env = ENV, email = 'a@b.co', pass = 'x') => (await signInWithPassword(email, pass, { env, fetchImpl: fake(() => res) })).error;
  assert.equal(await err(reply(400, { error_code: 'invalid_credentials' })), 'invalid_credentials');
  assert.equal(await err(reply(429, {})), 'rate_limited');
  assert.equal(await err(reply(503, {})), 'upstream');
  assert.equal(await err(reply(200, { aneh: true })), 'invalid_credentials');
  assert.equal(await err(reply(200, {}), {}), 'not_configured');
  const down = fake(() => { throw new TypeError('fetch failed'); });
  assert.equal((await signInWithPassword('a@b.co', 'x', { env: ENV, fetchImpl: down })).error, 'network');
  const never = fake(() => assert.fail('tidak boleh memanggil Supabase'));
  assert.equal((await signInWithPassword('bukan-email', 'x', { env: ENV, fetchImpl: never })).error, 'invalid_credentials');
  assert.equal((await signInWithPassword('a@b.co', '', { env: ENV, fetchImpl: never })).error, 'invalid_credentials');
});

// ---------------------------------------------------------------- peran staf
const staffRoute = (rows, userStatus = 200) => (c) => (c.url.endsWith('/auth/v1/user')
  ? (userStatus === 200 ? reply(200, { id: UID, email: 'adm@x.co' }) : reply(userStatus, {}))
  : reply(200, rows));

test('staffFromToken: staf aktif dikenali; peran dibaca dengan kunci service bila ada', async () => {
  const fetchImpl = fake(staffRoute([{ role: 'admin', permissions: ['x', 5], active: true }]));
  const r = await staffFromToken(TOKEN, { env: ENV, fetchImpl });
  assert.deepEqual(r, { ok: true, userId: UID, email: 'adm@x.co', role: 'admin', permissions: ['x'] });
  assert.equal(fetchImpl.calls[0].url, 'https://proj.supabase.co/auth/v1/user');
  assert.equal(fetchImpl.calls[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(fetchImpl.calls[0].headers.apikey, ENV.SUPABASE_ANON_KEY);
  assert.equal(fetchImpl.calls[1].url, `https://proj.supabase.co/rest/v1/staff?select=role,permissions,active&user_id=eq.${UID}&limit=1`);
  assert.equal(fetchImpl.calls[1].headers.authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
});

test('staffFromToken: tanpa kunci service, peran dibaca dengan token pengguna sendiri (RLS)', async () => {
  const fetchImpl = fake(staffRoute([{ role: 'owner', permissions: [], active: true }]));
  const r = await staffFromToken(TOKEN, { env: ENV_NO_SERVICE, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.role, 'owner');
  assert.equal(fetchImpl.calls[1].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(fetchImpl.calls[1].headers.apikey, ENV.SUPABASE_ANON_KEY);
});

test('staffFromToken: bukan staf, nonaktif, peran asing, token buruk, dan galat layanan ditolak', async () => {
  const why = async (handler, token = TOKEN, env = ENV) => (await staffFromToken(token, { env, fetchImpl: fake(handler) })).error;
  assert.equal(await why(staffRoute([])), 'not_staff');
  assert.equal(await why(staffRoute([{ role: 'admin', active: false }])), 'not_staff');
  assert.equal(await why(staffRoute([{ role: 'superuser', active: true }])), 'not_staff');
  assert.equal(await why(staffRoute([], 401)), 'unauthorized');
  assert.equal(await why(staffRoute([], 503)), 'upstream');
  assert.equal(await why((c) => (c.url.endsWith('/auth/v1/user') ? reply(200, { id: UID }) : reply(403, {}))), 'upstream');
  assert.equal(await why((c) => (c.url.endsWith('/auth/v1/user') ? reply(200, { id: "1; drop table staff" }) : reply(200, []))), 'unauthorized', 'id pengguna harus UUID');
  assert.equal(await why(() => assert.fail('tidak boleh memanggil'), 'pendek'), 'unauthorized');
  assert.equal(await why(() => assert.fail('tidak boleh memanggil'), TOKEN, {}), 'not_configured');
});

// ---------------------------------------------------------------- authorizeAdmin
test('authorizeAdmin: Bearer = akun staf, header Admin = rahasia induk (developer), selain itu ditolak', async () => {
  const NOW = 1_800_000_000_000;
  const fetchImpl = fake(staffRoute([{ role: 'admin', permissions: [], active: true }]));
  const staff = await authorizeAdmin(`Bearer ${TOKEN}`, { env: ENV, now: NOW, fetchImpl });
  assert.deepEqual({ ok: staff.ok, via: staff.via, role: staff.role, userId: staff.userId }, { ok: true, via: 'staff', role: 'admin', userId: UID });

  const dev = await authorizeAdmin(makeAdminHeader(SECRET, NOW), { env: ENV, now: NOW, fetchImpl });
  assert.deepEqual({ ok: dev.ok, via: dev.via, role: dev.role, userId: dev.userId }, { ok: true, via: 'secret', role: 'owner', userId: null });

  assert.deepEqual(await authorizeAdmin('Admin 123.abc', { env: ENV, now: NOW, fetchImpl }), { ok: false, reason: 'unauthorized' });
  assert.deepEqual(await authorizeAdmin(undefined, { env: ENV, now: NOW, fetchImpl }), { ok: false, reason: 'unauthorized' });
  assert.deepEqual(await authorizeAdmin(makeAdminHeader(SECRET, NOW - 10 * 60_000), { env: ENV, now: NOW, fetchImpl }), { ok: false, reason: 'expired' });
  assert.deepEqual(await authorizeAdmin('Admin 1.x', { env: { ...ENV, EVENT_ROLE_SECRET: '' }, now: NOW, fetchImpl }), { ok: false, reason: 'not_configured' });
  const notStaff = await authorizeAdmin(`Bearer ${TOKEN}`, { env: ENV, now: NOW, fetchImpl: fake(staffRoute([])) });
  assert.deepEqual(notStaff, { ok: false, reason: 'not_staff' });
});

test('authStatus: alasan -> kode HTTP', () => {
  assert.equal(authStatus('not_configured'), 503);
  assert.equal(authStatus('service_key_missing'), 503);
  assert.equal(authStatus('not_staff'), 403);
  assert.equal(authStatus('forbidden'), 403);
  assert.equal(authStatus('rate_limited'), 429);
  assert.equal(authStatus('network'), 502);
  assert.equal(authStatus('upstream'), 502);
  assert.equal(authStatus('expired'), 401);
  assert.equal(authStatus('unauthorized'), 401);
  assert.equal(authStatus('invalid_credentials'), 401);
});

// ---------------------------------------------------------------- buat akun
const ADMIN = { ok: true, via: 'staff', userId: UID, email: 'adm@x.co', role: 'admin', permissions: [] };
const OWNER = { ...ADMIN, role: 'owner' };
const SECRET_ACTOR = { ok: true, via: 'secret', userId: null, email: null, role: 'owner', permissions: [] };

const supa = (over = {}) => fake((c) => {
  if (c.url.endsWith('/auth/v1/admin/users') && c.method === 'POST') return over.create ?? reply(200, { id: NEW_UID, email: c.body.email });
  if (c.url.endsWith('/rest/v1/staff')) return over.staff ?? reply(201, null);
  if (c.url.endsWith('/rest/v1/audit_logs')) return reply(201, null);
  if (c.method === 'DELETE') return reply(200, {});
  return reply(404, {});
});
const find = (f, pred) => f.calls.find(pred);

test('createAccount: admin membuat akun pemilik acara; email dirapikan, sandi tidak masuk audit', async () => {
  const f = supa();
  const r = await createAccount({ email: ' Pemilik@X.co ', password: 'sandi-awal-1', kind: 'pemilik' }, ADMIN, { env: ENV, fetchImpl: f });
  assert.deepEqual(r, { ok: true, status: 201, id: NEW_UID, email: 'pemilik@x.co', kind: 'pemilik' });
  const create = find(f, (c) => c.url.endsWith('/auth/v1/admin/users'));
  assert.deepEqual(create.body, { email: 'pemilik@x.co', password: 'sandi-awal-1', email_confirm: true });
  assert.equal(create.headers.authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
  assert.equal(find(f, (c) => c.url.endsWith('/rest/v1/staff')), undefined, 'pemilik bukan staf');
  const audit = find(f, (c) => c.url.endsWith('/rest/v1/audit_logs'));
  assert.equal(audit.body.action, 'buat_akun');
  assert.equal(audit.body.actor_id, UID);
  assert.equal(audit.body.target_id, NEW_UID);
  assert.equal(JSON.stringify(audit.body).includes('sandi-awal-1'), false, 'sandi tidak boleh dicatat');
});

test('createAccount: jenis akun dibatasi menurut peran pemanggil', async () => {
  const attempt = async (actor, kind) => {
    const f = supa();
    const r = await createAccount({ email: 'baru@x.co', password: 'sandi-awal-1', kind }, actor, { env: ENV, fetchImpl: f });
    return { r, f };
  };
  const adminMakesAdmin = await attempt(ADMIN, 'admin');
  assert.deepEqual(adminMakesAdmin.r, { ok: false, status: 403, error: 'forbidden' });
  assert.equal(adminMakesAdmin.f.calls.length, 0, 'ditolak sebelum menyentuh Supabase');

  const ownerMakesAdmin = await attempt(OWNER, 'admin');
  assert.equal(ownerMakesAdmin.r.ok, true);
  const row = find(ownerMakesAdmin.f, (c) => c.url.endsWith('/rest/v1/staff')).body;
  assert.deepEqual(row, { user_id: NEW_UID, role: 'admin', permissions: [], active: true, created_by: UID });
  assert.equal(find(ownerMakesAdmin.f, (c) => c.url.endsWith('/rest/v1/audit_logs')).body.action, 'buat_admin');

  const ownerMakesDev = await attempt(OWNER, 'developer');
  assert.equal(ownerMakesDev.r.status, 403, 'developer baru hanya lewat rahasia induk');

  const secretMakesDev = await attempt(SECRET_ACTOR, 'developer');
  assert.equal(secretMakesDev.r.ok, true);
  assert.deepEqual(find(secretMakesDev.f, (c) => c.url.endsWith('/rest/v1/staff')).body, { user_id: NEW_UID, role: 'owner', permissions: [], active: true, created_by: null });
  const audit = find(secretMakesDev.f, (c) => c.url.endsWith('/rest/v1/audit_logs')).body;
  assert.equal(audit.action, 'buat_developer');
  assert.equal(audit.actor_email, 'rahasia-induk');

  assert.equal((await attempt(null, 'pemilik')).r.status, 403);
  assert.equal((await attempt({ ok: false, reason: 'unauthorized' }, 'pemilik')).r.status, 403);
  assert.equal((await attempt(ADMIN, 'dewa')).r.error, 'invalid_kind');
});

test('createAccount: masukan tidak valid ditolak sebelum menyentuh Supabase', async () => {
  const bad = async (input, env = ENV) => {
    const f = supa();
    const r = await createAccount(input, ADMIN, { env, fetchImpl: f });
    assert.equal(f.calls.length, 0);
    return r;
  };
  assert.deepEqual(await bad({ email: 'bukan-email', password: 'sandi-awal-1' }), { ok: false, status: 400, error: 'invalid_email' });
  assert.deepEqual(await bad({ email: '', password: 'sandi-awal-1' }), { ok: false, status: 400, error: 'invalid_email' });
  assert.deepEqual(await bad({ email: 'a@b.co', password: '1234567' }), { ok: false, status: 400, error: 'weak_password' });
  assert.deepEqual(await bad({ email: 'a@b.co', password: 'x'.repeat(73) }), { ok: false, status: 400, error: 'weak_password' });
  assert.deepEqual(await bad({ email: 'a@b.co', password: 12345678 }), { ok: false, status: 400, error: 'weak_password' });
  assert.deepEqual(await bad({ email: 'a@b.co', password: 'sandi-awal-1' }, ENV_NO_SERVICE), { ok: false, status: 503, error: 'service_key_missing' });
});

test('createAccount: galat Supabase dipetakan; gagal menjadikan staf membatalkan akun yang baru dibuat', async () => {
  const run = async (over, actor = OWNER, kind = 'pemilik') => {
    const f = supa(over);
    const r = await createAccount({ email: 'baru@x.co', password: 'sandi-awal-1', kind }, actor, { env: ENV, fetchImpl: f });
    return { r, f };
  };
  assert.deepEqual((await run({ create: reply(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' }) })).r, { ok: false, status: 409, error: 'email_exists' });
  assert.deepEqual((await run({ create: reply(422, { error_code: 'weak_password' }) })).r, { ok: false, status: 400, error: 'weak_password' });
  assert.deepEqual((await run({ create: reply(400, { msg: 'Email address is invalid' }) })).r, { ok: false, status: 400, error: 'rejected' });
  assert.deepEqual((await run({ create: reply(500, {}) })).r, { ok: false, status: 502, error: 'upstream' });
  assert.deepEqual((await run({ create: reply(200, { id: 'bukan-uuid' }) })).r, { ok: false, status: 502, error: 'upstream' });
  const down = await createAccount({ email: 'baru@x.co', password: 'sandi-awal-1' }, ADMIN, { env: ENV, fetchImpl: fake(() => { throw new TypeError('x'); }) });
  assert.deepEqual(down, { ok: false, status: 502, error: 'network' });

  const rollback = await run({ staff: reply(409, { code: '23505' }) }, OWNER, 'admin');
  assert.deepEqual(rollback.r, { ok: false, status: 502, error: 'staff_insert_failed' });
  const del = find(rollback.f, (c) => c.method === 'DELETE');
  assert.equal(del.url, `https://proj.supabase.co/auth/v1/admin/users/${NEW_UID}`);
  assert.equal(find(rollback.f, (c) => c.url.endsWith('/rest/v1/audit_logs')), undefined, 'tidak ada audit untuk akun yang dibatalkan');
});
