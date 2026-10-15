import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initAiUi } from './editor-ai-ui.js';
import { createEditor } from './world-editor.js';
import { draftFromModel } from './ai-world.js';

const draft = () => draftFromModel({ name: 'Draf <b>AI</b>', area: { halfX: 30, halfZ: 30 }, spawn: { x: 0, z: 24 }, props: [{ type: 'stage', x: 0, z: -23.5 }, { type: 'table', x: 0, z: -5 }] });

function setup({ run, session = { access_token: 'x' }, confirmAnswer = true } = {}) {
  const dom = new JSDOM('<!doctype html><body><button id="aiBtn"></button><div id="ai"></div><div id="cloud" class="show"></div><div id="issues" class="show"></div></body>');
  globalThis.document = dom.window.document;
  globalThis.confirm = () => confirmAnswer;
  const toasts = [];
  const editor = createEditor();
  let applied = 0;
  const job = { cancel() { job.cancelled = true; }, run: run ?? (async () => ({ state: 'done', result: { ...draft(), meta: { model: 'm-tes', promptVersion: 'world-draft/1' } } })) };
  const ui = initAiUi({
    editor, cloud: { session: () => session }, panel: dom.window.document.getElementById('ai'), button: dom.window.document.getElementById('aiBtn'),
    toast: (m) => toasts.push(m), onApplied: () => { applied++; }, job,
  });
  const $ = (sel) => dom.window.document.querySelector(sel);
  const btn = (text) => [...dom.window.document.querySelectorAll('#ai button')].find((b) => b.textContent === text);
  return { dom, editor, ui, job, toasts, $, btn, get applied() { return applied; } };
}
const tick = () => new Promise((r) => setImmediate(r));

test('tombol AI membuka panel dan menutup panel lain', () => {
  const s = setup();
  s.$('#aiBtn').click();
  assert.ok(s.$('#ai').classList.contains('show'));
  assert.ok(!s.$('#cloud').classList.contains('show'));
  assert.ok(!s.$('#issues').classList.contains('show'));
  s.$('#aiBtn').click();
  assert.ok(!s.$('#ai').classList.contains('show'));
});

test('belum masuk akun: panel memberi petunjuk', () => {
  const s = setup({ session: null });
  s.$('#aiBtn').click();
  assert.match(s.$('#ai .st').textContent, /Akun/);
});

test('contoh deskripsi mengisi kotak teks', () => {
  const s = setup();
  s.btn('Resepsi taman').click();
  assert.match(s.$('#ai textarea').value, /Resepsi pernikahan/);
});

test('draf tampil sebagai ringkasan (teks, bukan HTML) dan belum mengubah editor', async () => {
  const s = setup();
  s.$('#ai textarea').value = 'resepsi taman';
  s.btn('Buat draf').click();
  await tick();
  assert.ok(s.ui.pending);
  assert.equal(s.$('#ai b'), null, 'nama dari model tidak boleh menjadi elemen HTML');
  assert.match(s.$('#ai').textContent, /Draf b AI \/b/, 'tanda < > sudah dibersihkan dari nama sebelum sampai ke UI');
  assert.match(s.$('#ai').textContent, /2 objek/);
  assert.match(s.$('#ai').textContent, /m-tes/);
  assert.equal(s.editor.project.name, 'Dunia baru');
  assert.equal(s.editor.project.props.length, 0);
});

test('Terapkan memuat draf ke editor; Kembalikan memulihkan isi sebelumnya', async () => {
  const s = setup();
  s.editor.place('table', 0, 0);
  const before = JSON.stringify(s.editor.project);
  s.btn('Buat draf').click();
  await tick();
  s.btn('Terapkan ke editor').click();
  assert.equal(s.editor.project.props.length, 2);
  assert.equal(s.ui.pending, null);
  assert.equal(s.applied, 1);
  assert.ok(!s.$('#ai').classList.contains('show'));
  s.$('#aiBtn').click();
  s.btn('Kembalikan sebelumnya').click();
  assert.equal(JSON.stringify(s.editor.project), before);
  assert.equal(s.applied, 2);
});

test('menolak konfirmasi = editor tidak berubah dan draf tetap ada', async () => {
  const s = setup({ confirmAnswer: false });
  s.editor.place('table', 0, 0);
  s.btn('Buat draf').click();
  await tick();
  s.btn('Terapkan ke editor').click();
  assert.equal(s.editor.project.props.length, 1);
  assert.ok(s.ui.pending);
});

test('gagal: pesan galat, tidak ada draf; batas pemakaian menyebut waktu tunggu', async () => {
  const s = setup({ run: async () => ({ state: 'failed', error: { code: 'batas', message: 'Batas pemakaian AI tercapai.', retryAfterSec: 1800 } }) });
  s.btn('Buat draf').click();
  await tick();
  assert.equal(s.ui.pending, null);
  assert.match(s.$('#ai .st').textContent, /Batas pemakaian AI tercapai\. Coba lagi sekitar 30 menit/);
});

test('Batal memanggil job.cancel; tombol Buat dikunci selama berjalan', async () => {
  let finish;
  const s = setup({ run: () => new Promise((r) => { finish = r; }) });
  s.btn('Buat draf').click();
  await tick();
  assert.equal(s.btn('Buat draf').disabled, true);
  s.btn('Batal').click();
  assert.equal(s.job.cancelled, true);
  finish({ state: 'cancelled', error: { code: 'dibatalkan', message: 'Dibatalkan.' } });
  await tick();
  assert.equal(s.btn('Buat draf').disabled, false);
  assert.equal(s.ui.pending, null);
});

test('mode tinjau (canUse=false) menolak membuat dan menerapkan', async () => {
  const dom = new JSDOM('<!doctype html><body><button id="aiBtn"></button><div id="ai"></div></body>');
  globalThis.document = dom.window.document;
  const toasts = [];
  let ran = 0;
  initAiUi({ editor: createEditor(), cloud: { session: () => ({}) }, panel: dom.window.document.getElementById('ai'), button: dom.window.document.getElementById('aiBtn'), toast: (m) => toasts.push(m), canUse: () => false, job: { cancel() {}, run: async () => { ran++; return { state: 'done', result: draft() }; } } });
  dom.window.document.getElementById('aiBtn').click();
  [...dom.window.document.querySelectorAll('#ai button')].find((b) => b.textContent === 'Buat draf').click();
  await tick();
  assert.equal(ran, 0);
  assert.ok(toasts.length >= 2);
});
