import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://undangan.example/studio' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { createClient } = await import('../src/studio/api.js');
const { parseRoute } = await import('../src/studio/route.js');
const { countdownInfo, csvCell, csvOf, fmtDay } = await import('../src/studio/format.js');
const { icon, ICON_NAMES } = await import('../src/studio/icons.js');
const { shellView, NAV } = await import('../src/studio/shell.js');
const { dashboardView, completion, miniEnvelope } = await import('../src/studio/dashboard.js');
const { templateView } = await import('../src/studio/template.js');
const { guestsView, mergeGuests, summarize } = await import('../src/studio/guests.js');
const { pickerView, settingsView, helpView } = await import('../src/studio/pages.js');
const { THEMES, getTheme } = await import('../src/themes/index.js');

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const ev = (t) => new dom.window.Event(t, { bubbles: true });
const NOW = Date.now();

test('route: halaman dikenal, slug disaring, selain itu ke dashboard', () => {
  assert.deepEqual(parseRoute(''), { page: 'dashboard', slug: null });
  assert.deepEqual(parseRoute('#/editor/Rani-Dimas'), { page: 'editor', slug: 'rani-dimas' });
  assert.deepEqual(parseRoute('#/tamu'), { page: 'tamu', slug: null });
  assert.deepEqual(parseRoute('#/template/a-b'), { page: 'template', slug: 'a-b' });
  assert.deepEqual(parseRoute('#/undangan/x%20y'), { page: 'undangan', slug: null });
  assert.deepEqual(parseRoute('#/hack/../../x'), { page: 'dashboard', slug: null });
  assert.deepEqual(parseRoute('#/editor/%E0%A4%A'), { page: 'editor', slug: null });
});

test('hitung mundur dan tanggal', () => {
  const at = (days) => new Date(NOW + days * 86400000).toISOString();
  assert.deepEqual(countdownInfo(at(0), NOW), { label: 'Hari ini', tone: 'today' });
  assert.deepEqual(countdownInfo(at(1), NOW), { label: 'Besok', tone: 'soon' });
  assert.deepEqual(countdownInfo(at(5), NOW), { label: '5 hari lagi', tone: 'soon' });
  assert.deepEqual(countdownInfo(at(40), NOW), { label: '40 hari lagi', tone: 'later' });
  assert.deepEqual(countdownInfo(at(-3), NOW), { label: 'Sudah lewat', tone: 'past' });
  assert.equal(countdownInfo(null).label, 'Tanggal belum diisi');
  assert.equal(countdownInfo('rusak').label, 'Tanggal belum diisi');
  assert.match(fmtDay('2026-12-12T10:00:00+08:00'), /Desember 2026/);
  assert.equal(fmtDay(null), '');
});

test('CSV: kutip digandakan, rumus Excel dinetralkan, BOM untuk Excel', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+62812'), '"\'+62812"');
  assert.equal(csvCell('baris1\nbaris2'), '"baris1 baris2"');
  assert.equal(csvCell(null), '""');
  const csv = csvOf([['Nama', 'Status'], ['Budi', 'Hadir']]);
  assert.ok(csv.startsWith('\ufeff"Nama","Status"\r\n'));
  assert.ok(csv.endsWith('"Budi","Hadir"\r\n'));
});

test('ikon: semua nama menghasilkan SVG tersembunyi dari pembaca layar; label membuatnya terbaca', () => {
  for (const n of ICON_NAMES) { const s = icon(n); assert.equal(s.getAttribute('aria-hidden'), 'true'); assert.ok(s.querySelector('path').getAttribute('d').length > 5, n); }
  assert.equal(icon('home', { label: 'Beranda' }).getAttribute('role'), 'img');
  assert.ok(icon('tidak-ada').querySelector('path'));
});

