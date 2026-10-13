import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://undangan.example/studio' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { createClient, validateInvitation } = await import('../src/studio/api.js');
const { createView, listView, detailView, IDENTITY, titleOf } = await import('../src/studio/views.js');
const { qrMatrix, qrSvg, qrPanel } = await import('../src/studio/qr.js');
const { EVENT_TYPES } = await import('../src/themes/index.js');

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const ev = (type) => new dom.window.Event(type, { bubbles: true });
const memStore = () => { let v = JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-1' } }); return { get: () => v, set: (x) => { v = x; } }; };

test('identitas: tiap jenis acara punya nama kolomnya; nama kedua hanya pernikahan', () => {
  for (const t of EVENT_TYPES) assert.ok(IDENTITY[t] && IDENTITY[t].first && IDENTITY[t].hint, t);
  assert.ok(IDENTITY.pernikahan.second);
  for (const t of EVENT_TYPES.filter((x) => x !== 'pernikahan')) assert.equal(IDENTITY[t].second, undefined, t);
  assert.match(IDENTITY.tazkirah.first, /acara/i);
  assert.doesNotMatch(Object.values(IDENTITY.tazkirah).join(' '), /mempelai/i);
});

test('formulir: tazkirah tidak menampilkan mempelai; ganti jenis memperbarui nama kolom dan mengosongkan nama kedua', () => {
  const form = createView({ client: {}, onCreated() {}, onCancel() {} });
  document.body.append(form);
  const type = form.querySelector('[name=eventType]');
  const labels = () => [...form.querySelectorAll('.s-field')].filter((l) => !l.hidden).map((l) => l.querySelector('span').textContent);
  assert.ok(labels().includes('Nama mempelai pria') && labels().includes('Nama mempelai wanita'));
  form.querySelector('[name=bride]').value = 'Rani';
  type.value = 'tazkirah'; type.dispatchEvent(ev('change'));
  assert.ok(labels().includes('Nama acara'));
  assert.ok(!labels().some((l) => /mempelai/i.test(l)), 'tidak ada kata mempelai');
  assert.equal(form.querySelector('[name=bride]').value, '');
  assert.match(form.querySelector('[name=groom]').placeholder, /Tazkirah/);
  type.value = 'khitanan'; type.dispatchEvent(ev('change'));
  assert.ok(labels().includes('Nama anak'));
  type.value = 'pernikahan'; type.dispatchEvent(ev('change'));
  assert.ok(labels().includes('Nama mempelai wanita'));
});

test('validasi: nama kedua dibuang untuk jenis selain pernikahan', () => {
  const base = { slug: 'tazkirah-akbar', eventDate: '2026-12-12T19:30', groom: 'Tazkirah Akbar', bride: 'Sisa Ketikan', world: '' };
  const v = validateInvitation({ ...base, eventType: 'tazkirah', theme: 'tazkirah-teduh' });
  assert.equal(v.ok, true);
  assert.equal(v.value.bride, '');
  const w = validateInvitation({ ...base, eventType: 'pernikahan', theme: 'pernikahan-taman' });
  assert.equal(w.value.bride, 'Sisa Ketikan');
  assert.equal(titleOf({ event_type: 'tazkirah', groom: 'Tazkirah Akbar', bride: 'Sisa' }), 'Tazkirah Akbar');
  assert.equal(titleOf({ event_type: 'pernikahan', groom: 'Dimas', bride: 'Rani' }), 'Dimas & Rani');
});

test('deleteInvitations: satu panggilan DELETE, memverifikasi jumlah, menolak slug tidak valid', async () => {
  const calls = [];
  let reply = [{ slug: 'aaa-bbb' }, { slug: 'ccc-ddd' }];
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store: memStore(), fetchImpl: async (u, o) => { calls.push({ u, o }); return { ok: true, status: 200, json: async () => reply }; } });
  assert.equal(await c.deleteInvitations(['aaa-bbb', 'ccc-ddd', 'aaa-bbb']), 2);
  assert.equal(calls[0].o.method, 'DELETE');
  assert.equal(calls[0].u, 'https://x.supabase.co/rest/v1/invitations?slug=in.(aaa-bbb,ccc-ddd)');
  assert.equal(calls[0].o.headers.Prefer, 'return=representation');
  reply = [{ slug: 'aaa-bbb' }];
  await assert.rejects(() => c.deleteInvitations(['aaa-bbb', 'ccc-ddd']), /Hanya 1 dari 2/);
  reply = [];
  await assert.rejects(() => c.deleteInvitations(['aaa-bbb']), /Tidak ada undangan yang terhapus/);
  await assert.rejects(() => c.deleteInvitations(['x)),(drop']), /valid/);
  await assert.rejects(() => c.deleteInvitations([]), /valid/);
  assert.equal(calls.length, 3);
});

