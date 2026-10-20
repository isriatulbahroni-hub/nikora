import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://undangan.example/studio' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { adminView } = await import('../src/studio/admin.js');
const { createAdminApi, randomPassword } = await import('../src/studio/admin-api.js');
const { shellView, NAV } = await import('../src/studio/shell.js');
const { parseRoute } = await import('../src/studio/route.js');

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));

function fakeApi({ me, accounts }) {
  const calls = [];
  return {
    calls,
    api: {
      list: async () => ({ me, accounts }),
      create: async (b) => { calls.push(['create', b]); return { account: { id: 'n', email: b.email.trim().toLowerCase(), role: b.makeAdmin ? 'admin' : 'klien' } }; },
      setActive: async (id, active) => { calls.push(['active', id, active]); },
      setPassword: async (id, password) => { calls.push(['password', id, password]); },
    },
  };
}
const ACCOUNTS = [
  { id: 'me', email: 'admin@x.id', role: 'admin', active: true, invitations: 0 },
  { id: 'k1', email: 'klien@x.id', role: 'klien', active: true, invitations: 2 },
  { id: 'a2', email: 'admin2@x.id', role: 'admin', active: true, invitations: 0 },
  { id: 'o1', email: 'owner@x.id', role: 'owner', active: true, invitations: 0 },
];
const rowOf = (v, email) => [...v.querySelectorAll('.s-guest')].find((li) => li.querySelector('strong').textContent === email);
const buttonsOf = (li) => [...li.querySelectorAll('button')].map((b) => b.textContent);
const mount = async (role, me, accounts = ACCOUNTS) => {
  const f = fakeApi({ me, accounts });
  const v = adminView({ api: f.api, role });
  document.body.append(v);
  await tick();
  return { v, f };
};

test('admin biasa: daftar akun lengkap, hanya klien yang bisa dikelola, tidak ada opsi membuat admin', async () => {
  const { v } = await mount('admin', { id: 'me', role: 'admin' });
  assert.equal(v.querySelectorAll('.s-guest').length, 4);
  assert.match(rowOf(v, 'klien@x.id').textContent, /Klien - 2 undangan - aktif/);
  assert.deepEqual(buttonsOf(rowOf(v, 'klien@x.id')), ['Nonaktifkan', 'Atur ulang sandi']);
  for (const e of ['admin@x.id', 'admin2@x.id', 'owner@x.id']) assert.deepEqual(buttonsOf(rowOf(v, e)), [], e);
  assert.equal(v.querySelector('[name=makeAdmin]'), null);
  v.remove();
});

test('owner: ada opsi jadikan admin dan bisa mengelola admin lain, bukan dirinya dan bukan owner', async () => {
  const { v } = await mount('owner', { id: 'o1', role: 'owner' });
  assert.ok(v.querySelector('[name=makeAdmin]'));
  assert.equal(v.querySelector('[name=makeAdmin]').classList.contains('s-input'), false);
  assert.deepEqual(buttonsOf(rowOf(v, 'admin2@x.id')), ['Nonaktifkan', 'Atur ulang sandi']);
  assert.deepEqual(buttonsOf(rowOf(v, 'klien@x.id')), ['Nonaktifkan', 'Atur ulang sandi']);
  assert.deepEqual(buttonsOf(rowOf(v, 'owner@x.id')), []);
  v.remove();
});

test('buat akun: dikirim ke server, data masuk tampil sekali, formulir dikosongkan', async () => {
  const { v, f } = await mount('admin', { id: 'me', role: 'admin' });
  v.querySelector('[name=email]').value = 'Baru@X.id';
  v.querySelector('[name=password]').value = 'sandi-aman-1';
  submit(v.querySelector('form')); await tick();
  assert.deepEqual(f.calls[0], ['create', { email: 'Baru@X.id', password: 'sandi-aman-1', makeAdmin: false }]);
  const shown = v.querySelector('code').textContent;
  assert.match(shown, /Email: baru@x\.id/);
  assert.match(shown, /Kata sandi: sandi-aman-1/);
  assert.match(shown, /Masuk: https:\/\/undangan\.example\/studio/);
  assert.equal(v.querySelector('[name=password]').value, '');
  assert.equal(v.querySelector('[name=email]').value, '');
  assert.equal(v.querySelector('button[type=submit]').disabled, false);
  v.remove();
});

test('buat akun oleh owner dengan opsi admin mengirim makeAdmin; admin biasa tidak bisa mengirimnya', async () => {
  const { v, f } = await mount('owner', { id: 'o1', role: 'owner' });
  v.querySelector('[name=email]').value = 'staf@x.id';
  v.querySelector('[name=password]').value = 'sandi-aman-1';
  v.querySelector('[name=makeAdmin]').checked = true;
  submit(v.querySelector('form')); await tick();
  assert.equal(f.calls[0][1].makeAdmin, true);
  assert.match(v.querySelector('code').textContent, /Email: staf@x\.id/);
  v.remove();
});

