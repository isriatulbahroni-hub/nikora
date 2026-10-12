import test from 'node:test';
import assert from 'node:assert/strict';
import { readEnv, issueToken, cleanName } from './token-issuer.js';

test('issueToken: nonaktif tanpa env; aktif menghasilkan JWT room orbit-hall dengan identitas unik', async () => {
  assert.deepEqual(await issueToken({ env: {}, name: 'A' }), { enabled: false, reason: 'config', missing: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] });
  const env = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-1234' };
  const a = await issueToken({ env, name: '<b>Budi</b>' });
  const b = await issueToken({ env, name: 'Budi' });
  assert.equal(a.enabled, true);
  assert.notEqual(a.id, b.id);
  const p = JSON.parse(Buffer.from(a.token.split('.')[1], 'base64url').toString());
  assert.equal(p.sub, a.id);
  assert.equal(p.video.room, 'orbit-hall');
  assert.equal(p.name, 'bBudi/b'); // < dan > dibuang
  assert.equal(cleanName(42), 'Tamu');
  assert.equal(cleanName('x'.repeat(99)).length, 24);
});

test('kanal LiveKit dipisah per dunia; nama dunia tak dikenal jatuh ke aula', async () => {
  const { roomFor, VOICE_ROOM } = await import('./token-issuer.js');
  assert.equal(roomFor('villa'), 'nikora-villa');
  assert.equal(roomFor('hall'), VOICE_ROOM);
  assert.equal(roomFor('../admin'), VOICE_ROOM);
  assert.equal(roomFor(undefined), VOICE_ROOM);
});

import { roomFor, eventExists } from './token-issuer.js';

const ENV = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-1234' };
const jwt = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

test('roomFor: ruang per acara dan per dunia; tanpa acara/slug tak valid memakai ruang umum', () => {
  assert.equal(roomFor('villa', 'dimas-rani'), 'evt-dimas-rani-villa');
  assert.equal(roomFor('hall', 'dimas-rani'), 'evt-dimas-rani-hall');
  assert.equal(roomFor(undefined, 'dimas-rani'), 'evt-dimas-rani-hall');
  assert.equal(roomFor('villa'), 'nikora-villa');
  assert.equal(roomFor('hall', '../x'), 'orbit-hall');
  assert.equal(roomFor('lain', 'ab-cd'), 'evt-ab-cd-hall');
});

test('issueToken: token masuk ke ruang acara; slug aneh ditolak; acara yang tidak ada di Supabase ditolak', async () => {
  const a = await issueToken({ env: ENV, name: 'Budi', world: 'villa', event: 'dimas-rani' });
  assert.equal(jwt(a.token).video.room, 'evt-dimas-rani-villa');
  assert.deepEqual(await issueToken({ env: ENV, event: '../../x' }), { enabled: false, reason: 'event' });
  const withDb = { ...ENV, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  const none = async () => ({ ok: true, json: async () => [] });
  const some = async () => ({ ok: true, json: async () => [{ slug: 'dimas-rani' }] });
  assert.deepEqual(await issueToken({ env: withDb, event: 'tidak-ada', fetchImpl: none }), { enabled: false, reason: 'event' });
  assert.equal((await issueToken({ env: withDb, event: 'dimas-rani', fetchImpl: some })).enabled, true);
});

test('eventExists: tanpa konfigurasi, error HTTP, dan jaringan gagal tidak memblokir tamu', async () => {
  assert.equal(await eventExists('ab-cd', { env: {} }), true);
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' };
  assert.equal(await eventExists('ab-cd', { env, fetchImpl: async () => ({ ok: false }) }), true);
  assert.equal(await eventExists('ab-cd', { env, fetchImpl: async () => { throw new Error('x'); } }), true);
});

test('issueToken: hanya melaporkan nama variabel yang kurang, tidak pernah nilainya', async () => {
  const res = await issueToken({ env: { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'kunci-rahasia' }, name: 'A' });
  assert.deepEqual(res, { enabled: false, reason: 'config', missing: ['LIVEKIT_API_SECRET'] });
  assert.ok(!JSON.stringify(res).includes('kunci-rahasia'));
});

test('readEnv: membuang spasi, baris baru, dan kutip pembungkus; nilai kosong dianggap kurang', async () => {
  assert.equal(readEnv({ A: '  nilai\n' }, 'A'), 'nilai');
  assert.equal(readEnv({ A: '"nilai"' }, 'A'), 'nilai');
  assert.equal(readEnv({ A: "'nilai'" }, 'A'), 'nilai');
  assert.equal(readEnv({ A: '   ' }, 'A'), '');
  assert.equal(readEnv({}, 'A'), '');
  const res = await issueToken({ env: { LIVEKIT_URL: '  ', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }, name: 'A' });
  assert.deepEqual(res.missing, ['LIVEKIT_URL']);
});
