import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStats, makeAdminHeader, verifyAdminHeader } from './admin-stats.js';
import { buildAlerts, countAlerts, eventStatus, parseRole, parseRoomName, worldFor } from './admin-shared.js';
import handler from '../api/admin/stats.js';

const SECRET = 'rahasia-panjang-untuk-uji-123';
const NOW = Date.UTC(2026, 9, 14, 5, 0, 0); // 14 Okt 2026 12:00 WIB
const ENV = {
  LIVEKIT_URL: 'wss://proyek.livekit.cloud', LIVEKIT_API_KEY: 'APIkeyRahasia1', LIVEKIT_API_SECRET: 'livekit-secret-sangat-rahasia-1234',
  SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'anon-key-rahasia-xyz', EVENT_ROLE_SECRET: SECRET, VERCEL_GIT_COMMIT_SHA: 'a1b2c3d4e5f6',
};

const fakeRooms = () => ({
  listRooms: async () => [
    { name: 'orbit-hall', numParticipants: 1, creationTime: 1760000000n },
    { name: 'nikora-villa', numParticipants: 2, creationTime: 1760000100 },
    { name: 'evt-pernikahan-roni-rina-villa', numParticipants: 1, creationTime: 1760000200 },
    { name: 'kosong', numParticipants: 0, creationTime: 1 },
  ],
  listParticipants: async (room) => ({
    'orbit-hall': [{ identity: 'abcdefghijklmnop', name: 'Budi', metadata: '', joinedAt: 1760000010 }],
    'nikora-villa': [{ identity: 'p1', name: 'Ron', metadata: JSON.stringify({ role: 'owner' }), joinedAt: 1760000110 }, { identity: 'p2', name: 'Rina', metadata: '{"role":"admin"}', joinedAt: 1760000120n }],
    'evt-pernikahan-roni-rina-villa': [{ identity: 'p3', name: 'MC Andi', metadata: JSON.stringify({ role: 'mc' }), joinedAt: 1760000210 }],
  })[room] ?? [],
});

const fetchOk = (rows, total = 7) => async () => ({ ok: true, status: 200, headers: { get: () => `0-${rows.length - 1}/${total}` }, json: async () => rows });
const ROWS = [
  { slug: 'pernikahan-roni-rina', groom: 'Roni', bride: 'Rina', event_type: 'pernikahan', event_date: '2026-10-14', theme: 'emas', extra: { title: 'Pernikahan Roni & Rina', tz: 'Asia/Jakarta' }, created_at: '2026-10-10T03:00:00Z' },
  { slug: 'tazkirah-aula', groom: null, bride: null, event_type: 'tazkirah', event_date: '2026-10-20', theme: null, extra: { mode: 'kajian' }, created_at: '2026-10-10T09:00:00Z' },
  { slug: 'tanpa-extra', groom: 'A', bride: 'B', event_type: 'ulang-tahun', event_date: null, theme: null, extra: null, created_at: '2026-10-12T01:00:00Z' },
];

test('verifyAdminHeader: header sah diterima; rahasia salah, rusak, kedaluwarsa, dari masa depan ditolak; tanpa rahasia tertutup', () => {
  const h = makeAdminHeader(SECRET, NOW);
  assert.deepEqual(verifyAdminHeader(SECRET, h, NOW), { ok: true });
  assert.deepEqual(verifyAdminHeader(SECRET, h, NOW + 299_000), { ok: true });
  assert.equal(verifyAdminHeader(SECRET, h, NOW + 301_000).reason, 'expired');
  assert.equal(verifyAdminHeader(SECRET, h, NOW - 301_000).reason, 'expired');
  assert.equal(verifyAdminHeader('rahasia-lain-yang-panjang-1', h, NOW).reason, 'unauthorized');
  for (const bad of [undefined, '', 'Admin', 'Bearer abc', `${h}x`, h.replace('Admin ', ''), 'Admin 123.abc', h.slice(0, -1) + (h.endsWith('A') ? 'B' : 'A')]) {
    assert.equal(verifyAdminHeader(SECRET, bad, NOW).ok, false, String(bad));
  }
  assert.equal(verifyAdminHeader('', h, NOW).reason, 'not_configured');
});

