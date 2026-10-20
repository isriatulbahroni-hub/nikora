import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://undangan.example/studio' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { createCheckinApi, formatCode, normalizeCode } = await import('../src/studio/checkin-api.js');
const { checkinView } = await import('../src/studio/checkin.js');
const { queueView } = await import('../src/studio/checkin-admin.js');
const { parseRoute } = await import('../src/studio/route.js');
const { NAV } = await import('../src/studio/shell.js');

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
const btn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const liOf = (root, text) => [...root.querySelectorAll('li')].find((li) => li.textContent.includes(text));

// ---------- kode kartu ----------
test('kode kartu: diformat per empat karakter dan dinormalkan untuk dibandingkan', () => {
  assert.equal(formatCode('a1b2c3d4e5f6'), 'A1B2-C3D4-E5F6');
  assert.equal(normalizeCode('a1b2-c3d4 e5f6'), 'A1B2C3D4E5F6');
  assert.equal(formatCode(''), '');
  assert.equal(formatCode('ABCD'), 'ABCD');
});

// ---------- klien API ----------
function mkApi(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers };
    calls.push(call);
    const r = handler(call);
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  const client = { userId: () => 'u-1', accessToken: async () => 'tok' };
  return { calls, api: createCheckinApi({ client, url: 'https://x.supabase.co/', key: 'anon', fetchImpl }) };
}

test('ajukan: nama dirapikan, pemohon dari sesi, token dipakai; isian salah ditolak sebelum jaringan', async () => {
  const { api, calls } = mkApi(() => ({ status: 201, body: null }));
  await api.request('rani-dimas', { guestName: '  Bapak   Ahmad\n ', partySize: '3', note: '' });
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/checkin_requests');
  assert.deepEqual(calls[0].body, { slug: 'rani-dimas', requested_by: 'u-1', guest_name: 'Bapak Ahmad', party_size: 3, note: null });
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  await assert.rejects(() => api.request('rani-dimas', { guestName: ' ', partySize: 1 }), /wajib/);
  await assert.rejects(() => api.request('rani-dimas', { guestName: 'A', partySize: 51 }), /1 sampai 50/);
  await assert.rejects(() => api.request('rani-dimas', { guestName: 'A', partySize: -2 }), /1 sampai 50/);
  assert.equal(calls.length, 1);
});

test('ajukan: ditolak RLS (403) menjadi pesan yang bisa dimengerti', async () => {
  const { api } = mkApi(() => ({ status: 403, body: { code: '42501', message: 'new row violates row-level security policy' } }));
  await assert.rejects(() => api.request('bukan-milikku', { guestName: 'A', partySize: 1 }), /Pengajuan ditolak sistem/);
});

test('batalkan: hanya yang menunggu; id dipaksa angka; tidak ada baris berubah -> galat', async () => {
  let rows = [{ id: 5 }];
  const { api, calls } = mkApi(() => ({ status: 200, body: rows }));
  await api.cancel(5);
  assert.equal(calls[0].method, 'PATCH');
  assert.match(calls[0].url, /checkin_requests\?id=eq\.5&status=eq\.menunggu$/);
  assert.deepEqual(calls[0].body, { status: 'dibatalkan' });
  rows = [];
  await assert.rejects(() => api.cancel(5), /tidak bisa dibatalkan/);
  await assert.rejects(() => api.cancel('5&x=1'), /ID tidak valid/);
  assert.equal(calls.length, 2);
});

