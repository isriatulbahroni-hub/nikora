import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloud, projectFromRow } from './world-cloud.js';
import { newProject } from './world-project.js';

const PID = '8c51cff9-df20-48ff-b571-614f32a1ff52';
const memStore = (init = null) => { let v = init; return { get: () => v, set: (x) => { v = x; }, peek: () => v }; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const live = JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: 9_999_999_999, user: { id: 'u1', email: 'a@b.c' } });
const mk = (fetchImpl, store = memStore(live)) => createCloud({ url: 'https://x.supabase.co/', key: 'anon', store, fetchImpl, nowSec: () => 1_000 });
const row = (over = {}) => ({ id: PID, name: 'Dunia', template: 'taman', owner_id: 'u1', latest_version: 2, live_version: null, pending_version: null, rejected: null, takedown: null, updated_at: '2026-10-13T00:00:00Z', ...over });

test('tanpa konfigurasi -> pesan jelas', () => {
  assert.throws(() => createCloud({ url: '', key: '', store: memStore() }), /Konfigurasi Supabase/);
});

test('projectFromRow: status diterjemahkan dengan aturan siklus hidup yang sama', () => {
  assert.equal(projectFromRow(row()).status, 'draf');
  assert.equal(projectFromRow(row({ pending_version: 2 })).status, 'ditinjau');
  assert.equal(projectFromRow(row({ live_version: 1 })).status, 'terbit');
  assert.equal(projectFromRow(row({ live_version: 1, pending_version: 2 })).label, 'Terbit (versi baru sedang ditinjau)');
  assert.equal(projectFromRow(row({ rejected: { version: 1, reason: 'x' } })).status, 'ditolak');
  assert.equal(projectFromRow(row({ takedown: { version: 1, reason: 'x' } })).status, 'ditarik');
  assert.equal(projectFromRow(row()).ownerId, 'u1');
});

test('login: sesi tersimpan, salah sandi -> pesan Indonesia, daftar butuh konfirmasi', async () => {
  const store = memStore();
  const ok = mk(async () => res(200, { access_token: 't', refresh_token: 'r', expires_in: 3600, user: { id: 'u9', email: 'z@z.z' } }), store);
  await ok.signIn(' z@z.z ', 'rahasia');
  assert.equal(ok.userId(), 'u9');
  assert.equal(ok.email(), 'z@z.z');
  ok.signOut();
  assert.equal(ok.session(), null);
  await assert.rejects(() => mk(async () => res(400, { msg: 'Invalid login credentials' }), memStore()).signIn('a', 'b'), /Email atau kata sandi salah/);
  const r = await mk(async () => res(200, { user: { id: 'n' } }), memStore()).signUp('a@b.c', 'rahasia1');
  assert.equal(r.needsConfirm, true);
});

test('token kedaluwarsa diperbarui; gagal diperbarui -> sesi dihapus', async () => {
  const old = JSON.stringify({ access_token: 'lama', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } });
  const seen = [];
  const c = createCloud({ url: 'https://x.supabase.co', key: 'anon', store: memStore(old), nowSec: () => 1000, fetchImpl: async (u, i) => {
    seen.push(u);
    if (u.includes('refresh_token')) return res(200, { access_token: 'baru', refresh_token: 'r2', expires_in: 3600 });
    assert.equal(i.headers.Authorization, 'Bearer baru');
    return res(200, []);
  } });
  await c.listProjects();
  assert.ok(seen[0].includes('refresh_token'));
  const store = memStore(old);
  const dead = createCloud({ url: 'https://x.supabase.co', key: 'anon', store, nowSec: () => 1000, fetchImpl: async () => res(400, { msg: 'x' }) });
  await assert.rejects(() => dead.listProjects(), /Sesi berakhir/);
  assert.equal(store.peek(), null);
});

test('tanpa sesi: ditolak sebelum jaringan', async () => {
  let hit = 0;
  const c = mk(async () => { hit++; return res(200, []); }, memStore());
  await assert.rejects(() => c.listProjects(), /masuk dulu/);
  await assert.rejects(() => c.createProject('x'), /masuk dulu/);
  assert.equal(hit, 0);
});

test('buat proyek: pemilik dari sesi (bukan dari masukan), kembalian dipetakan', async () => {
  let call;
  const c = mk(async (u, i) => { call = { u, i }; return res(201, [row({ name: 'Baru', latest_version: 0 })]); });
  const p = await c.createProject('  Baru  ', 'taman');
  assert.match(call.u, /\/rest\/v1\/world_projects\?select=/);
  assert.equal(call.i.headers.Prefer, 'return=representation');
  assert.deepEqual(JSON.parse(call.i.body), { owner_id: 'u1', name: 'Baru', template: 'taman' });
  assert.equal(p.status, 'draf');
});