test('kerangka: menu lengkap, yang aktif ditandai, Editor/Template/Check-in membawa undangan terakhir, ada menu ponsel', () => {
  const shell = shellView({ active: 'tamu', email: 'a@b.c', slug: 'rani-dimas', onSignOut() {}, content: document.createElement('div') });
  document.body.append(shell);
  assert.deepEqual(NAV.map((n) => n.id), ['dashboard', 'tamu', 'checkin', 'editor', 'template', 'pengaturan', 'bantuan']);
  assert.equal(shell.querySelectorAll('.st-side a').length, 7);
  assert.equal(shell.querySelectorAll('.st-bnav a').length, 7);
  assert.equal(shell.querySelector('.st-side a.is-active').textContent, 'Tamu');
  assert.equal(shell.querySelector('.st-side a.is-active').getAttribute('aria-current'), 'page');
  const hrefs = [...shell.querySelectorAll('.st-side a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.includes('#/editor/rani-dimas') && hrefs.includes('#/template/rani-dimas') && hrefs.includes('#/tamu/rani-dimas') && hrefs.includes('#/checkin/rani-dimas'));
  assert.equal(shell.querySelector('.st-exit').textContent, 'Keluar');
  assert.equal(shell.querySelector('.st-chip').getAttribute('title'), 'a@b.c');
  const bare = shellView({ active: 'dashboard', email: '', slug: null, onSignOut() {}, content: document.createElement('div') });
  assert.ok([...bare.querySelectorAll('.st-side a')].some((a) => a.getAttribute('href') === '#/editor'));
});

const ITEMS = [
  { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan', event_date: new Date(NOW + 5 * 86400000).toISOString(), theme: 'pernikahan-islami', extra: { style: { colors: { accent: '#112233' } } } },
  { slug: 'taz-akbar', groom: 'Tazkirah Akbar', bride: '', event_type: 'tazkirah', event_date: new Date(NOW - 9 * 86400000).toISOString(), theme: 'tazkirah-teduh', extra: {} },
];
const STATS = { 'dimas-rani': { guests: 10, replied: 6, attending: 9, filled: 5 }, 'taz-akbar': { guests: 0, replied: 0, attending: 0, filled: 0 } };
const hrefs = { editor: (s) => `#/editor/${s}`, template: (s) => `#/template/${s}`, tamu: (s) => `#/tamu/${s}`, detail: (s) => `#/undangan/${s}` };

test('kelengkapan: tema, isi >= 3 adegan, tamu, tampilan sendiri', () => {
  const c = completion(ITEMS[0], STATS['dimas-rani']);
  assert.equal(c.pct, 100);
  assert.deepEqual(c.steps.map((s) => s.done), [true, true, true, true]);
  const c2 = completion(ITEMS[1], STATS['taz-akbar']);
  assert.equal(c2.pct, 25);
  assert.equal(c2.steps[1].label, 'Isi 0/8');
});

test('dasbor: ringkasan, kartu per undangan dengan amplop, hitung mundur, angka, dan jalan pintas', () => {
  const root = dashboardView({ items: ITEMS, stats: STATS, hrefs, onDelete: async () => 0 });
  document.body.append(root);
  const vals = [...root.querySelectorAll('.st-stat strong')].map((e) => e.textContent);
  assert.deepEqual(vals, ['2', '1', '10', '9', '4'], 'undangan, akan datang, tamu, hadir, belum membalas');
  const cards = root.querySelectorAll('article.st-card');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('h3').textContent, 'Dimas & Rani');
  assert.equal(cards[1].querySelector('h3').textContent, 'Tazkirah Akbar', 'tazkirah tanpa nama kedua');
  assert.match(cards[0].textContent, /Amplop: Islami/);
  assert.match(cards[0].textContent, /5 hari lagi/);
  assert.match(cards[1].textContent, /Sudah lewat/);
  assert.ok(cards[0].querySelector('.st-env'));
  assert.equal(cards[0].querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '100');
  const links = [...cards[0].querySelectorAll('.st-card-actions a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['#/editor/dimas-rani', '#/template/dimas-rani', '#/tamu/dimas-rani', '#/undangan/dimas-rani']);
  assert.doesNotMatch(root.textContent, /null|undefined/);
});

test('dasbor: kosong menampilkan ajakan membuat undangan', () => {
  const root = dashboardView({ items: [], stats: {}, hrefs, onDelete: async () => 0 });
  assert.match(root.textContent, /Belum ada undangan/);
  assert.ok(root.querySelector('a[href="#/buat"]'));
});

test('dasbor: mode Pilih, ketik HAPUS, hanya yang dipilih terhapus, gagal tampil pesan', async () => {
  const deleted = [];
  const root = dashboardView({ items: ITEMS, stats: STATS, hrefs, onDelete: async (s) => { deleted.push(...s); return s.length; } });
  document.body.append(root);
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Pilih').click();
  const boxes = root.querySelectorAll('.st-card-pick input[type=checkbox]');
  assert.equal(boxes.length, 2);
  boxes[1].checked = true; boxes[1].dispatchEvent(ev('change'));
  const word = root.querySelector('.st-delbar input[type=text]');
  const go = () => root.querySelector('.st-delbar .st-btn-danger');
  assert.equal(go().disabled, true);
  word.value = 'hapus'; word.dispatchEvent(ev('input')); assert.equal(go().disabled, true);
  word.value = 'HAPUS'; word.dispatchEvent(ev('input')); assert.equal(go().disabled, false);
  go().click(); await tick(5);
  assert.deepEqual(deleted, ['taz-akbar']);
  assert.equal(root.querySelectorAll('article.st-card').length, 1);
  assert.match(root.querySelector('.s-msg').textContent, /1 undangan dihapus/);
  const failing = dashboardView({ items: ITEMS, stats: STATS, hrefs, onDelete: async () => { throw new Error('Hanya 1 dari 2 undangan yang terhapus.'); } });
  document.body.append(failing);
  [...failing.querySelectorAll('button')].find((b) => b.textContent === 'Pilih').click();
  const b0 = failing.querySelector('.st-card-pick input'); b0.checked = true; b0.dispatchEvent(ev('change'));
  const w = failing.querySelector('.st-delbar input[type=text]'); w.value = 'HAPUS'; w.dispatchEvent(ev('input'));
  failing.querySelector('.st-delbar .st-btn-danger').click(); await tick(5);
  assert.match(failing.querySelector('.s-msg').textContent, /Hanya 1 dari 2/);
});

test('miniatur amplop memakai warna dan gaya tema (kado vs amplop)', () => {
  const kado = miniEnvelope(getTheme('ulang_tahun-balon'));
  assert.equal(kado.getAttribute('data-variant'), 'kado');
  assert.equal(kado.querySelector('.st-env-seal').getAttribute('data-seal'), 'pita');
  assert.equal(kado.style.getPropertyValue('--e1'), getTheme('ulang_tahun-balon').tokens.bg1);
  assert.equal(miniEnvelope(getTheme('pernikahan-islami')).getAttribute('data-variant'), 'amplop');
});

test('template: tema jenis acara ini tampil dulu, pilih mengganti pratinjau, simpan memanggil API, tema lain bisa ditampilkan', async () => {
  const saved = [];
  const client = { saveTheme: async (slug, id) => { saved.push({ slug, id }); return id; } };
  const root = templateView({ client, slug: 'dimas-rani', inv: { slug: 'dimas-rani', event_type: 'pernikahan', theme: 'pernikahan-islami' }, inviteBase: 'https://undangan.example/', onSaved() {} });
  document.body.append(root);
  const own = THEMES.filter((t) => t.eventType === 'pernikahan').length;
  assert.equal(root.querySelectorAll('.st-theme').length, own);
  assert.equal(root.querySelector('.st-theme.is-on strong').textContent, 'Islami');
  const useBtn = () => [...root.querySelectorAll('button')].find((b) => /tema ini/i.test(b.textContent));
  assert.equal(useBtn().disabled, true, 'tema yang sedang dipakai');
  const iframe = root.querySelector('iframe');
  assert.match(iframe.getAttribute('src'), /tema=pernikahan-islami/);
  const sasak = [...root.querySelectorAll('.st-theme')].find((b) => b.querySelector('strong').textContent === 'Adat Sasak');
  sasak.click();
  assert.match(root.querySelector('iframe').getAttribute('src'), /tema=pernikahan-adat-sasak/);
  assert.equal(useBtn().disabled, false);
  useBtn().click(); await tick(5);
  assert.deepEqual(saved, [{ slug: 'dimas-rani', id: 'pernikahan-adat-sasak' }]);
  assert.equal(root.querySelector('.st-theme.is-on .st-tag.is-ok').textContent.trim(), 'Dipakai');
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Tampilkan semua tema').click();
  assert.equal(root.querySelectorAll('.st-theme').length, THEMES.length);
  assert.ok(root.querySelector('a[href="#/editor/dimas-rani"]'), 'tersambung ke Editor');
});

test('tamu: gabungan daftar tamu dan RSVP dicocokkan lewat nama, ringkasan benar', () => {
  const rows = mergeGuests(
    [{ name: 'Bapak Ahmad', category: 'Keluarga' }, { name: 'Ibu Siti' }, { name: 'Budi' }],
    [{ name: ' bapak  ahmad ', attending: true, guests: 3, meal: 'Vegetarian', wish: 'Selamat' }, { name: 'Ibu Siti', attending: false }, { name: 'Tamu Link Umum', attending: true, guests: 2 }]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.status), ['hadir', 'tidak', 'belum', 'hadir']);
  assert.equal(rows[0].count, 3);
  assert.equal(rows[3].registered, false);
  assert.deepEqual(summarize(rows), { total: 4, hadir: 2, orang: 5, tidak: 1, belum: 1 });
});

test('tamu: halaman memantau status, saring, cari, WhatsApp pribadi, pilih undangan lain', async () => {
  const picked = [];
  const client = {
    guestsOf: async () => [{ id: 1, name: 'Bapak Ahmad', category: 'Keluarga' }, { id: 2, name: 'Budi' }],
    rsvpsOf: async () => [{ name: 'Bapak Ahmad', attending: true, guests: 2, wish: 'Barakallah' }],
  };
  const root = guestsView({ client, items: ITEMS, slug: 'dimas-rani', inviteBase: 'https://undangan.example/', worldBase: 'https://dunia.example', onPick: (s) => picked.push(s) });
  document.body.append(root);
  await tick(10);
  assert.deepEqual([...root.querySelectorAll('.st-stat strong')].map((e) => e.textContent), ['2', '2', '0', '1']);
  assert.equal(root.querySelectorAll('.st-guest').length, 2);
  assert.match(root.textContent, /Hadir \(2 orang\)/);
  assert.match(root.textContent, /Belum membalas/);
  const wa = [...root.querySelectorAll('.st-guest a')].find((a) => /Ingatkan/.test(a.textContent));
  assert.match(decodeURIComponent(wa.getAttribute('href')), /^https:\/\/wa\.me\/\?text=.*Budi.*to=Budi/);
  [...root.querySelectorAll('.st-chipbtn')].find((b) => b.textContent.startsWith('Hadir')).click();
  assert.equal(root.querySelectorAll('.st-guest').length, 1);
  [...root.querySelectorAll('.st-chipbtn')].find((b) => b.textContent.startsWith('Semua')).click();
  const q = root.querySelector('input[type=search]'); q.value = 'budi'; q.dispatchEvent(ev('input'));
  assert.equal(root.querySelectorAll('.st-guest').length, 1);
  q.value = 'zzz'; q.dispatchEvent(ev('input'));
  assert.match(root.querySelector('.st-guestlist').textContent, /Tidak ada tamu yang cocok/);
  const sel = root.querySelector('select'); sel.value = 'taz-akbar'; sel.dispatchEvent(ev('change'));
  assert.deepEqual(picked, ['taz-akbar']);
  assert.doesNotMatch(root.textContent, /null|undefined/);
});

test('tamu: tanpa undangan menampilkan ajakan; halaman lain (pilih, pengaturan, bantuan) lengkap', () => {
  const empty = guestsView({ client: {}, items: [], slug: null, inviteBase: 'https://u.example/', onPick() {} });
  assert.match(empty.textContent, /Belum ada undangan/);
  const picker = pickerView({ title: 'Editor', lead: 'Pilih', items: ITEMS, hrefFor: (s) => `#/editor/${s}` });
  assert.deepEqual([...picker.querySelectorAll('a.st-pick')].map((a) => a.getAttribute('href')), ['#/editor/dimas-rani', '#/editor/taz-akbar']);
  let out = 0;
  const st = settingsView({ email: 'a@b.c', onSignOut: () => { out += 1; } });
  assert.match(st.textContent, /a@b\.c/);
  st.querySelector('.st-btn-danger').click();
  assert.equal(out, 1);
  const help = helpView();
  assert.equal(help.querySelectorAll('.st-steps5 li').length, 5);
  assert.ok(help.querySelectorAll('details.st-faq').length >= 4);
});

test('API: myInvitations hanya milik akun; dashboardStats menghitung; saveTheme memverifikasi baris', async () => {
  const calls = [];
  const sess = JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-1' } });
  const store = { get: () => sess, set() {} };
  const mk = (replies) => createClient({ url: 'https://x.supabase.co', key: 'k', store, fetchImpl: async (u, o) => { calls.push({ u, o }); const hit = replies.find(([re]) => re.test(u)); return { ok: true, status: 200, json: async () => (hit ? hit[1] : []) }; } });
  const c = mk([[/invitations\?owner_id/, [{ slug: 'a-b' }]]]);
  await c.myInvitations();
  assert.match(calls[0].u, /invitations\?owner_id=eq\.u-1&select=/);
  const c2 = mk([[/\/guests\?/, [{ slug: 'a-b' }, { slug: 'a-b' }, { slug: 'orang-lain' }]], [/\/rsvps\?/, [{ slug: 'a-b', attending: true, guests: 3 }, { slug: 'a-b', attending: false, guests: 0 }, { slug: 'orang-lain', attending: true, guests: 9 }]],
    [/\/invitation_scenes\?/, [{ slug: 'a-b', kind: 'surat', active: true, config: { greeting: 'Hai' } }, { slug: 'a-b', kind: 'kisah', active: true, config: { tokens: { a: 1 } } }, { slug: 'a-b', kind: 'cover', active: true, config: {} }, { slug: 'a-b', kind: 'penutup', active: false, config: { body: 'x' } }, { slug: 'orang-lain', kind: 'surat', active: true, config: { greeting: 'x' } }]]]);
  const st = await c2.dashboardStats(['a-b']);
  assert.deepEqual(st, { 'a-b': { guests: 2, replied: 2, attending: 3, filled: 1 } });
  const ok = mk([[/invitations\?slug=eq\.a-b/, [{ slug: 'a-b' }]]]);
  assert.equal(await ok.saveTheme('a-b', 'pernikahan-islami'), 'pernikahan-islami');
  await assert.rejects(() => ok.saveTheme('a-b', 'tema-palsu'), /tidak dikenal/);
  const none = mk([]);
  await assert.rejects(() => none.saveTheme('a-b', 'pernikahan-islami'), /tidak tersimpan/);
});