test('collectStats: semua layanan aktif -> ruang, peserta berperan, acara, dan tidak ada rahasia di keluaran', async () => {
  const stats = await collectStats({ env: ENV, now: NOW, makeRoomClient: fakeRooms, fetchImpl: fetchOk(ROWS) });
  assert.equal(stats.version, 'a1b2c3d');
  assert.deepEqual(stats.env, { livekit: true, supabase: true, roleSecret: true, serviceKey: false });
  assert.equal(stats.system.realtime.ok, true);
  assert.equal(stats.system.database.ok, true);
  assert.equal(stats.live.totalParticipants, 4);
  assert.equal(stats.live.rooms.length, 4);
  const villa = stats.live.rooms.find((r) => r.name === 'nikora-villa');
  assert.equal(villa.kind, 'umum');
  assert.equal(villa.world, 'villa');
  const evt = stats.live.rooms.find((r) => r.slug === 'pernikahan-roni-rina');
  assert.equal(evt.kind, 'acara');
  assert.equal(stats.live.participants.length, 4);
  const byName = Object.fromEntries(stats.live.participants.map((p) => [p.name, p]));
  assert.equal(byName.Ron.role, 'owner');
  assert.equal(byName['MC Andi'].role, 'mc');
  assert.equal(byName.Rina.role, 'guest', 'peran tidak dikenal dianggap tamu');
  assert.equal(byName.Budi.id.length, 12, 'identitas dipotong');
  assert.equal(stats.live.participants[0].name, 'MC Andi', 'terbaru bergabung di atas');
  assert.equal(stats.events.total, 7);
  assert.equal(stats.events.scope, 'aktif');
  const e = stats.events.items;
  assert.equal(e[0].title, 'Pernikahan Roni & Rina');
  assert.equal(e[0].world, 'villa');
  assert.equal(e[1].world, 'hall', 'tazkirah -> aula');
  assert.equal(e[1].title, 'tazkirah-aula', 'tanpa judul dan pasangan -> slug');
  assert.equal(e[2].title, 'A & B');
  assert.equal(e[2].mode, null);
  assert.deepEqual(stats.events.perDay, { '2026-10-10': 2, '2026-10-12': 1 });
  const dump = JSON.stringify(stats);
  for (const secret of [ENV.LIVEKIT_API_KEY, ENV.LIVEKIT_API_SECRET, ENV.SUPABASE_ANON_KEY, SECRET, 'proyek.livekit.cloud', 'abc.supabase.co']) {
    assert.ok(!dump.includes(secret), `bocor: ${secret}`);
  }
});

test('collectStats: LiveKit mati tidak merusak bagian lain; peringatan error muncul', async () => {
  const dead = () => ({ listRooms: async () => { throw new Error('ECONNREFUSED proyek.livekit.cloud secret'); }, listParticipants: async () => [] });
  const stats = await collectStats({ env: ENV, now: NOW, makeRoomClient: dead, fetchImpl: fetchOk(ROWS) });
  assert.equal(stats.system.realtime.ok, false);
  assert.equal(stats.system.realtime.error, 'Gagal dihubungi', 'pesan galat tidak membocorkan detail');
  assert.equal(stats.live.unavailable, true);
  assert.equal(stats.events.items.length, 3, 'acara tetap tampil');
  assert.ok(stats.alerts.some((a) => a.id === 'livekit-down' && a.level === 'error'));
});

test('collectStats: basis data mati / HTTP galat / timeout terisolasi', async () => {
  const down = await collectStats({ env: ENV, now: NOW, makeRoomClient: fakeRooms, fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) }) });
  assert.equal(down.system.database.ok, false);
  assert.equal(down.live.totalParticipants, 4, 'LiveKit tetap tampil');
  assert.ok(down.alerts.some((a) => a.id === 'db-down'));
  const slow = await collectStats({ env: ENV, now: NOW, timeoutMs: 40, makeRoomClient: () => ({ listRooms: () => new Promise(() => {}), listParticipants: async () => [] }), fetchImpl: fetchOk(ROWS) });
  assert.equal(slow.system.realtime.error, 'Tidak merespons (timeout)');
  assert.equal(slow.system.database.ok, true);
});