test('setujui: memanggil fungsi database, kamar dirapikan, hasil dipetakan; galat database berbahasa Indonesia diteruskan', async () => {
  let reply = { status: 200, body: [{ kartu_id: 11, kode: '0123456789AB', berlaku_sampai: '2026-12-14T00:00:00Z' }] };
  const { api, calls } = mkApi(() => reply);
  const out = await api.approve(7, { roomLabel: '  Kamar   5 ' });
  assert.deepEqual(out, { id: 11, code: '0123456789AB', expiresAt: '2026-12-14T00:00:00Z' });
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/setujui_pengajuan_checkin');
  assert.deepEqual(calls[0].body, { p_request_id: 7, p_room_label: 'Kamar 5', p_expires_at: null });
  await api.approve(7, {});
  assert.equal(calls[1].body.p_room_label, null);
  reply = { status: 400, body: { code: 'P0001', message: 'Pengajuan ini sudah diproses.' } };
  await assert.rejects(() => api.approve(7), /sudah diproses/);
  reply = { status: 403, body: { code: '42501', message: 'permission denied for function' } };
  await assert.rejects(() => api.approve(7), (e) => /Tidak punya izin/.test(e.message) && !/permission denied/.test(e.message));
  reply = { status: 500, body: {} };
  await assert.rejects(() => api.approve(7), /gagal \(500\)/);
  reply = { status: 200, body: [] };
  await assert.rejects(() => api.approve(7), /tidak terbit/);
});

test('tolak, cabut, antrean, dan kartu aktif memakai alamat yang benar', async () => {
  const { api, calls } = mkApi(() => ({ status: 200, body: [] }));
  await api.reject(8, '  Kamar   penuh ');
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/tolak_pengajuan_checkin');
  assert.deepEqual(calls[0].body, { p_request_id: 8, p_note: 'Kamar penuh' });
  await api.revoke(10);
  assert.deepEqual(calls[1].body, { p_card_id: 10 });
  assert.match(calls[1].url, /rpc\/cabut_kartu_checkin$/);
  await api.queue();
  assert.match(calls[2].url, /checkin_requests\?status=eq\.menunggu/);
  assert.match(calls[2].url, /invitations\(groom,bride,event_type\)/);
  await api.activeCards();
  assert.match(calls[3].url, /checkin_cards\?revoked_at=is\.null&expires_at=gt\./);
  await api.requestsOf('rani-dimas');
  assert.match(calls[4].url, /checkin_requests\?slug=eq\.rani-dimas/);
});

// ---------- halaman pemilik acara ----------
const NOW = Date.parse('2026-10-19T00:00:00Z');
const REQUESTS = [
  { id: 4, guest_name: 'Pak Budi', party_size: 2, note: null, status: 'menunggu', decision_note: null, created_at: '2026-10-18T10:00:00Z' },
  { id: 3, guest_name: 'Keluarga Sari', party_size: 4, status: 'disetujui', created_at: '2026-10-17T10:00:00Z' },
  { id: 2, guest_name: 'Pak Anto', party_size: 1, status: 'ditolak', decision_note: 'Kamar penuh', created_at: '2026-10-16T10:00:00Z' },
  { id: 1, guest_name: 'Bu Lina', party_size: 1, status: 'disetujui', created_at: '2026-10-15T10:00:00Z' },
];
const CARDS = [
  { id: 10, request_id: 3, code: 'A1B2C3D4E5F6', guest_name: 'Keluarga Sari', room_label: 'Kamar 3', expires_at: '2026-12-14T00:00:00Z', revoked_at: null },
  { id: 9, request_id: 1, code: 'FFFFEEEEDDDD', guest_name: 'Bu Lina', room_label: null, expires_at: '2026-12-14T00:00:00Z', revoked_at: '2026-10-18T00:00:00Z' },
];
function ownerApi({ requests = REQUESTS, cards = CARDS } = {}) {
  const calls = [];
  return { calls, api: { requestsOf: async () => requests, cardsOf: async () => cards, request: async (slug, v) => { calls.push(['request', slug, v]); }, cancel: async (id) => { calls.push(['cancel', id]); } } };
}
const mountOwner = async (opts) => {
  const f = ownerApi(opts);
  const v = checkinView({ api: f.api, slug: 'rani-dimas', title: 'Dimas & Rani', now: () => NOW });
  document.body.append(v);
  await tick();
  return { v, f };
};

