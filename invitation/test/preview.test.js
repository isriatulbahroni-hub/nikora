import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://undangan.example/studio' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { acceptPreviewMessage, applyDraft, MAX_DRAFT } = await import('../src/preview-frame.js');
const { editorView } = await import('../src/studio/editor.js');
const { leaveStudio, hasUnsaved, topbarView, goodbyeView } = await import('../src/studio/exit.js');
const { createClient } = await import('../src/studio/api.js');
const { createEngine, registerScene } = await import('../src/engine/scene-engine.js');
const { buildView } = await import('../src/engine/config.js');
const { demoInvitation, demoScenes } = await import('../src/engine/demo.js');

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const parent = { id: 'parent' };
const ok = (data, over = {}) => ({ origin: 'https://undangan.example', source: parent, data: { type: 'orbit-preview:draft', kind: 'kisah', config: { items: [] }, ...data }, ...over });

test('frame: hanya menerima draf dari induk sendiri dengan asal sama', () => {
  const ctx = { origin: 'https://undangan.example', parent };
  assert.deepEqual(acceptPreviewMessage(ok({}), ctx), { kind: 'kisah', config: { items: [] }, active: true });
  assert.equal(acceptPreviewMessage(ok({}, { origin: 'https://jahat.example' }), ctx), null);
  assert.equal(acceptPreviewMessage(ok({}, { source: { id: 'lain' } }), ctx), null);
  assert.equal(acceptPreviewMessage(ok({ type: 'lain' }), ctx), null);
  assert.equal(acceptPreviewMessage(ok({ kind: 'hack' }), ctx), null);
  assert.equal(acceptPreviewMessage(ok({ config: [] }), ctx), null);
  assert.equal(acceptPreviewMessage(ok({ config: { x: 'y'.repeat(MAX_DRAFT) } }), ctx), null);
  assert.equal(acceptPreviewMessage({ origin: ctx.origin, source: parent, data: 'teks' }, ctx), null);
  assert.equal(acceptPreviewMessage(null, ctx), null);
  assert.equal(acceptPreviewMessage(ok({ active: false }), ctx).active, false);
});

test('applyDraft: ganti config adegan, tambah yang belum ada, paksa hari_acara/arsip tampil', () => {
  const scenes = [{ kind: 'amplop', position: 0, active: true, config: {} }, { kind: 'kisah', position: 3, active: false, config: { items: [1] } }];
  const a = applyDraft(scenes, { kind: 'kisah', config: { items: [{ title: 'X' }] }, active: true });
  assert.deepEqual(a.find((s) => s.kind === 'kisah').config, { items: [{ title: 'X' }] });
  assert.equal(a.find((s) => s.kind === 'kisah').active, true);
  assert.equal(scenes[1].active, false, 'tidak mengubah daftar asli');
  const b = applyDraft(scenes, { kind: 'hari_acara', config: { rundown: [] }, active: true });
  assert.equal(b.find((s) => s.kind === 'hari_acara').config.always, true);
  assert.equal(applyDraft(scenes, { kind: 'arsip', config: null, active: true }).find((s) => s.kind === 'arsip').config.always, true);
});

test('mesin: startAt memulai dari adegan itu; kosong = berhenti dengan catatan, bukan lompat', async () => {
  const seen = [];
  const mk = (kind, skipped = false) => (c) => { c.append(document.createElement('i')); seen.push(kind); return skipped ? { skipped: true, done: Promise.resolve(), destroy() {} } : { done: new Promise(() => {}), destroy() {} }; };
  registerScene('amplop', mk('amplop')); registerScene('surat', mk('surat')); registerScene('kisah', mk('kisah', true)); registerScene('detail', mk('detail'));
  const view = buildView({ invitation: demoInvitation('pernikahan-taman'), scenes: ['amplop', 'surat', 'kisah', 'detail'].map((kind, position) => ({ kind, position, active: true, config: {} })), query: {} });
  const root = document.createElement('div');
  const events = [];
  createEngine({ root, view, env: { reduced: true }, startAt: 'surat', onScene: (s) => events.push(s) }).start();
  await tick(20);
  assert.deepEqual(seen, ['surat']);
  const root2 = document.createElement('div');
  seen.length = 0;
  createEngine({ root: root2, view, env: { reduced: true }, startAt: 'kisah', onScene: (s) => events.push(s) }).start();
  await tick(20);
  assert.deepEqual(seen, ['kisah'], 'tidak lompat ke detail');
  assert.ok(root2.querySelector('.pv-empty'));
  assert.deepEqual(events.at(-1), { kind: 'kisah', skipped: true });
});

function fakeClient() {
  return {
    saved: [],
    invitationOf: async () => ({ slug: 'a-b', extra: {} }),
    scenesOf: async () => [{ kind: 'kisah', position: 3, active: true, config: { items: [{ title: 'Awal' }] } }],
    saveScene: async function (slug, kind, v) { this.saved.push({ kind, ...v }); },
    uploadImage: async () => 'https://x/a.jpg',
  };
}
const submit = (f) => f.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
const fromFrame = (iframe, data) => window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin: 'https://undangan.example', source: iframe.contentWindow }));

