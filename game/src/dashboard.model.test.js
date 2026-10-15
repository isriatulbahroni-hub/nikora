import test from 'node:test';
import assert from 'node:assert/strict';
import { adminHeaderWeb, loadSecret, saveSecret, clearSecret } from './dashboard/auth.js';
import { fetchStats } from './dashboard/api.js';
import { chartGeometry, linePath, niceMax } from './dashboard/charts.js';
import { demoSamples, demoStats } from './dashboard/demo.js';
import { formatDate, formatNumber, hueFrom, initials, relativeTime } from './dashboard/format.js';
import { chartModel, eventsModel, latestEvents, linkTargets, overviewModel, pushSample, searchModel, securityModel, systemModel, usersModel, worldsModel, worldUrl } from './dashboard/model.js';
import { makeAdminHeader, verifyAdminHeader } from './admin-stats.js';

const SECRET = 'rahasia-panjang-untuk-uji-123';
const NOW = Date.UTC(2026, 9, 14, 5, 0, 0);

test('token admin browser identik dengan server dan diterima verifikasi', async () => {
  const web = await adminHeaderWeb(SECRET, NOW);
  assert.equal(web, makeAdminHeader(SECRET, NOW));
  assert.deepEqual(verifyAdminHeader(SECRET, web, NOW), { ok: true });
  assert.ok(!web.includes(SECRET), 'rahasia induk tidak ada di header');
  await assert.rejects(() => adminHeaderWeb(SECRET, NOW, null), /WebCrypto/);
});

test('sesi rahasia: simpan, muat (dinormalkan), hapus; penyimpanan rusak tidak melempar', () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  assert.equal(loadSecret(storage), '');
  saveSecret(storage, `  "${SECRET}"  `);
  assert.equal(loadSecret(storage), SECRET);
  saveSecret(storage, 'pendek');
  assert.equal(loadSecret(storage), '', 'terlalu pendek ditolak');
  saveSecret(storage, SECRET);
  clearSecret(storage);
  assert.equal(loadSecret(storage), '');
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(loadSecret(broken), '');
  saveSecret(broken, SECRET);
  clearSecret(broken);
});

test('fetchStats: sukses, 401 (rahasia salah / jam tidak sinkron), 503, 404, 500, jaringan putus, JSON rusak', async () => {
  const res = (status, body, ok = status >= 200 && status < 300) => async () => ({ status, ok, json: async () => { if (body === undefined) throw new Error('bad'); return body; } });
  const clock = (() => { let t = 0; return () => (t += 42); })();
  const good = await fetchStats({ secret: SECRET, now: NOW, fetchImpl: res(200, { system: {}, env: {} }), clock });
  assert.equal(good.ok, true);
  assert.equal(good.ms, 42);
  const sentHeader = [];
  await fetchStats({ secret: SECRET, now: NOW, fetchImpl: async (u, init) => { sentHeader.push(init.headers.authorization); return { status: 200, ok: true, json: async () => ({ system: {} }) }; }, clock });
  assert.equal(sentHeader[0], makeAdminHeader(SECRET, NOW));
  const code = async (r) => (await fetchStats({ secret: SECRET, now: NOW, fetchImpl: r, clock })).code;
  assert.equal(await code(res(401, { error: 'unauthorized' })), 'unauthorized');
  assert.equal(await code(res(401, { error: 'expired' })), 'expired');
  assert.equal(await code(res(401, undefined)), 'unauthorized');
  assert.equal(await code(res(503, {})), 'not_configured');
  assert.equal(await code(res(404, {})), 'not_found');
  assert.equal(await code(res(500, {})), 'server');
  assert.equal(await code(res(200, undefined)), 'server');
  assert.equal(await code(res(200, { aneh: true })), 'server', 'bentuk jawaban tidak valid');
  assert.equal(await code(async () => { throw new TypeError('fetch failed'); }), 'network');
  const bad = await fetchStats({ secret: SECRET, now: NOW, fetchImpl: res(503, {}), clock });
  assert.match(bad.message, /EVENT_ROLE_SECRET/);
});

test('format: angka id-ID, waktu relatif, tanggal WIB, inisial, hue stabil', () => {
  assert.equal(formatNumber(1284), '1.284');
  assert.equal(formatNumber(NaN), '—');
  assert.equal(relativeTime(NOW - 3000, NOW), 'baru saja');
  assert.equal(relativeTime(NOW - 30_000, NOW), '30 dtk lalu');
  assert.equal(relativeTime(NOW - 5 * 60_000, NOW), '5 mnt lalu');
  assert.equal(relativeTime(NOW - 3 * 3_600_000, NOW), '3 jam lalu');
  assert.equal(relativeTime(NOW - 2 * 86_400_000, NOW), '2 hari lalu');
  assert.equal(relativeTime(null, NOW), '—');
  assert.match(formatDate('2026-10-14'), /14 Okt 2026/);
  assert.equal(formatDate(null), '—');
  assert.equal(initials('Pernikahan Roni & Rina'), 'PR');
  assert.equal(initials('  '), '?');
  assert.equal(initials('tazkirah'), 'T');
  assert.equal(hueFrom('abc'), hueFrom('abc'));
  assert.ok(hueFrom('abc') >= 0 && hueFrom('abc') < 360);
});

