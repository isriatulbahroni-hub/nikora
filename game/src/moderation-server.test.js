import test from 'node:test';
import assert from 'node:assert/strict';
import { handleModeration, hashDevice, memoryStore, newModToken, signModToken, storeFromEnv, supabaseStore, verifyModToken } from './moderation-server.js';
import { issueToken } from './token-issuer.js';

const SECRET = 'rahasia-moderasi-minimal-16-karakter';
const env = { MODERATION_SECRET: SECRET };
const DEVICE = 'perangkat-acak-1234567890abcd';
const claims = { id: 'abc12345', room: 'evt-nikah-villa', ev: 'nikah', dh: hashDevice(SECRET, DEVICE) };
const modToken = () => newModToken(SECRET, claims);

test('modToken: valid, kedaluwarsa, dirusak, rahasia salah', () => {
  const t = modToken();
  assert.equal(verifyModToken(SECRET, t)?.id, 'abc12345');
  assert.equal(verifyModToken(SECRET, t, Date.now() + 3 * 3600 * 1000), null);
  assert.equal(verifyModToken(SECRET, `${t}x`), null);
  assert.equal(verifyModToken('rahasia-lain-yang-juga-panjang', t), null);
  assert.equal(verifyModToken(SECRET, signModToken(SECRET, { id: 'a', exp: Date.now() + 1000 })), null); // klaim kurang
  assert.equal(verifyModToken(SECRET, undefined), null);
});

test('tanpa MODERATION_SECRET: mati total', async () => {
  const r = await handleModeration({ body: { modToken: 'x', text: 'anjing' }, env: {} });
  assert.deepEqual(r.json, { ok: true, disabled: true });
});

test('token palsu ditolak 401; teks bersih lolos tanpa strike', async () => {
  const store = memoryStore();
  assert.equal((await handleModeration({ body: { modToken: 'palsu', text: 'anjing' }, env, store })).status, 401);
  const r = await handleModeration({ body: { modToken: modToken(), text: 'selamat ya!' }, env, store });
  assert.deepEqual(r.json, { ok: true });
  assert.equal(await store.isBanned('nikah', claims.dh), false);
});

test('3 peringatan lalu pelanggaran ke-4 mengeluarkan dan memblokir', async () => {
  const store = memoryStore();
  const removed = [];
  const remove = async (room, id) => removed.push([room, id]);
  const send = (text = 'dasar anjing') => handleModeration({ body: { modToken: modToken(), text }, env, store, remove });
  for (const n of [1, 2, 3]) {
    const { json } = await send();
    assert.equal(json.action, 'warn');
    assert.equal(json.strikes, n);
    assert.equal(json.remaining, 3 - n);
  }
  assert.equal(removed.length, 0);
  const ban = (await send()).json;
  assert.equal(ban.action, 'ban');
  assert.deepEqual(removed, [['evt-nikah-villa', 'abc12345']]);
  assert.equal(await store.isBanned('nikah', claims.dh), true);
  assert.equal(await store.isBanned('acara-lain', claims.dh), false); // ban per acara
});

test('kegagalan penyimpanan menahan pesan tanpa menghukum; kegagalan kick tetap melaporkan ban', async () => {
  const broken = { addStrike: async () => { throw new Error('db mati'); } };
  const r = await handleModeration({ body: { modToken: modToken(), text: 'anjing' }, env, store: broken });
  assert.equal(r.json.action, 'block');
  const store = memoryStore();
  for (let i = 0; i < 3; i++) await handleModeration({ body: { modToken: modToken(), text: 'anjing' }, env, store });
  const ban = await handleModeration({ body: { modToken: modToken(), text: 'anjing' }, env, store, remove: async () => { throw new Error('livekit'); } });
  assert.equal(ban.json.action, 'ban');
});

test('tanpa penyimpanan dikonfigurasi: pesan ditahan, tidak ada strike', async () => {
  const r = await handleModeration({ body: { modToken: modToken(), text: 'anjing' }, env });
  assert.equal(r.json.action, 'block');
});

test('storeFromEnv butuh service role; supabaseStore memanggil REST dengan benar', async () => {
  assert.equal(storeFromEnv({ SUPABASE_URL: 'https://x.supabase.co' }), null);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    if (url.includes('/rpc/')) return { ok: true, json: async () => [{ out_strikes: 2, out_banned: false }] };
    return { ok: true, json: async () => [{ banned: true }] };
  };
  const st = supabaseStore({ url: 'https://x.supabase.co/', key: 'svc', fetchImpl });
  assert.deepEqual(await st.addStrike('nikah', 'h', 3), { strikes: 2, banned: false });
  assert.equal(await st.isBanned('nikah', 'h'), true);
  assert.match(calls[0][0], /\/rest\/v1\/rpc\/moderation_strike$/);
  assert.deepEqual(JSON.parse(calls[0][1].body), { p_event: 'nikah', p_device: 'h', p_max: 3, p_name: null });
  assert.match(calls[1][0], /guest_moderation\?event=eq\.nikah&device_hash=eq\.h/);
  assert.equal(calls[1][1].headers.Authorization, 'Bearer svc');
});

const lk = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-12345' };

test('issueToken: tanpa MODERATION_SECRET hasilnya persis seperti sebelumnya (tanpa modToken)', async () => {
  const r = await issueToken({ env: lk, name: 'Budi', world: 'villa', deviceId: DEVICE });
  assert.equal(r.enabled, true);
  assert.equal('modToken' in r, false);
});

test('issueToken: dengan moderasi menerbitkan modToken yang cocok dengan id dan ruang', async () => {
  const r = await issueToken({ env: { ...lk, ...env }, name: 'Budi', world: 'villa', deviceId: DEVICE, store: memoryStore() });
  const c = verifyModToken(SECRET, r.modToken);
  assert.equal(c.id, r.id);
  assert.equal(c.room, 'nikora-villa');
  assert.equal(c.ev, '-');
  assert.equal(c.dh, hashDevice(SECRET, DEVICE));
});

test('issueToken: perangkat yang diblokir di acara itu ditolak, di acara lain boleh', async () => {
  const store = memoryStore();
  for (let i = 0; i < 4; i++) await store.addStrike('nikah', hashDevice(SECRET, DEVICE), 3);
  const base = { env: { ...lk, ...env }, name: 'Budi', world: 'villa', deviceId: DEVICE, store };
  assert.deepEqual(await issueToken({ ...base, event: 'nikah' }), { enabled: false, reason: 'banned' });
  assert.equal((await issueToken({ ...base, event: 'ulang-tahun' })).enabled, true);
});

test('issueToken: id perangkat tidak valid atau cek blokir gagal tidak menghalangi masuk', async () => {
  const broken = { isBanned: async () => { throw new Error('db mati'); } };
  const a = await issueToken({ env: { ...lk, ...env }, name: 'B', world: 'villa', deviceId: 'pendek', store: broken });
  assert.equal(a.enabled, true);
  assert.equal('modToken' in a, false);
  const b = await issueToken({ env: { ...lk, ...env }, name: 'B', world: 'villa', deviceId: DEVICE, store: broken });
  assert.equal(b.enabled, true);
  assert.ok(b.modToken);
});
