import test from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, cleanName } from './token-issuer.js';

test('issueToken: nonaktif tanpa env; aktif menghasilkan JWT room orbit-hall dengan identitas unik', async () => {
  assert.deepEqual(await issueToken({ env: {}, name: 'A' }), { enabled: false });
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