test('overviewModel: kartu dari data contoh, dan keadaan tidak tersedia ditandai jelas', () => {
  const d = demoStats(NOW);
  const cards = Object.fromEntries(overviewModel(d).map((c) => [c.id, c]));
  assert.equal(cards.acara.value, '6');
  assert.equal(cards.online.value, '6');
  assert.equal(cards.dunia.value, '3');
  assert.equal(cards.peringatan.value, '0');
  assert.equal(cards.peringatan.sub, 'Semua berjalan normal');
  const broken = { ...d, live: { rooms: [], participants: [], totalParticipants: 0, unavailable: true }, events: { configured: false, scope: 'aktif', total: 0, items: [], perDay: null, unavailable: true }, system: { ...d.system, realtime: { configured: false, ok: false } } };
  const b = Object.fromEntries(overviewModel(broken).map((c) => [c.id, c]));
  assert.equal(b.acara.value, '—');
  assert.equal(b.online.value, '—');
  assert.equal(b.online.sub, 'Realtime belum aktif');
  assert.equal(b.online.tone, 'warn');
});

test('systemModel/securityModel: online, lambat, offline, belum diatur', () => {
  const d = demoStats(NOW);
  const rows = Object.fromEntries(systemModel(d, 87).map((r) => [r.id, r]));
  assert.equal(rows.api.detail, 'Respons waktu: 87ms');
  assert.equal(rows.database.badge, 'Online');
  const s = { ...d, system: { api: { ok: true }, database: { configured: true, ok: true, ms: 2500 }, realtime: { configured: true, ok: false, error: 'Tidak merespons (timeout)' } } };
  const r2 = Object.fromEntries(systemModel(s, null).map((r) => [r.id, r]));
  assert.equal(r2.database.state, 'warn');
  assert.equal(r2.realtime.state, 'down');
  assert.equal(r2.realtime.detail, 'Tidak merespons (timeout)');
  assert.equal(r2.api.detail, 'Berjalan');
  const none = Object.fromEntries(systemModel({ system: { database: { configured: false }, realtime: { configured: false } } }, 10).map((r) => [r.id, r]));
  assert.equal(none.database.badge, 'Belum diatur');
  assert.equal(securityModel({ env: { roleSecret: false } })[0].state, 'warn');
  assert.equal(securityModel(d)[0].badge, 'Aktif');
});

test('eventsModel: status menurut tanggal, hitungan, filter, dan pencarian', () => {
  const d = demoStats(NOW);
  const all = eventsModel(d, { now: NOW });
  assert.equal(all.counts.semua, 6);
  assert.equal(all.counts.berlangsung, 1);
  assert.equal(all.counts.selesai, 1);
  assert.equal(all.counts.mendatang, 3);
  assert.equal(all.counts['tanpa-tanggal'], 1);
  assert.equal(eventsModel(d, { now: NOW, filter: 'mendatang' }).shown, 3);
  assert.deepEqual(eventsModel(d, { now: NOW, query: 'ROKI' }).rows, []);
  assert.equal(eventsModel(d, { now: NOW, query: 'pernikahan' }).shown, 3);
  assert.equal(eventsModel(d, { now: NOW, query: 'karaoke', filter: 'mendatang' }).shown, 1);
  const first = all.rows[0];
  assert.equal(first.worldLabel.includes('Villa') || first.worldLabel.includes('Aula'), true);
  assert.equal(latestEvents(d, NOW, 3).length, 3);
  assert.equal(latestEvents(d, NOW, 3)[0].slug, 'ulang-tahun-nara', 'terbaru dibuat di atas');
});