test('simpan versi: memanggil rpc dengan data proyek; nomor kembalian divalidasi', async () => {
  let call;
  const c = mk(async (u, i) => { call = { u, i }; return res(200, 3); });
  const project = newProject('kosong');
  assert.equal(await c.saveVersion(PID, project, 'catatan'), 3);
  assert.match(call.u, /rpc\/dunia_simpan_versi$/);
  const body = JSON.parse(call.i.body);
  assert.equal(body.p_project, PID);
  assert.equal(body.p_data.format, 'orbit.world');
  assert.equal(body.p_note, 'catatan');
  await assert.rejects(() => mk(async () => res(200, 'bukan angka')).saveVersion(PID, project), /Nomor versi tidak valid/);
});

test('ID proyek dan versi dipaksa bentuk valid (tidak bisa menyisipkan filter ke URL)', async () => {
  let hit = 0;
  const c = mk(async () => { hit++; return res(200, []); });
  for (const bad of ["x&id=neq.1", PID + '&select=*', '', null, 5, "../x"]) {
    await assert.rejects(() => c.listVersions(bad), /ID proyek tidak valid/);
    await assert.rejects(() => c.submit(bad, 1), /ID proyek tidak valid/);
    await assert.rejects(() => c.audit(bad), /ID proyek tidak valid/);
  }
  for (const bad of [0, 101, 1.5, '1', null, NaN]) await assert.rejects(() => c.submit(PID, bad), /Nomor versi tidak valid/);
  assert.equal(hit, 0);
});

test('muat versi: mengembalikan data mentah; tidak ada -> pesan jelas', async () => {
  let url;
  const c = mk(async (u) => { url = u; return res(200, [{ data: { format: 'orbit.world' } }]); });
  assert.deepEqual(await c.loadVersion(PID, 2), { format: 'orbit.world' });
  assert.match(url, /project_id=eq\.8c51cff9[^&]*&version=eq\.2&select=data$/);
  await assert.rejects(() => mk(async () => res(200, [])).loadVersion(PID, 9), /tidak ditemukan/);
});

test('ajukan, batal, tarik memanggil fungsi yang benar', async () => {
  const calls = [];
  const c = mk(async (u, i) => { calls.push([u.split('/rpc/')[1], JSON.parse(i.body)]); return res(204, null); });
  await c.submit(PID, 2);
  await c.withdraw(PID);
  await c.unpublish(PID);
  await c.takedown(PID, 'Melanggar');
  assert.deepEqual(calls, [
    ['dunia_ajukan', { p_project: PID, p_version: 2 }],
    ['dunia_batal_ajukan', { p_project: PID }],
    ['dunia_tarik', { p_project: PID, p_alasan: null }],
    ['dunia_tarik', { p_project: PID, p_alasan: 'Melanggar' }],
  ]);
});

test('moderator: cek peran, daftar pengajuan, putuskan (setuju hanya bila === true)', async () => {
  const calls = [];
  const c = mk(async (u, i) => {
    calls.push(u);
    if (u.endsWith('bisa_moderasi_dunia')) return res(200, true);
    if (u.includes('pending_version=not.is.null')) return res(200, [row({ pending_version: 2 })]);
    calls.push(JSON.parse(i.body));
    return res(204, null);
  });
  assert.equal(await c.canModerate(), true);
  assert.equal((await c.pendingReviews())[0].status, 'ditinjau');
  const lv = mk(async (u) => { calls.push(u); return res(200, [row({ live_version: 2 })]); });
  assert.equal((await lv.liveWorlds())[0].status, 'terbit');
  assert.ok(calls.at(-1).includes('live_version=not.is.null'));
  await c.decide(PID, 2, 'true', null); // string bukan boolean true -> ditolak, bukan disetujui
  assert.equal(calls.at(-1).p_setuju, false);
  await c.decide(PID, 2, true);
  assert.equal(calls.at(-1).p_setuju, true);
  assert.equal(await mk(async () => res(403, { code: '42501' })).canModerate(), false);
});

test('pesan galat database: pesan Indonesia dari fungsi diteruskan, kode lain diterjemahkan', async () => {
  const fail = (status, body) => mk(async () => res(status, body));
  await assert.rejects(() => fail(400, { code: 'P0001', message: 'Masih ada versi yang sedang ditinjau.' }).submit(PID, 2), /sedang ditinjau/);
  await assert.rejects(() => fail(403, { code: '42501', message: 'x' }).submit(PID, 2), /Tidak punya izin/);
  await assert.rejects(() => fail(400, { code: '23514', message: 'raw detail internal' }).saveVersion(PID, newProject('kosong')), /bentuk yang diizinkan/);
  await assert.rejects(() => fail(500, { code: 'XX000', message: 'rahasia internal' }).submit(PID, 2), (e) => /Permintaan gagal \(500\)/.test(e.message) && !/rahasia/.test(e.message));
  await assert.rejects(() => fail(400, { code: '54000', message: 'Batas 100 versi tercapai.' }).saveVersion(PID, newProject('kosong')), /Batas 100 versi/);
});
