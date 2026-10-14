import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { zonedIso, isoToLocal, createClient } = await import('../src/studio/api.js');
const { editorView, SCHEMAS, EDITABLE } = await import('../src/studio/editor.js');
const { SCENE_KINDS } = await import('../src/engine/config.js');

const tick = () => new Promise((r) => setTimeout(r, 0));
const memStore = () => { let v = JSON.stringify({ access_token: 't0k', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-1', email: 'a@b.c' } }); return { get: () => v, set: (x) => { v = x; } }; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('zonedIso/isoToLocal: zona Indonesia dan bolak-balik', () => {
  assert.equal(zonedIso('2026-12-12T08:00', 'Asia/Makassar'), '2026-12-12T00:00:00.000Z');
  assert.equal(zonedIso('2026-12-12T08:00', 'Asia/Jakarta'), '2026-12-12T01:00:00.000Z');
  assert.equal(zonedIso('2026-12-12T08:00', 'Asia/Jayapura'), '2025-12-12T23:00:00.000Z'.replace('2025', '2026').replace('12-12T23', '12-11T23'));
  assert.equal(isoToLocal('2026-12-12T00:00:00.000Z', 'Asia/Makassar'), '2026-12-12T08:00');
  assert.equal(zonedIso('bukan tanggal'), null);
  assert.equal(isoToLocal('rusak'), '');
  const iso = zonedIso('2026-03-01T23:30', 'Asia/Jakarta');
  assert.equal(isoToLocal(iso, 'Asia/Jakarta'), '2026-03-01T23:30');
});

test('saveScene: PATCH adegan milik slug, jenis dikenal, config terbatas', async () => {
  const calls = [];
  const client = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(), fetchImpl: async (u, o) => { calls.push({ u, o }); return res(204, null); } });
  await client.saveScene('rani-dimas', 'kisah', { config: { items: [{ title: 'A' }] }, active: false });
  assert.equal(calls[0].o.method, 'PATCH');
  assert.equal(calls[0].u, 'https://x.supabase.co/rest/v1/invitation_scenes?slug=eq.rani-dimas&kind=eq.kisah');
  assert.deepEqual(JSON.parse(calls[0].o.body), { config: { items: [{ title: 'A' }] }, active: false });
  assert.equal(calls[0].o.headers.Authorization, 'Bearer t0k');
  await assert.rejects(() => client.saveScene('rani-dimas', 'hack', { config: {} }), /tidak dikenal/);
  await assert.rejects(() => client.saveScene('rani-dimas', 'kisah', { config: [] }), /tidak valid/);
  await assert.rejects(() => client.saveScene('rani-dimas', 'kisah', { config: { x: 'y'.repeat(30000) } }), /terlalu besar/);
  assert.equal(calls.length, 1);
});

test('uploadImage: ke bucket media di folder pengguna, hanya JPEG kecil, mengembalikan URL publik https', async () => {
  const calls = [];
  const client = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(), fetchImpl: async (u, o) => { calls.push({ u, o }); return res(200, {}); } });
  const blob = new dom.window.Blob([new Uint8Array(1000)], { type: 'image/jpeg' });
  const url = await client.uploadImage('rani-dimas', blob);
  assert.match(calls[0].u, /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/media\/u-1\/galeri\/rani-dimas\/[0-9a-f-]+\.jpg$/);
  assert.equal(calls[0].o.headers['Content-Type'], 'image/jpeg');
  assert.equal(calls[0].o.headers['x-upsert'], 'false');
  assert.match(url, /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/media\/u-1\/galeri\/rani-dimas\//);
  await assert.rejects(() => client.uploadImage('rani-dimas', new dom.window.Blob(['x'], { type: 'text/html' })), /JPEG/);
  await assert.rejects(() => client.uploadImage('rani-dimas', new dom.window.Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'image/jpeg' })), /besar/);
  assert.equal(calls.length, 1);
});

test('skema editor hanya memuat jenis adegan yang dikenal mesin', () => {
  for (const k of EDITABLE) assert.ok(SCENE_KINDS.includes(k), k);
  for (const k of ['surat', 'cover', 'kisah', 'detail', 'galeri', 'hari_acara', 'arsip', 'penutup']) assert.ok(SCHEMAS[k], k);
});