test('worldsModel/usersModel/searchModel/linkTargets', () => {
  const d = demoStats(NOW);
  const w = worldsModel(d);
  assert.equal(w.length, 3, 'dua ruang umum + satu ruang acara');
  assert.deepEqual(w.slice(0, 2).map((x) => x.key), ['orbit-hall', 'nikora-villa']);
  assert.equal(w[2].url, '/villa.html?e=pernikahan-roni-rina');
  assert.equal(worldUrl('hall', null), '/');
  const empty = worldsModel({ live: { rooms: [], participants: [], totalParticipants: 0 } });
  assert.equal(empty.length, 2);
  assert.equal(empty[0].active, false);
  const u = usersModel(d);
  assert.deepEqual(u.summary, { total: 6, owner: 1, mc: 1, guest: 4 });
  assert.equal(usersModel(d, { query: 'dew' }).rows.length, 1);
  assert.deepEqual(searchModel(d, 'a').length, 0, 'minimal 2 huruf');
  const hits = searchModel(d, 'roni');
  assert.ok(hits.some((h) => h.type === 'acara') && hits.some((h) => h.type === 'pengguna'));
  assert.ok(searchModel(d, 'aula').some((h) => h.type === 'dunia'));
  assert.ok(searchModel(d, 'e').length === 0);
  const t = linkTargets(d);
  assert.equal(t[0].value, '');
  assert.equal(t.length, 7);
});

test('chartModel: live butuh 2+ sampel; 7/30/90 hari dari acara per hari; keadaan kosong dijelaskan', () => {
  const d = demoStats(NOW);
  assert.match(chartModel({ mode: 'live', samples: [], stats: d, now: NOW }).empty, /Mengumpulkan/);
  const live = chartModel({ mode: 'live', samples: demoSamples(NOW), stats: d, now: NOW });
  assert.equal(live.labels.length, 60);
  assert.equal(live.bars.length, 60);
  assert.equal(live.empty, null);
  const w = chartModel({ mode: '7', samples: [], stats: d, now: NOW });
  assert.equal(w.labels.length, 7);
  assert.equal(w.bars.reduce((a, b) => a + b, 0), 5, '5 dari 6 acara contoh dibuat dalam 7 hari terakhir (satu 9 hari lalu)');
  assert.equal(w.line.at(-1), 5, 'akumulasi berakhir di jumlah periode');
  const month = chartModel({ mode: '30', samples: [], stats: d, now: NOW });
  assert.equal(month.bars.reduce((a, b) => a + b, 0), 6);
  assert.equal(month.line.at(-1), 6);
  assert.equal(chartModel({ mode: '90', samples: [], stats: d, now: NOW }).labels.length, 90);
  assert.match(chartModel({ mode: '30', samples: [], stats: { events: { configured: true, perDay: null } }, now: NOW }).empty, /created_at/);
  assert.match(chartModel({ mode: '30', samples: [], stats: { events: { configured: false } }, now: NOW }).empty, /Database/);
});

test('pushSample: menimpa sampel yang terlalu rapat, membatasi panjang', () => {
  let s = [];
  s = pushSample(s, { t: 1000, users: 1, rooms: 1 });
  s = pushSample(s, { t: 3000, users: 2, rooms: 1 });
  assert.equal(s.length, 1);
  assert.equal(s[0].users, 2);
  for (let i = 0; i < 200; i++) s = pushSample(s, { t: 10_000 + i * 6000, users: i, rooms: 1 }, 50);
  assert.equal(s.length, 50);
  assert.equal(s.at(-1).users, 199);
});

test('chartGeometry: sumbu bagus, batang di dalam area, garis sejajar, label dijarangkan', () => {
  assert.equal(niceMax(0), 4);
  assert.equal(niceMax(1), 4);
  assert.equal(niceMax(5), 8);
  assert.equal(niceMax(7), 8);
  assert.equal(niceMax(23), 24);
  assert.equal(niceMax(180), 200);
  for (const v of [1, 3, 5, 9, 17, 23, 41, 99, 180, 1234]) {
    const max = niceMax(v);
    assert.ok(max >= v, `batas ${max} >= ${v}`);
    assert.ok(Number.isInteger(max / 4), `langkah bulat untuk ${v}`);
  }
  const labels = Array.from({ length: 30 }, (_, i) => `h${i}`);
  const g = chartGeometry({ labels, bars: labels.map((_, i) => i % 5), line: labels.map((_, i) => i), width: 600, height: 220 });
  assert.equal(g.bars.length, 30);
  assert.equal(g.line.length, 30);
  assert.ok(g.xLabels.length <= 9 && g.xLabels.length >= 2);
  assert.equal(g.xLabels.at(-1).text, 'h29', 'label terakhir selalu tampil');
  for (const b of g.bars) {
    assert.ok(b.x >= g.pad.left - 1 && b.x + b.w <= g.width - g.pad.right + 1, 'batang di dalam area');
    assert.ok(b.y >= g.pad.top - 0.01 && b.y + b.h <= g.baseline + 0.01);
  }
  assert.equal(g.ticks.length, 5);
  assert.equal(g.ticks[0].value, 0);
  assert.equal(g.ticks[0].y, g.baseline);
  assert.match(linePath(g.line), /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){29}$/);
  const flat = chartGeometry({ labels: ['a', 'b'], bars: [0, 0], line: null });
  assert.equal(flat.yMax, 4);
  assert.deepEqual(flat.line, []);
});