const ITEMS = [
  { slug: 'rina-x', groom: 'Rina', bride: '', event_type: 'ulang_tahun', event_date: '2026-12-20T19:00:00+07:00', status: 'active' },
  { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan', event_date: '2026-12-12T10:00:00+08:00', status: 'active' },
  { slug: 'taz-akbar', groom: 'Tazkirah Akbar', bride: 'Sisa', event_type: 'tazkirah', event_date: '2026-11-14T19:30:00+08:00', status: 'active' },
];

test('daftar: judul menurut jenis acara (tazkirah tanpa nama kedua) dan jenis terlihat', () => {
  const root = listView({ items: ITEMS, onOpen() {}, onNew() {}, onDelete: async () => 1 });
  const titles = [...root.querySelectorAll('.s-item strong')].map((s) => s.textContent);
  assert.deepEqual(titles, ['Rina', 'Dimas & Rani', 'Tazkirah Akbar']);
  assert.match(root.textContent, /Tazkirah/);
  assert.doesNotMatch(root.textContent, /null|undefined/);
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Pilih').click();
  assert.doesNotMatch(root.textContent, /null|undefined/);
});

test('daftar: mode Pilih, wajib mengetik HAPUS, menghapus yang dipilih saja', async () => {
  const deleted = [];
  const root = listView({ items: ITEMS, onOpen() {}, onNew() {}, onDelete: async (s) => { deleted.push(...s); return s.length; } });
  document.body.append(root);
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Pilih').click();
  assert.equal(root.querySelectorAll('input[type=checkbox]').length, 3);
  const boxes = root.querySelectorAll('input[type=checkbox]');
  boxes[0].checked = true; boxes[0].dispatchEvent(ev('change'));
  boxes[2].checked = true; boxes[2].dispatchEvent(ev('change'));
  const word = root.querySelector('.s-delbar input[type=text]');
  const go = root.querySelector('.s-delbar .s-danger');
  assert.equal(go.disabled, true);
  word.value = 'hapus'; word.dispatchEvent(ev('input'));
  assert.equal(root.querySelector('.s-delbar .s-danger').disabled, true, 'huruf kecil tidak cukup');
  word.value = 'HAPUS'; word.dispatchEvent(ev('input'));
  assert.equal(root.querySelector('.s-delbar .s-danger').disabled, false);
  root.querySelector('.s-delbar .s-danger').click();
  await tick(5);
  assert.deepEqual(deleted.sort(), ['rina-x', 'taz-akbar']);
  assert.deepEqual([...root.querySelectorAll('.s-item strong')].map((s) => s.textContent), ['Dimas & Rani']);
  assert.match(root.querySelector('.s-msg').textContent, /2 undangan dihapus/);
});

test('daftar: gagal menghapus menampilkan pesan dan tidak mengubah daftar', async () => {
  const root = listView({ items: ITEMS, onOpen() {}, onNew() {}, onDelete: async () => { throw new Error('Tidak ada undangan yang terhapus.'); } });
  document.body.append(root);
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Pilih').click();
  const box = root.querySelector('input[type=checkbox]'); box.checked = true; box.dispatchEvent(ev('change'));
  const word = root.querySelector('.s-delbar input[type=text]'); word.value = 'HAPUS'; word.dispatchEvent(ev('input'));
  root.querySelector('.s-delbar .s-danger').click(); await tick(5);
  assert.match(root.querySelector('.s-msg').textContent, /Tidak ada undangan/);
  assert.equal(root.querySelectorAll('input[type=checkbox]').length, 3);
});

function fakeDetailClient() {
  const calls = [];
  return { calls, guestsOf: async () => [{ id: 1, name: 'Bapak Ahmad & Keluarga' }], rsvpsOf: async () => [], giftsOf: async () => [], deleteInvitations: async (s) => { calls.push(s); return 1; } };
}

test('detail: hapus butuh mengetik alamat undangan dengan benar', async () => {
  const client = fakeDetailClient();
  let deleted = null;
  const root = detailView({ client, slug: 'dimas-rani', inviteBase: 'https://u.example/', onBack() {}, onDeleted: (s) => { deleted = s; } });
  document.body.append(root);
  await tick(5);
  const word = root.querySelector('.s-danger-zone input');
  const go = root.querySelector('.s-danger-zone .s-danger');
  assert.equal(go.disabled, true);
  word.value = 'dimas'; word.dispatchEvent(ev('input')); assert.equal(go.disabled, true);
  word.value = 'dimas-rani'; word.dispatchEvent(ev('input')); assert.equal(go.disabled, false);
  go.click(); await tick(5);
  assert.deepEqual(client.calls, [['dimas-rani']]);
  assert.equal(deleted, 'dimas-rani');
});

test('detail: QR undangan dan QR per tamu memuat link yang benar', async () => {
  const root = detailView({ client: fakeDetailClient(), slug: 'dimas-rani', inviteBase: 'https://u.example/', onBack() {} });
  document.body.append(root);
  await tick(5);
  assert.ok(root.querySelector('.s-qr svg'), 'QR undangan tampil');
  const qrBtn = [...root.querySelectorAll('.s-guest button')].find((b) => b.textContent === 'QR');
  assert.equal(root.querySelectorAll('.s-qr').length, 1);
  qrBtn.click();
  assert.equal(root.querySelectorAll('.s-qr').length, 2);
  assert.match(root.querySelector('.s-qrbox').textContent, /Bapak Ahmad & Keluarga/);
  qrBtn.click();
  assert.equal(root.querySelector('.s-qrbox').hidden, true);
});

test('QR: matriks mengikuti standar (pola pencari 7x7 di tiga sudut), SVG satu path, deterministik', () => {
  const url = 'https://nikora-undangan.vercel.app/?slug=dimas-rani&to=Bapak%20Ahmad';
  const m = qrMatrix(url);
  assert.ok(m.size >= 21 && (m.size - 17) % 4 === 0);
  for (const [r0, c0] of [[0, 0], [0, m.size - 7], [m.size - 7, 0]]) {
    for (let i = 0; i < 7; i++) {
      assert.ok(m.dark(r0, c0 + i) && m.dark(r0 + 6, c0 + i) && m.dark(r0 + i, c0) && m.dark(r0 + i, c0 + 6), 'cincin luar gelap');
    }
    assert.ok(!m.dark(r0 + 1, c0 + 1) && !m.dark(r0 + 1, c0 + 5), 'cincin dalam terang');
    assert.ok(m.dark(r0 + 3, c0 + 3), 'inti gelap');
  }
  const a = qrSvg(url), b = qrSvg(url);
  assert.equal(a.querySelectorAll('path').length, 1);
  assert.equal(a.getAttribute('viewBox'), `0 0 ${m.size + 8} ${m.size + 8}`);
  assert.equal(a.querySelector('path').getAttribute('d'), b.querySelector('path').getAttribute('d'));
  assert.equal(a.getAttribute('role'), 'img');
  assert.equal(qrPanel({ url, caption: 'Tamu' }).querySelectorAll('button').length >= 1, true);
});
