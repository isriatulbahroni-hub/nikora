import test from 'node:test';
import assert from 'node:assert/strict';
import { attachModeration, getDeviceId } from './moderated-net.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const json = (obj) => ({ ok: true, json: async () => obj, clone() { return this; } });

function fakeNet(credFor) {
  const sent = [];
  const net = {
    tokenUrl: '/api/token', room: null, closing: false, closed: 0, handlers: { chat: [] },
    fetch: async (_url, init) => json(credFor(JSON.parse(init.body))),
    sendChat(text) { sent.push(text); },
    close() { this.closed++; },
  };
  return { net, sent };
}

test('getDeviceId: dibuat sekali lalu dipakai ulang; penyimpanan rusak tetap menghasilkan id', () => {
  const s = memStorage();
  const a = getDeviceId(s, () => 'a'.repeat(32));
  assert.equal(getDeviceId(s, () => 'b'.repeat(32)), a);
  assert.equal(getDeviceId({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, () => 'c'.repeat(32)), 'c'.repeat(32));
  assert.equal(getDeviceId(null, () => 'd'.repeat(32)), 'd'.repeat(32));
});

test('permintaan token membawa id perangkat; pesan bersih langsung terkirim tanpa jaringan tambahan', async () => {
  let seen;
  const { net, sent } = fakeNet((body) => { seen = body; return { enabled: true, modToken: 'tok' }; });
  let posts = 0;
  attachModeration(net, { storage: memStorage(), fetchImpl: async () => { posts++; return json({ ok: true }); }, rand: () => 'e'.repeat(32) });
  await net.fetch('/api/token', { method: 'POST', body: JSON.stringify({ name: 'Budi' }) });
  assert.equal(seen.deviceId, 'e'.repeat(32));
  assert.equal(seen.name, 'Budi');
  net.sendChat('selamat ya');
  assert.deepEqual(sent, ['selamat ya']);
  assert.equal(posts, 0);
});

test('pesan kasar tidak pernah terkirim; peringatan tampil sebagai pesan Sistem', async () => {
  const { net, sent } = fakeNet(() => ({ enabled: true, modToken: 'tok' }));
  const shown = [];
  net.handlers.chat.push((m) => shown.push(m));
  const reqs = [];
  attachModeration(net, { storage: memStorage(), fetchImpl: async (u, init) => { reqs.push([u, JSON.parse(init.body)]); return json({ ok: false, action: 'warn', message: 'Peringatan 1/3' }); } });
  await net.fetch('/api/token', { method: 'POST', body: '{}' });
  net.sendChat('dasar anjing');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent, []);
  assert.equal(reqs[0][0], '/api/moderate');
  assert.deepEqual(reqs[0][1], { modToken: 'tok', text: 'dasar anjing' });
  assert.equal(shown[0].name, 'Sistem');
  assert.equal(shown[0].text, 'Peringatan 1/3');
  assert.equal(net.closed, 0);
});

test('ban dari server menutup koneksi dan menghentikan masuk ulang', async () => {
  const { net, sent } = fakeNet(() => ({ enabled: true, modToken: 'tok' }));
  const shown = [];
  attachModeration(net, { storage: memStorage(), onNotice: (t) => shown.push(t), fetchImpl: async () => json({ ok: false, action: 'ban', message: 'Dikeluarkan' }) });
  await net.fetch('/api/token', { method: 'POST', body: '{}' });
  net.sendChat('anjing');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(shown, ['Dikeluarkan']);
  assert.equal(net.closed, 1);
  assert.equal(net.closing, true);
  assert.deepEqual(sent, []);
});

test('tanpa modToken atau server gagal: pesan kasar tetap ditahan', async () => {
  const a = fakeNet(() => ({ enabled: true }));
  const shownA = [];
  attachModeration(a.net, { storage: memStorage(), onNotice: (t) => shownA.push(t), fetchImpl: async () => { throw new Error('offline'); } });
  await a.net.fetch('/api/token', { method: 'POST', body: '{}' });
  a.net.sendChat('anjing');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(a.sent, []);
  assert.equal(shownA.length, 1);
  const b = fakeNet(() => ({ enabled: true, modToken: 'tok' }));
  const shownB = [];
  attachModeration(b.net, { storage: memStorage(), onNotice: (t) => shownB.push(t), fetchImpl: async () => { throw new Error('offline'); } });
  await b.net.fetch('/api/token', { method: 'POST', body: '{}' });
  b.net.sendChat('anjing');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(b.sent, []);
  assert.equal(shownB.length, 1);
});

test('token ditolak karena diblokir: galat jelas, dan masuk ulang dihentikan bila sedang tersambung', async () => {
  const { net } = fakeNet(() => ({ enabled: false, reason: 'banned' }));
  attachModeration(net, { storage: memStorage() });
  await assert.rejects(() => net.fetch('/api/token', { method: 'POST', body: '{}' }), /dikeluarkan/);
  assert.equal(net.closing, false);
  net.room = {};
  await assert.rejects(() => net.fetch('/api/token', { method: 'POST', body: '{}' }), /dikeluarkan/);
  assert.equal(net.closing, true);
});

test('detach mengembalikan perilaku asli', async () => {
  const { net, sent } = fakeNet(() => ({ enabled: true }));
  const h = attachModeration(net, { storage: memStorage(), onNotice: () => {} });
  h.detach();
  net.sendChat('anjing');
  assert.deepEqual(sent, ['anjing']);
});