test('collectStats: kolom created_at tidak tersedia -> diulang tanpa itu, perDay null', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (url.includes('created_at')) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({}) };
    return fetchOk(ROWS.map(({ created_at, ...r }) => r))(url);
  };
  const stats = await collectStats({ env: ENV, now: NOW, makeRoomClient: fakeRooms, fetchImpl });
  assert.equal(calls, 2);
  assert.equal(stats.events.perDay, null);
  assert.equal(stats.events.items[0].createdAt, null);
  assert.equal(stats.events.items.length, 3);
});

test('collectStats: belum dikonfigurasi -> peringatan jelas; kunci layanan memberi cakupan semua', async () => {
  const empty = await collectStats({ env: {}, now: NOW });
  assert.equal(empty.system.realtime.configured, false);
  assert.equal(empty.system.database.configured, false);
  assert.equal(empty.env.roleSecret, false);
  const ids = empty.alerts.map((a) => a.id);
  assert.ok(ids.includes('livekit-config') && ids.includes('db-config') && ids.includes('role-open'));
  const svc = await collectStats({ env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'service-rahasia-123' }, now: NOW, makeRoomClient: fakeRooms, fetchImpl: fetchOk(ROWS) });
  assert.equal(svc.events.scope, 'semua');
  assert.equal(svc.env.serviceKey, true);
  assert.ok(!svc.alerts.some((a) => a.id === 'events-scope'));
  assert.ok(!JSON.stringify(svc).includes('service-rahasia-123'));
});

test('handler: 503 tanpa rahasia, 401 salah, 200 benar; metode lain ditolak; tidak di-cache', async () => {
  const mkRes = () => { const r = { headers: {}, code: 0, body: null, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const saved = { ...process.env };
  try {
    for (const k of Object.keys(ENV)) delete process.env[k];
    const h = makeAdminHeader(SECRET, Date.now());
    let res = mkRes();
    await handler({ method: 'GET', headers: { authorization: h } }, res);
    assert.equal(res.code, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    process.env.EVENT_ROLE_SECRET = SECRET;
    res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Admin 1700000000.' + 'a'.repeat(32) } }, res);
    assert.equal(res.code, 401);
    res = mkRes();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.code, 401);
    res = mkRes();
    await handler({ method: 'GET', headers: { authorization: h } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.env.roleSecret, true);
    assert.ok(Array.isArray(res.body.alerts));
    res = mkRes();
    await handler({ method: 'DELETE', headers: {} }, res);
    assert.equal(res.code, 405);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('admin-shared: nama ruang, peran, dunia bawaan, status acara, dan peringatan', () => {
  assert.equal(parseRoomName('orbit-hall').world, 'hall');
  assert.equal(parseRoomName('nikora-villa').kind, 'umum');
  assert.deepEqual([parseRoomName('evt-a1b-hall').slug, parseRoomName('evt-a1b-hall').world], ['a1b', 'hall']);
  assert.equal(parseRoomName('evt-X-villa').kind, 'lainnya', 'slug tidak valid');
  assert.equal(parseRoomName(undefined).kind, 'lainnya');
  assert.equal(parseRole('{"role":"owner"}'), 'owner');
  for (const m of [undefined, '', 'x', '{"role":"admin"}', 'null']) assert.equal(parseRole(m), 'guest');
  assert.equal(worldFor('pernikahan'), 'villa');
  assert.equal(worldFor('Wedding'), 'villa');
  assert.equal(worldFor('tazkirah'), 'hall');
  assert.equal(worldFor('tazkirah', 'villa'), 'villa', 'extra.world menang');
  assert.equal(eventStatus('2026-10-14', NOW), 'berlangsung');
  assert.equal(eventStatus('2026-10-13', NOW), 'selesai');
  assert.equal(eventStatus('2026-10-15T00:00:00Z', NOW), 'mendatang');
  assert.equal(eventStatus(null, NOW), 'tanpa-tanggal');
  assert.equal(eventStatus('bukan tanggal', NOW), 'tanpa-tanggal');
  const alerts = buildAlerts({ system: { realtime: { configured: true, ok: true, ms: 2000 }, database: { configured: true, ok: true, ms: 50 } }, env: { roleSecret: true }, events: { configured: true, scope: 'aktif' } });
  assert.deepEqual(alerts.map((a) => a.id), ['livekit-slow', 'events-scope']);
  assert.equal(countAlerts(alerts), 1, 'info tidak dihitung sebagai peringatan');
  assert.deepEqual(buildAlerts(null), []);
});
