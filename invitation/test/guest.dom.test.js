import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { mountRsvp, mountGuestbook, mountGifts } = await import('../src/scenes/guest.js');
const { buildView } = await import('../src/engine/config.js');
const { demoInvitation } = await import('../src/engine/demo.js');

const tick = () => new Promise((r) => setTimeout(r, 0));
const mk = (slug = 'demo', to = 'Bapak Ahmad') => {
  const root = document.createElement('div');
  document.body.append(root);
  const inv = { ...demoInvitation('pernikahan-taman'), slug };
  return { root, view: buildView({ invitation: inv, query: { to } }) };
};
const okFetch = (body = []) => async () => ({ ok: true, status: 200, json: async () => body });

test('RSVP: nama tamu terisi dari link, kirim -> terima kasih -> Lanjut menyelesaikan adegan', async () => {
  const { root, view } = mk();
  const scene = mountRsvp(root, { view, api: {} });
  assert.equal(root.querySelector('input[name=name]').value, 'Bapak Ahmad');
  root.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await tick(); await tick();
  assert.match(root.querySelector('.g-thanks').textContent, /tercatat/);
  let finished = false;
  scene.done.then(() => { finished = true; });
  root.querySelector('.cta').click();
  await tick();
  assert.equal(finished, true);
  scene.destroy();
  assert.equal(root.children.length, 0);
});

test('RSVP: nama kosong -> pesan galat, tombol aktif lagi, tidak lanjut', async () => {
  const { root, view } = mk('demo', '');
  mountRsvp(root, { view, api: {} });
  root.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await tick(); await tick();
  assert.match(root.querySelector('.g-status').textContent, /Nama wajib/);
  assert.equal(root.querySelector('button[type=submit]').disabled, false);
});

test('RSVP: undangan sungguhan mengirim ke Supabase; berhalangan menonaktifkan jumlah tamu', async () => {
  const { root, view } = mk('rani-dimas');
  const calls = [];
  const api = { url: 'https://x.supabase.co', key: 'anon', fetchImpl: async (u, i) => { calls.push({ u, i }); return { ok: true, status: 201 }; } };
  mountRsvp(root, { view, api });
  const [yes, no] = root.querySelectorAll('.g-choice');
  no.click();
  assert.equal(root.querySelector('input[name=guests]').disabled, true);
  assert.equal(no.getAttribute('aria-pressed'), 'true');
  assert.equal(yes.getAttribute('aria-pressed'), 'false');
  root.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await tick(); await tick();
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].i.body).attending, false);
});

test('buku tamu: tampil dari Supabase, teks aman (bukan HTML), Lanjut menyelesaikan', async () => {
  const { root, view } = mk('rani-dimas');
  const api = { url: 'https://x.supabase.co', key: 'anon', fetchImpl: okFetch([{ name: '<img src=x onerror=alert(1)>', wish: 'Selamat', created_at: '2026-10-01' }]) };
  const scene = mountGuestbook(root, { view, api });
  await tick(); await tick();
  assert.equal(root.querySelectorAll('.g-list li').length, 1);
  assert.equal(root.querySelector('.g-list img'), null);
  assert.match(root.querySelector('.g-list strong').textContent, /<img/);
  root.querySelector('.cta').click();
  await scene.done;
  scene.destroy();
});

test('buku tamu kosong -> ajakan menulis lewat konfirmasi hadir', async () => {
  const { root, view } = mk('rani-dimas');
  mountGuestbook(root, { view, api: { url: 'https://x.supabase.co', key: 'k', fetchImpl: okFetch([]) } });
  await tick(); await tick();
  assert.match(root.querySelector('.g-status').textContent, /Belum ada ucapan/);
});

test('hadiah: tanpa hadiah aktif adegan dilewati otomatis dan tidak pernah tampil', async () => {
  const { root, view } = mk('rani-dimas');
  const scene = mountGifts(root, { view, api: { url: 'https://x.supabase.co', key: 'k', fetchImpl: okFetch([]) } });
  await scene.done;
  assert.equal(root.querySelector('.guest-stage').hidden, true);
});

test('hadiah: rekening tampil, salin nomor memakai clipboard', async () => {
  const { root, view } = mk('rani-dimas');
  let copied = null;
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  mountGifts(root, { view, api: { url: 'https://x.supabase.co', key: 'k', fetchImpl: okFetch([{ kind: 'bank', label: 'BCA', account_name: 'Dimas', account_no: '123456' }]) } });
  await tick(); await tick();
  assert.equal(root.querySelector('.guest-stage').hidden, false);
  root.querySelector('.g-copy').click();
  await tick();
  assert.equal(copied, '123456');
  assert.equal(root.querySelector('.g-copy').textContent, 'Tersalin');
});