test('editor: bingkai pratinjau, kirim draf setelah ready, ikut ketikan, tandai belum disimpan', async () => {
  const root = editorView({ client: fakeClient(), slug: 'a-b', inviteBase: 'https://undangan.example/', onBack() {} });
  document.body.append(root);
  const iframe = root.querySelector('iframe.s-frame');
  assert.match(iframe.getAttribute('src'), /^https:\/\/undangan\.example\/\?slug=a-b&preview=1&frame=1&to=/);
  assert.match(iframe.getAttribute('sandbox'), /allow-same-origin/);
  const sent = [];
  iframe.contentWindow.postMessage = (m, o) => sent.push({ m, o });
  await tick(5); await tick(5);
  assert.equal(sent.length, 0, 'belum ready: ditahan');
  fromFrame(iframe, { type: 'orbit-preview:ready' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].o, 'https://undangan.example');
  assert.equal(sent[0].m.type, 'orbit-preview:draft');
  assert.equal(sent[0].m.kind, 'surat');
  [...root.querySelectorAll('.s-tab')].find((b) => b.textContent === 'Kisah').click();
  assert.equal(sent.at(-1).m.kind, 'kisah');
  assert.equal(sent.at(-1).m.config.items[0].title, 'Awal');
  assert.equal(hasUnsaved(document), false);
  const title = root.querySelectorAll('.s-row-card input[type=text]')[1];
  title.value = 'Judul baru';
  title.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(hasUnsaved(document), true);
  await tick(500);
  assert.equal(sent.at(-1).m.config.items[0].title, 'Judul baru');
  submit(root.querySelector('form')); await tick(5); await tick(5);
  assert.equal(hasUnsaved(document), false);
  fromFrame(iframe, { type: 'orbit-preview:scene', kind: 'kisah', skipped: true });
  assert.match(root.querySelector('.s-pvnote').textContent, /belum ada isinya/);
  fromFrame({ contentWindow: {} }, { type: 'orbit-preview:scene', kind: 'kisah', skipped: false });
  assert.match(root.querySelector('.s-pvnote').textContent, /belum ada isinya/, 'pesan dari sumber lain diabaikan');
});

test('editor: tombol Edit | Pratinjau mengganti panel', async () => {
  const root = editorView({ client: fakeClient(), slug: 'a-b', inviteBase: 'https://undangan.example/', onBack() {} });
  document.body.append(root);
  await tick(5);
  assert.equal(root.dataset.pane, 'edit');
  root.querySelector('[data-pane=preview]').click();
  assert.equal(root.dataset.pane, 'preview');
  assert.equal(root.querySelector('[data-pane=preview]').getAttribute('aria-pressed'), 'true');
  root.querySelector('[data-pane=edit]').click();
  assert.equal(root.dataset.pane, 'edit');
});

test('keluar: tanya bila belum tersimpan; sign out; pindah ke VITE_EXIT_URL bila https; kalau tidak layar sampai jumpa', async () => {
  const calls = [];
  const client = { signOut: async () => calls.push('signOut') };
  const mkWin = () => { const w = { closed: 0, loc: null, location: { replace: (u) => { w.loc = u; } }, close() { w.closed += 1; }, confirm: () => true }; return w; };
  const dirty = document.createElement('div'); dirty.dataset.dirty = '1';
  const root = document.createElement('div'); root.append(dirty);
  let w = mkWin();
  assert.equal(await leaveStudio({ client, win: w, root, confirmFn: () => false, onGoodbye: () => calls.push('bye') }), false);
  assert.deepEqual(calls, []);
  assert.equal(await leaveStudio({ client, win: w, root, confirmFn: () => true, exitUrl: 'https://contoh.example/', onGoodbye: () => calls.push('bye') }), true);
  assert.deepEqual(calls, ['signOut']);
  assert.equal(w.loc, 'https://contoh.example/');
  calls.length = 0; w = mkWin();
  await leaveStudio({ client, win: w, root: document.createElement('div'), exitUrl: 'http://tidak-aman.example', onGoodbye: () => calls.push('bye') });
  assert.deepEqual(calls, ['signOut', 'bye']);
  assert.equal(w.loc, null);
  assert.equal(w.closed, 1);
  assert.equal(topbarView({ email: 'a@b.c', onSignOut() {} }).querySelector('button').textContent, 'Keluar');
  assert.match(goodbyeView({ onAgain() {} }).textContent, /sudah keluar/);
});

test('signOut: sesi lokal hilang seketika dan dicabut di server, tetap keluar walau jaringan gagal', async () => {
  let v = JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u' } });
  const store = { get: () => v, set: (x) => { v = x; } };
  const calls = [];
  const c = createClient({ url: 'https://x.supabase.co', key: 'anon', store, fetchImpl: async (u, o) => { calls.push({ u, o }); return { ok: true, status: 204 }; } });
  await c.signOut();
  assert.equal(v, null);
  assert.equal(calls[0].u, 'https://x.supabase.co/auth/v1/logout');
  assert.equal(calls[0].o.headers.Authorization, 'Bearer tok');
  v = JSON.stringify({ access_token: 'tok2', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u' } });
  const c2 = createClient({ url: 'https://x.supabase.co', key: 'anon', store, fetchImpl: async () => { throw new Error('offline'); } });
  await c2.signOut();
  assert.equal(v, null);
});
