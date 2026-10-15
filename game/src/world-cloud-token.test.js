import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloud } from './world-cloud.js';

test('accessToken: memakai token sesi yang masih berlaku, error bila belum masuk', async () => {
  let saved = null;
  const store = { get: () => saved, set: (v) => { saved = v; } };
  const now = 1_000_000;
  const cloud = createCloud({ url: 'https://x.supabase.co', key: 'anon', store, fetchImpl: async () => { throw new Error('tidak boleh ada jaringan'); }, nowSec: () => now });
  await assert.rejects(() => cloud.accessToken(), /masuk/i);
  saved = JSON.stringify({ access_token: 'tok-hidup', refresh_token: 'r', expires_at: now + 3600, user: { id: 'u1' } });
  assert.equal(await cloud.accessToken(), 'tok-hidup');
});

test('accessToken: menyegarkan token yang hampir kedaluwarsa', async () => {
  let saved = JSON.stringify({ access_token: 'lama', refresh_token: 'r1', expires_at: 1_000_010, user: { id: 'u1' } });
  const store = { get: () => saved, set: (v) => { saved = v; } };
  const fetchImpl = async (url) => {
    assert.match(String(url), /grant_type=refresh_token/);
    return { ok: true, status: 200, json: async () => ({ access_token: 'baru', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1' } }) };
  };
  const cloud = createCloud({ url: 'https://x.supabase.co', key: 'anon', store, fetchImpl, nowSec: () => 1_000_000 });
  assert.equal(await cloud.accessToken(), 'baru');
});