function fakeClient(over = {}) {
  const saved = [];
  return {
    saved,
    invitationOf: async () => ({ slug: 'rani-dimas', event_type: 'pernikahan', extra: { tz: 'Asia/Makassar' } }),
    scenesOf: async () => [{ kind: 'kisah', position: 3, active: true, config: { tokens: { accent: '#112233' }, items: [{ when: '2019', title: 'Bertemu', text: 'Hujan.' }] } }],
    saveScene: async (slug, kind, v) => { saved.push({ slug, kind, ...v }); },
    uploadImage: async () => 'https://x.supabase.co/storage/v1/object/public/media/u/a.jpg',
    ...over,
  };
}
const form = (root) => root.querySelector('form');
const submit = (f) => f.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
const openTab = (root, label) => [...root.querySelectorAll('.s-tab')].find((b) => b.textContent === label).click();

test('editor: kisah dimuat, baris ditambah, disimpan dengan kunci lain (warna) dipertahankan', async () => {
  const client = fakeClient();
  const root = editorView({ client, slug: 'rani-dimas', inviteBase: 'https://undangan.example/', onBack() {} });
  document.body.append(root);
  await tick(); await tick();
  assert.equal(root.querySelectorAll('.s-tab').length, 9);
  openTab(root, 'Kisah');
  assert.equal(root.querySelectorAll('.s-row-card').length, 1);
  root.querySelector('.s-group > button').click();
  const rows = root.querySelectorAll('.s-row-card');
  assert.equal(rows.length, 2);
  rows[1].querySelectorAll('input[type=text]')[1].value = '  Lamaran\u0000 ';
  submit(form(root)); await tick(); await tick();
  assert.equal(client.saved.length, 1);
  const { kind, config, active } = client.saved[0];
  assert.equal(kind, 'kisah');
  assert.equal(active, true);
  assert.deepEqual(config.tokens, { accent: '#112233' });
  assert.equal(config.items.length, 2);
  assert.equal(config.items[1].title, 'Lamaran');
  assert.match(root.querySelector('.s-msg').textContent, /Tersimpan/);
  assert.match(root.querySelector('a[target=_blank]').getAttribute('href'), /^https:\/\/undangan\.example\/\?slug=rani-dimas&preview=1$/);
});

test('editor: link non-https ditolak dan tidak disimpan; acara memakai zona undangan', async () => {
  const client = fakeClient();
  const root = editorView({ client, slug: 'rani-dimas', inviteBase: 'https://u.example', onBack() {} });
  document.body.append(root);
  await tick(); await tick();
  openTab(root, 'Detail acara');
  root.querySelector('.s-group > button').click();
  const card = root.querySelector('.s-row-card');
  const url = card.querySelector('input[type=url]');
  url.value = 'javascript:alert(1)';
  submit(form(root)); await tick();
  assert.equal(client.saved.length, 0);
  assert.match(root.querySelector('.s-msg').textContent, /https/);
  url.value = 'https://maps.example/x';
  card.querySelector('input[type=datetime-local]').value = '2026-12-12T08:00';
  submit(form(root)); await tick(); await tick();
  assert.equal(client.saved.length, 1);
  assert.equal(client.saved[0].config.events[0].start, '2026-12-12T00:00:00.000Z');
  assert.equal(client.saved[0].config.events[0].mapUrl, 'https://maps.example/x');
});

test('editor: galeri menerima link https, menolak selain itu, bisa menghapus', async () => {
  const client = fakeClient();
  const root = editorView({ client, slug: 'rani-dimas', inviteBase: 'https://u.example', onBack() {} });
  document.body.append(root);
  await tick(); await tick();
  openTab(root, 'Galeri');
  const link = root.querySelector('input[type=url]');
  link.value = 'http://tidak-aman.example/a.jpg';
  link.dispatchEvent(new dom.window.Event('change'));
  assert.equal(root.querySelectorAll('.s-photo').length, 0);
  link.value = 'https://foto.example/a.jpg';
  link.dispatchEvent(new dom.window.Event('change'));
  assert.equal(root.querySelectorAll('.s-photo').length, 1);
  submit(form(root)); await tick(); await tick();
  assert.equal(client.saved[0].config.images[0].src, 'https://foto.example/a.jpg');
  root.querySelector('.s-photo .s-row button:last-child').click();
  assert.equal(root.querySelectorAll('.s-photo').length, 0);
});

test('editor: gagal memuat menampilkan pesan, bukan error liar', async () => {
  const root = editorView({ client: fakeClient({ scenesOf: async () => { throw new Error('Tidak punya izin.'); } }), slug: 'x-y', inviteBase: '', onBack() {} });
  document.body.append(root);
  await tick(); await tick();
  assert.match(root.querySelector('.s-msg').textContent, /izin/);
});
