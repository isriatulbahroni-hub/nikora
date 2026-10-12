import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { loginView, createView, detailView } = await import('../src/studio/views.js');
const { THEMES } = await import('../src/themes/index.js');
const tick = () => new Promise((r) => setTimeout(r, 0));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
const set = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input')); };

test('login: berhasil -> onDone; gagal -> pesan dan tombol aktif lagi', async () => {
  let done = 0;
  const ok = loginView({ client: { signIn: async () => ({}) }, onDone: () => { done++; } });
  document.body.append(ok);
  ok.querySelector('input[name=email]').value = 'a@b.c';
  ok.querySelector('input[name=password]').value = 'rahasia';
  submit(ok); await tick(); await tick();
  assert.equal(done, 1);

  const bad = loginView({ client: { signIn: async () => { throw new Error('Email atau kata sandi salah.'); } }, onDone: () => { done++; } });
  document.body.append(bad);
  submit(bad); await tick(); await tick();
  assert.match(bad.querySelector('.s-msg').textContent, /salah/);
  assert.equal(bad.querySelector('button[type=submit]').disabled, false);
  assert.equal(done, 1);
});

test('login: mode daftar dengan konfirmasi email', async () => {
  const v = loginView({ client: { signUp: async () => ({ needsConfirm: true }) }, onDone: () => assert.fail('tidak boleh lanjut') });
  document.body.append(v);
  v.querySelector('.s-link').click();
  assert.equal(v.querySelector('button[type=submit]').textContent, 'Daftar');
  submit(v); await tick(); await tick();
  assert.match(v.querySelector('.s-msg').textContent, /konfirmasi/);
});

test('buat undangan: slug terisi dari nama, tema mengikuti jenis acara, galat per kolom', async () => {
  let created = null;
  const v = createView({ client: { createInvitation: async (val) => { created = val; } }, onCreated: (s) => { created = { ...created, done: s }; }, onCancel() {} });
  document.body.append(v);
  const q = (n) => v.querySelector(`[name=${n}]`);
  set(q('groom'), 'Dimas'); set(q('bride'), 'Rani');
  assert.equal(q('slug').value, 'rani-dimas');

  submit(v); await tick();
  assert.match(q('eventDate').closest('label').querySelector('.s-err').textContent, /Tanggal/);
  assert.equal(q('groom').closest('label').querySelector('.s-err').textContent, '');
  assert.equal(created, null);

  q('eventDate').value = '2026-12-12T10:00';
  submit(v); await tick(); await tick();
  assert.equal(created.slug, 'rani-dimas');
  assert.equal(created.done, 'rani-dimas');

  q('eventType').value = 'ulang_tahun';
  q('eventType').dispatchEvent(new dom.window.Event('change'));
  const opts = [...q('theme').options];
  assert.ok(opts.length > 0);
  assert.ok(opts.every((o) => THEMES.find((t) => t.id === o.value).eventType === 'ulang_tahun'));
  // hanya jenis acara yang sudah punya tema yang bisa dipilih (form tidak boleh buntu)
  assert.ok([...q('eventType').options].every((o) => THEMES.some((t) => t.eventType === o.value)));
  assert.equal(q('bride').closest('label').hidden, true);
});

test('slug bentrok dari server tampil sebagai pesan dan tombol aktif lagi', async () => {
  const v = createView({ client: { createInvitation: async () => { throw new Error('Alamat undangan ini sudah dipakai. Pilih alamat lain.'); } }, onCreated() {}, onCancel() {} });
  document.body.append(v);
  const q = (n) => v.querySelector(`[name=${n}]`);
  set(q('groom'), 'Dimas'); set(q('bride'), 'Rani'); q('eventDate').value = '2026-12-12T10:00';
  submit(v); await tick(); await tick();
  assert.match(v.querySelector('.s-msg').textContent, /sudah dipakai/);
  assert.equal(v.querySelector('button[type=submit]').disabled, false);
});

test('dasbor: link undangan/dunia, tamu dengan link personal + WhatsApp, ringkasan RSVP, hadiah', async () => {
  const client = {
    guestsOf: async () => [{ id: 1, name: 'Bapak Ahmad & Keluarga', category: null }],
    rsvpsOf: async () => [{ id: 1, name: 'Siti', attending: true, guests: 3, wish: 'Barakallah' }, { id: 2, name: 'Joko', attending: false, guests: 1, wish: null }],
    giftsOf: async () => [{ id: 9, kind: 'bank', label: 'BCA', account_name: 'Dimas', account_no: '123', position: 0 }],
  };
  const v = detailView({ client, slug: 'rani-dimas', inviteBase: 'https://undangan.example/', worldBase: 'https://dunia.example', onBack() {} });
  document.body.append(v);
  await tick(); await tick(); await tick();
  const codes = [...v.querySelectorAll('code')].map((c) => c.textContent);
  assert.ok(codes.includes('https://undangan.example/?slug=rani-dimas'));
  assert.ok(codes.includes('https://dunia.example/villa.html?e=rani-dimas'));
  const wa = v.querySelector('a[href^="https://wa.me/"]');
  assert.ok(wa);
  assert.equal(wa.rel, 'noopener noreferrer');
  const text = new URL(wa.href).searchParams.get('text');
  const guestLink = new URL(text.slice(text.indexOf('https://undangan.example')));
  assert.equal(guestLink.searchParams.get('to'), 'Bapak Ahmad & Keluarga');
  assert.equal(guestLink.searchParams.get('slug'), 'rani-dimas');
  assert.match(v.textContent, /1 konfirmasi hadir \(3 orang\), 1 berhalangan/);
  assert.match(v.textContent, /BCA - Dimas 123/);
});

test('dasbor: galat memuat tampil sebagai pesan, bukan crash', async () => {
  const boom = async () => { throw new Error('Permintaan gagal (403).'); };
  const v = detailView({ client: { guestsOf: boom, rsvpsOf: boom, giftsOf: boom }, slug: 'rani-dimas', inviteBase: 'https://u.example', onBack() {} });
  document.body.append(v);
  await tick(); await tick();
  assert.match(v.querySelector('.s-msg').textContent, /403/);
});
