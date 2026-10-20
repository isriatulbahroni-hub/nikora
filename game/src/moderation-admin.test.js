import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin } from './moderation-admin.js';
import { handleModeration, hashDevice, memoryStore, newModToken } from './moderation-server.js';
import { deriveRoleKey, issueToken } from './token-issuer.js';

const MOD = 'rahasia-moderasi-minimal-16-karakter';
const ROLE = 'rahasia-peran-acara-minimal-16-karakter';
const lk = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-12345' };
const env = { ...lk, MODERATION_SECRET: MOD, EVENT_ROLE_SECRET: ROLE };
const owner = (ev) => deriveRoleKey(ROLE, ev, 'owner');
const DEVICE = 'perangkat-acak-1234567890abcd';
const dh = hashDevice(MOD, DEVICE);
const tok = (ev = 'nikah') => newModToken(MOD, { id: 'abc12345', room: `evt-${ev}-villa`, ev, dh, nm: 'Budi' });

test('hanya pemilik acara itu yang boleh: MC, kunci acara lain, tanpa kunci ditolak', async () => {
  const store = memoryStore();
  const call = (key, event = 'nikah', op = 'list') => handleAdmin({ body: { event, key, op }, env, store });
  assert.equal((await call(owner('nikah'))).status, 200);
  assert.equal((await call(deriveRoleKey(ROLE, 'nikah', 'mc'))).status, 403);
  assert.equal((await call(owner('acara-lain'))).status, 403);
  assert.equal((await call(undefined)).status, 403);
  assert.equal((await call(owner('nikah'), 'bukan slug!')).status, 400);
  assert.equal((await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'list' }, env: {}, store })).json.disabled, true);
});

test('daftar pelanggar menampilkan nama dan status; buka blokir mengembalikan akses', async () => {
  const store = memoryStore();
  for (let i = 0; i < 4; i++) await handleModeration({ body: { modToken: tok(), text: 'anjing' }, env, store, remove: async () => {} });
  const list = (await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'list' }, env, store })).json.violators;
  assert.equal(list.length, 1);
  assert.equal(list[0].last_name, 'Budi');
  assert.equal(list[0].banned, true);
  assert.equal((await issueToken({ env, name: 'Budi', world: 'villa', event: 'nikah', deviceId: DEVICE, store })).reason, 'banned');
  const r = await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'unban', device: list[0].device_hash }, env, store });
  assert.equal(r.json.unbanned, true);
  assert.equal((await issueToken({ env, name: 'Budi', world: 'villa', event: 'nikah', deviceId: DEVICE, store })).enabled, true);
  assert.equal((await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'unban', device: 'pendek' }, env, store })).status, 400);
});

test('pengaturan per acara: kata diizinkan lolos, kata tambahan dihitung, tingkat ketat berlaku, token membawa modConfig', async () => {
  const store = memoryStore();
  const set = (settings) => handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'set-settings', settings }, env, store });
  const saved = (await set({ level: 'ketat', allow: ['Babi', 'x', 'b@d'], extra: ['kuntilanak', 'kuntilanak'] })).json.settings;
  assert.deepEqual(saved, { level: 'ketat', allow: ['babi'], extra: ['kuntilanak'] }); // dibersihkan: huruf kecil, unik, valid saja
  const send = (text) => handleModeration({ body: { modToken: tok(), text }, env, store, remove: async () => {} });
  assert.equal((await send('Pak Babi hadir')).json.ok, true); // diizinkan pemilik
  assert.equal((await send('dasar kuntilanak')).json.action, 'warn'); // kata tambahan
  assert.equal((await send('kamu goblok')).json.action, 'warn'); // tingkat ketat
  const t = await issueToken({ env, name: 'Budi', world: 'villa', event: 'nikah', deviceId: 'perangkat-lain-1234567890abcd', store });
  assert.deepEqual(t.modConfig, saved);
  assert.equal((await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'get-settings' }, env, store })).json.settings.level, 'ketat');
  assert.equal((await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'rahasia' }, env, store })).status, 400);
});

test('pengaturan satu acara tidak bocor ke acara lain', async () => {
  const store = memoryStore();
  await handleAdmin({ body: { event: 'nikah', key: owner('nikah'), op: 'set-settings', settings: { level: 'ketat' } }, env, store });
  const r = await handleModeration({ body: { modToken: tok('ulang-tahun'), text: 'kamu goblok' }, env, store });
  assert.equal(r.json.ok, true);
});