test('pemilik: semua status tampil; kode hanya untuk kartu aktif; ada tombol Batalkan hanya untuk yang menunggu', async () => {
  const { v } = await mountOwner();
  assert.equal(v.querySelectorAll('.s-list > li').length, 4);
  const budi = liOf(v, 'Pak Budi');
  assert.match(budi.textContent, /Menunggu admin/);
  assert.ok(btn(budi, 'Batalkan'));
  const sari = liOf(v, 'Keluarga Sari');
  assert.match(sari.textContent, /A1B2-C3D4-E5F6/);
  assert.match(sari.textContent, /Kamar: Kamar 3/);
  assert.match(sari.textContent, /Status kartu: Aktif/);
  assert.equal(btn(sari, 'Batalkan'), undefined);
  assert.match(liOf(v, 'Pak Anto').textContent, /Alasan: Kamar penuh/);
  const lina = liOf(v, 'Bu Lina');
  assert.match(lina.textContent, /Dicabut admin/);
  assert.doesNotMatch(lina.textContent, /FFFF/, 'kode kartu yang dicabut tidak ditampilkan');
  v.remove();
});

test('pemilik: kartu kedaluwarsa tidak menampilkan kode', async () => {
  const old = [{ ...CARDS[0], expires_at: '2026-10-01T00:00:00Z' }];
  const { v } = await mountOwner({ cards: old });
  const sari = liOf(v, 'Keluarga Sari');
  assert.match(sari.textContent, /Kedaluwarsa/);
  assert.doesNotMatch(sari.textContent, /A1B2/);
  v.remove();
});

test('pemilik: kartu aktif bisa dikirim lewat WhatsApp dengan kode yang benar', async () => {
  const { v } = await mountOwner();
  const a = liOf(v, 'Keluarga Sari').querySelector('a[href^="https://wa.me/"]');
  assert.ok(a);
  assert.equal(a.rel, 'noopener noreferrer');
  const text = new URL(a.href).searchParams.get('text');
  assert.match(text, /Kode: A1B2-C3D4-E5F6/);
  assert.match(text, /Dimas & Rani/);
  v.remove();
});

test('pemilik: mengajukan mengirim isian, mengosongkan formulir, dan menampilkan pesan', async () => {
  const { v, f } = await mountOwner();
  v.querySelector('[name=guestName]').value = 'Pak Joko';
  v.querySelector('[name=partySize]').value = '3';
  v.querySelector('[name=note]').value = 'Dekat kolam';
  submit(v.querySelector('form')); await tick();
  assert.deepEqual(f.calls[0], ['request', 'rani-dimas', { guestName: 'Pak Joko', partySize: '3', note: 'Dekat kolam' }]);
  assert.match(v.querySelector('.s-msg').textContent, /Pengajuan terkirim/);
  assert.equal(v.querySelector('[name=guestName]').value, '');
  assert.equal(v.querySelector('[name=partySize]').value, '1');
  assert.equal(v.querySelector('button[type=submit]').disabled, false);
  v.remove();
});

test('pemilik: pengajuan gagal menampilkan pesan dan isian tidak hilang', async () => {
  const f = ownerApi();
  f.api.request = async () => { throw new Error('Pengajuan ditolak sistem.'); };
  const v = checkinView({ api: f.api, slug: 'rani-dimas', now: () => NOW });
  document.body.append(v);
  await tick();
  v.querySelector('[name=guestName]').value = 'Pak Joko';
  submit(v.querySelector('form')); await tick();
  assert.match(v.querySelector('.s-msg').textContent, /ditolak sistem/);
  assert.equal(v.querySelector('[name=guestName]').value, 'Pak Joko');
  assert.equal(v.querySelector('button[type=submit]').disabled, false);
  v.remove();
});