test('galat dari server tampil sebagai pesan, tombol aktif lagi, tidak ada data masuk yang ditampilkan', async () => {
  const f = fakeApi({ me: { id: 'me' }, accounts: ACCOUNTS });
  f.api.create = async () => { throw new Error('Email ini sudah terdaftar.'); };
  const v = adminView({ api: f.api, role: 'admin' });
  document.body.append(v);
  await tick();
  v.querySelector('[name=email]').value = 'ada@x.id';
  v.querySelector('[name=password]').value = 'sandi-aman-1';
  submit(v.querySelector('form')); await tick();
  assert.match(v.querySelector('.s-msg').textContent, /sudah terdaftar/);
  assert.equal(v.querySelector('button[type=submit]').disabled, false);
  assert.equal(v.querySelector('code'), null);
  v.remove();
});

test('nonaktifkan: batal di konfirmasi tidak memanggil server; setuju memanggil dan memuat ulang', async () => {
  const { v, f } = await mount('admin', { id: 'me', role: 'admin' });
  window.confirm = () => false;
  [...rowOf(v, 'klien@x.id').querySelectorAll('button')].find((b) => b.textContent === 'Nonaktifkan').click();
  await tick();
  assert.deepEqual(f.calls, []);
  window.confirm = () => true;
  [...rowOf(v, 'klien@x.id').querySelectorAll('button')].find((b) => b.textContent === 'Nonaktifkan').click();
  await tick();
  assert.deepEqual(f.calls, [['active', 'k1', false]]);
  v.remove();
});

test('atur ulang sandi: sandi acak dikirim ke server lalu ditampilkan sekali', async () => {
  const { v, f } = await mount('admin', { id: 'me', role: 'admin' });
  window.confirm = () => true;
  [...rowOf(v, 'klien@x.id').querySelectorAll('button')].find((b) => b.textContent === 'Atur ulang sandi').click();
  await tick();
  const [kind, id, pw] = f.calls[0];
  assert.deepEqual([kind, id], ['password', 'k1']);
  assert.equal(pw.length, 12);
  assert.ok(v.querySelector('code').textContent.includes(`Kata sandi: ${pw}`));
  assert.match(v.querySelector('code').textContent, /Email: klien@x\.id/);
  v.remove();
});

test('gagal memuat daftar: pesan galat tampil, bukan crash', async () => {
  const v = adminView({ api: { list: async () => { throw new Error('Hanya admin yang boleh melakukan ini.'); } }, role: 'admin' });
  document.body.append(v);
  await tick();
  assert.match(v.querySelector('.s-msg').textContent, /Hanya admin/);
  v.remove();
});

test('randomPassword: panjang tepat, tanpa karakter yang mirip, berbeda tiap kali, menolak tanpa crypto', () => {
  const a = randomPassword();
  assert.equal(a.length, 12);
  assert.match(a, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  assert.notEqual(a, randomPassword());
  assert.equal(randomPassword(20).length, 20);
  assert.throws(() => randomPassword(12, null), /acak/);
});

test('createAdminApi: membawa token sesi, mengirim JSON, galat server menjadi pesan', async () => {
  const seen = [];
  const client = { accessToken: async () => 'tok-1' };
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (init.method === 'PATCH') return { ok: false, status: 403, json: async () => ({ message: 'Hanya admin yang boleh melakukan ini.' }) };
    if (init.method === 'DELETE') return { ok: false, status: 500, json: async () => { throw new Error('bukan json'); } };
    return { ok: true, status: 200, json: async () => ({ accounts: [], me: {} }) };
  };
  const api = createAdminApi({ client, fetchImpl });
  await api.list();
  assert.equal(seen[0].url, '/api/admin/accounts');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer tok-1');
  assert.equal(seen[0].init.body, undefined);
  await assert.rejects(() => api.setActive('k1', false), /Hanya admin/);
  assert.deepEqual(JSON.parse(seen[1].init.body), { id: 'k1', active: false });
  await api.create({ email: 'a@x.id', password: 'sandi-aman-1' });
  assert.deepEqual(JSON.parse(seen[2].init.body), { email: 'a@x.id', password: 'sandi-aman-1', makeAdmin: false });
  await assert.rejects(() => createAdminApi({ client, fetchImpl: async () => ({ ok: false, status: 500, json: async () => { throw new Error('x'); } }) }).list(), /gagal \(500\)/);
});

test('menu Admin: tersembunyi untuk pelanggan, muncul tepat sebelum Pengaturan untuk staf', () => {
  const hrefs = (el) => [...el.querySelectorAll('.st-nav-item')].map((a) => a.getAttribute('href'));
  const plain = shellView({ active: 'dashboard', email: 'a@b.c', onSignOut() {}, content: null });
  assert.equal(hrefs(plain).length, NAV.length);
  assert.ok(!hrefs(plain).includes('#/admin'));
  const staff = shellView({ active: 'admin', email: 'a@b.c', onSignOut() {}, content: null, isAdmin: true });
  const labels = [...staff.querySelectorAll('.st-nav-item span')].map((s) => s.textContent);
  assert.deepEqual(labels, ['Dashboard', 'Tamu', 'Check-in', 'Editor', 'Template', 'Admin', 'Pengaturan', 'Bantuan']);
  assert.equal(staff.querySelectorAll('.st-bnav-item').length, NAV.length + 1);
  assert.equal(staff.querySelector('.st-nav-item.is-active').getAttribute('href'), '#/admin');
});

test('rute: #/admin dikenal; alamat tak dikenal tetap ke dashboard', () => {
  assert.equal(parseRoute('#/admin').page, 'admin');
  assert.equal(parseRoute('#/adminx').page, 'dashboard');
});
