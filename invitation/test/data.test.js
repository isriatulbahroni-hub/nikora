import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInvitation } from '../src/engine/data.js';

const opts = (fetchImpl) => ({ url: 'https://x.supabase.co/', key: 'anon', fetchImpl });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('memuat undangan dan adegan dengan anon key, URL tanpa garis miring ganda', async () => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    return url.includes('/invitations?') ? ok([{ slug: 'rani-dimas', groom: 'Dimas' }]) : ok([{ kind: 'amplop', position: 0, active: true, config: {} }]);
  };
  const r = await loadInvitation('rani-dimas', opts(f));
  assert.equal(r.invitation.groom, 'Dimas');
  assert.equal(r.scenes.length, 1);
  assert.ok(calls.every((c) => !c.url.includes('//rest')));
  assert.equal(calls[0].init.headers.apikey, 'anon');
});

test('slug tidak valid ditolak sebelum ada permintaan jaringan', async () => {
  let hit = 0;
  const f = async () => { hit++; return ok([]); };
  for (const bad of ['', 'A', 'a b', 'x'.repeat(60), "a'; drop", '../etc', '-abc']) {
    await assert.rejects(() => loadInvitation(bad, opts(f)), /tidak valid/);
  }
  assert.equal(hit, 0);
});

test('undangan tidak ada / tidak aktif -> pesan jelas', async () => {
  await assert.rejects(() => loadInvitation('abc-def', opts(async () => ok([]))), /tidak ditemukan/);
});

test('galat server dan konfigurasi kosong', async () => {
  await assert.rejects(() => loadInvitation('abc-def', opts(async () => ({ ok: false, status: 500, json: async () => ({}) }))), /500/);
  await assert.rejects(() => loadInvitation('abc-def', { fetchImpl: async () => ok([]) }), /Konfigurasi Supabase/);
});

test('adegan gagal dimuat -> tetap tampil dengan adegan bawaan', async () => {
  const f = async (url) => (url.includes('/invitations?') ? ok([{ slug: 'abc-def' }]) : { ok: false, status: 404, json: async () => ({}) });
  const r = await loadInvitation('abc-def', opts(f));
  assert.deepEqual(r.scenes, []);
});