test('pemilik: membatalkan pengajuan yang menunggu', async () => {
  const { v, f } = await mountOwner();
  btn(liOf(v, 'Pak Budi'), 'Batalkan').click();
  await tick();
  assert.deepEqual(f.calls, [['cancel', 4]]);
  v.remove();
});

// ---------- antrean admin ----------
function adminApi() {
  const calls = [];
  const queue = [
    { id: 7, slug: 'rani-dimas', guest_name: 'Pak Budi', party_size: 2, note: 'dekat kolam', created_at: '2026-10-18T10:00:00Z', invitations: { groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan' } },
    { id: 8, slug: 'taz-akbar', guest_name: 'Rombongan Kendari', party_size: 10, note: null, created_at: '2026-10-18T11:00:00Z', invitations: [{ groom: 'Tazkirah Akbar', bride: 'Sisa', event_type: 'tazkirah' }] },
  ];
  const cards = [{ id: 10, slug: 'rani-dimas', code: 'A1B2C3D4E5F6', guest_name: 'Keluarga Sari', room_label: 'Kamar 3', expires_at: '2026-12-14T00:00:00Z' }];
  return {
    calls,
    api: {
      queue: async () => queue,
      activeCards: async () => cards,
      approve: async (id, o) => { calls.push(['approve', id, o]); return { id: 11, code: '0123456789AB', expiresAt: '2026-12-14T00:00:00Z' }; },
      reject: async (id, note) => { calls.push(['reject', id, note]); },
      revoke: async (id) => { calls.push(['revoke', id]); },
    },
  };
}
const mountQueue = async (f = adminApi()) => {
  const v = queueView({ api: f.api });
  document.body.append(v);
  await tick();
  return { v, f };
};

test('antrean: judul undangan mengikuti jenis acara (nama kedua hanya pernikahan; embed array juga dikenali)', async () => {
  const { v } = await mountQueue();
  assert.match(liOf(v, 'Pak Budi').textContent, /Dimas & Rani/);
  const rom = liOf(v, 'Rombongan Kendari').textContent;
  assert.match(rom, /Tazkirah Akbar/);
  assert.doesNotMatch(rom, /Sisa/);
  assert.match(v.textContent, /Menunggu persetujuan \(2\)/);
  assert.match(v.textContent, /Kartu aktif \(1\)/);
  v.remove();
});

test('antrean: setujui mengirim nama kamar, menampilkan kartu sekali dengan kode terformat, lalu memuat ulang', async () => {
  const { v, f } = await mountQueue();
  const row = liOf(v, 'Pak Budi');
  row.querySelector('[name=room]').value = 'Kamar 5';
  btn(row, 'Setujui').click();
  await tick();
  assert.deepEqual(f.calls[0], ['approve', 7, { roomLabel: 'Kamar 5' }]);
  const text = v.querySelector('code').textContent;
  assert.match(text, /Tamu: Pak Budi/);
  assert.match(text, /Kode: 0123-4567-89AB/);
  assert.match(text, /Kamar: Kamar 5/);
  assert.match(text, /Dimas & Rani/);
  v.remove();
});

test('antrean: setujui gagal menampilkan pesan dan tidak menampilkan kartu', async () => {
  const f = adminApi();
  f.api.approve = async () => { throw new Error('Pengajuan ini sudah diproses.'); };
  const { v } = await mountQueue(f);
  btn(liOf(v, 'Pak Budi'), 'Setujui').click();
  await tick();
  assert.match(v.querySelector('.s-msg').textContent, /sudah diproses/);
  assert.equal(v.querySelector('code'), null);
  v.remove();
});

test('antrean: tolak menanyakan alasan; batal di dialog tidak memanggil server', async () => {
  const { v, f } = await mountQueue();
  window.prompt = () => null;
  btn(liOf(v, 'Rombongan Kendari'), 'Tolak').click();
  await tick();
  assert.deepEqual(f.calls, []);
  window.prompt = () => 'Kamar penuh';
  btn(liOf(v, 'Rombongan Kendari'), 'Tolak').click();
  await tick();
  assert.deepEqual(f.calls, [['reject', 8, 'Kamar penuh']]);
  v.remove();
});

test('antrean: cabut kartu butuh konfirmasi', async () => {
  const { v, f } = await mountQueue();
  window.confirm = () => false;
  btn(liOf(v, 'Keluarga Sari'), 'Cabut').click();
  await tick();
  assert.deepEqual(f.calls, []);
  window.confirm = () => true;
  btn(liOf(v, 'Keluarga Sari'), 'Cabut').click();
  await tick();
  assert.deepEqual(f.calls, [['revoke', 10]]);
  v.remove();
});

test('antrean: gagal memuat menampilkan pesan, bukan crash', async () => {
  const v = queueView({ api: { queue: async () => { throw new Error('Tidak punya izin untuk tindakan ini.'); }, activeCards: async () => [] } });
  document.body.append(v);
  await tick();
  assert.match(v.querySelector('.s-msg').textContent, /Tidak punya izin/);
  v.remove();
});

// ---------- rute dan menu ----------
test('rute dan menu: #/checkin/<slug> dikenal dan ada di menu', () => {
  assert.deepEqual(parseRoute('#/checkin/rani-dimas'), { page: 'checkin', slug: 'rani-dimas' });
  const item = NAV.find((n) => n.id === 'checkin');
  assert.ok(item);
  assert.equal(item.path('rani-dimas'), '#/checkin/rani-dimas');
  assert.equal(item.path(), '#/checkin');
});

// ---------- penjaga migrasi ----------
const SQL = readFileSync(new URL('../../supabase/migrations/20261019060000_pengajuan_dan_kartu_checkin.sql', import.meta.url), 'utf8');
const fnBody = (name) => {
  const start = SQL.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `fungsi ${name} ada`);
  return SQL.slice(start, SQL.indexOf('$$;', SQL.indexOf('as $$', start)) + 3);
};

test('migrasi: RLS aktif, anon tidak punya akses, kartu tidak bisa ditulis klien, pemilik hanya bisa membatalkan', () => {
  for (const t of ['checkin_requests', 'checkin_cards']) {
    assert.match(SQL, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(SQL, new RegExp(`revoke all on public\\.${t} from anon`));
  }
  assert.doesNotMatch(SQL, /create policy[^;]*\bto (anon|public)\b/i);
  assert.doesNotMatch(SQL, /create policy[^;]*checkin_cards[^;]*for (insert|update|delete|all)/i);
  assert.match(SQL, /revoke insert, update, delete on public\.checkin_cards from authenticated/);
  assert.match(SQL, /grant update \(status\) on public\.checkin_requests to authenticated/);
  assert.match(SQL, /with check \(requested_by = auth\.uid\(\) and status = 'dibatalkan'\)/);
  assert.match(SQL, /status = 'menunggu'\s+and decided_by is null and decided_at is null and decision_note is null/);
});

test('migrasi: fungsi staf memeriksa is_staff dan hanya bisa dipanggil pengguna masuk; pemeriksaan kartu boleh anon', () => {
  for (const fn of ['setujui_pengajuan_checkin', 'tolak_pengajuan_checkin', 'cabut_kartu_checkin']) {
    assert.match(fnBody(fn), /not public\.is_staff\(\)/, `${fn} memeriksa staf`);
    assert.match(SQL, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    assert.match(SQL, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    assert.match(fnBody(fn), /security definer set search_path = public/);
  }
  assert.match(SQL, /grant execute on function public\.cek_kartu_checkin\(text, text\) to anon, authenticated;/);
  const cek = fnBody('cek_kartu_checkin');
  assert.match(cek, /revoked_at is null/);
  assert.match(cek, /expires_at > now\(\)/);
  assert.match(cek, /c\.slug = p_slug/);
  assert.match(fnBody('setujui_pengajuan_checkin'), /for update/);
});
