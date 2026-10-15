// Halaman dasbor. Setiap fungsi menerima ctx dan mengembalikan elemen DOM. Semua teks lewat h()/textContent.
import { ROLE_LABELS, WORLD_LABELS } from '../admin-shared.js';
import { PAGES, buildLink, generateSecret, interpretServerCheck } from '../role-link.js';
import { INVITATION_URL, SOON, STUDIO_URL, invitationLink } from './config.js';
import { chartGeometry, linePath } from './charts.js';
import { h, svgEl } from './dom.js';
import { formatClock, formatDate, formatNumber, hueFrom, initials, relativeTime } from './format.js';
import { icon } from './icons.js';
import { STATUS_LABELS, chartModel, eventsModel, latestEvents, linkTargets, overviewModel, securityModel, systemModel, usersModel, worldUrl, worldsModel } from './model.js';

// ---------- komponen kecil ----------
const badge = (state, text) => h('span', { class: `badge ${state}` }, text);
const STATUS_TONE = { berlangsung: 'ok', mendatang: 'info', selesai: 'off', 'tanpa-tanggal': 'off' };
const statusBadge = (s) => badge(STATUS_TONE[s] ?? 'off', STATUS_LABELS[s] ?? s);
const roleBadge = (r) => badge(r === 'owner' ? 'gold' : r === 'mc' ? 'info' : 'off', ROLE_LABELS[r] ?? r);

function avatar(text) {
  const hue = hueFrom(text);
  return h('span', { class: 'avatar', style: `background:linear-gradient(135deg,hsl(${hue} 55% 42%),hsl(${(hue + 40) % 360} 60% 30%))`, 'aria-hidden': 'true' }, initials(text));
}

const pageHead = (title, subtitle, actions = []) => h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), subtitle && h('p', { class: 'muted' }, subtitle)), actions.length ? h('div', { class: 'actions' }, actions) : null);
const card = (cls, ...children) => h('section', { class: `card ${cls ?? ''}` }, children);
const cardHead = (title, right) => h('div', { class: 'card-head' }, h('h2', null, title), right);
const empty = (iconName, title, text) => h('div', { class: 'empty' }, icon(iconName, 28), h('strong', null, title), text && h('p', { class: 'muted' }, text));

/** Daftar baris responsif: tabel di layar lebar, kartu bertumpuk di HP. */
function rowList({ cols, head, rows, emptyNode }) {
  if (!rows.length) return emptyNode;
  const safeCols = cols.split(' ').map((c) => `minmax(0,${c})`).join(' ');
  return h('div', { class: 'rows', style: `--cols:${safeCols}` },
    h('div', { class: 'row head', role: 'row' }, head.map((t) => h('span', { role: 'columnheader' }, t))),
    rows.map((cells) => h('div', { class: 'row', role: 'row' }, cells.map(({ label, node, cls }) => h('div', { class: `cell ${cls ?? ''}`, 'data-label': label, role: 'cell' }, node)))));
}

const linkBtn = (text, href, { gold, ghost = true, ext = true, small = true } = {}) =>
  h('a', { class: `btn ${gold ? 'btn-gold' : 'btn-ghost'} ${small ? 'btn-sm' : ''}`, href, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null }, text, ext && icon('external', 14));
const navBtn = (ctx, text, route, query, opts = {}) => h('button', { type: 'button', class: `btn ${opts.gold ? 'btn-gold' : 'btn-ghost'} ${opts.small ? 'btn-sm' : ''}`, onclick: () => ctx.go(route, query) }, text);

// ---------- grafik ----------
function drawChart(model) {
  const W = window.innerWidth < 720 ? 360 : 640;
  const H = 230;
  const g = chartGeometry({ labels: model.labels, bars: model.bars, line: model.line, width: W, height: H });
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Grafik ${model.legend.map((l) => l.label).join(' dan ')}` });
  svg.append(svgEl('defs', null, svgEl('linearGradient', { id: 'barGold', x1: '0', y1: '0', x2: '0', y2: '1' }, svgEl('stop', { offset: '0', 'stop-color': '#e6c36a', 'stop-opacity': '.55' }), svgEl('stop', { offset: '1', 'stop-color': '#e6c36a', 'stop-opacity': '.18' }))));
  for (const t of g.ticks) {
    svg.append(svgEl('line', { x1: g.pad.left, x2: W - g.pad.right, y1: t.y, y2: t.y, class: 'grid' }));
    svg.append(svgEl('text', { x: g.pad.left - 6, y: t.y + 4, class: 'axis', 'text-anchor': 'end' }, formatNumber(Math.round(t.value * 10) / 10)));
  }
  g.bars.forEach((b, i) => svg.append(svgEl('rect', { x: b.x.toFixed(1), y: b.y.toFixed(1), width: b.w.toFixed(1), height: b.h.toFixed(1), rx: 3, fill: 'url(#barGold)' }, svgEl('title', null, `${model.labels[i]}: ${b.value}`))));
  if (g.line.length) {
    svg.append(svgEl('path', { d: linePath(g.line), class: 'line' }));
    g.line.forEach((p, i) => svg.append(svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: g.line.length > 40 ? 0 : 3, class: 'dot' }, svgEl('title', null, `${model.labels[i]}: ${p.value}`))));
  }
  for (const l of g.xLabels) svg.append(svgEl('text', { x: l.x.toFixed(1), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, l.text));
  return svg;
}

function chartCard(ctx) {
  const modes = [['live', 'Live'], ['7', '7 Hari'], ['30', '30 Hari'], ['90', '90 Hari']];
  const mode = ctx.ui.chartMode ?? (ctx.samples.length >= 2 ? 'live' : ctx.stats.events.perDay ? '7' : 'live'); // grafik live butuh 2+ sampel
  const model = chartModel({ mode, samples: ctx.samples, stats: ctx.stats, now: ctx.now });
  const title = mode === 'live' ? 'Aktivitas Platform · Live' : 'Acara Dibuat';
  return card('chart-card',
    cardHead(title, h('div', { class: 'seg', role: 'tablist' }, modes.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === mode), class: id === mode ? 'on' : '', onclick: () => ctx.setUi({ chartMode: id }) }, label)))),
    model.empty
      ? empty('chart', 'Belum ada data', model.empty)
      : h('div', null,
        h('div', { class: 'legend' }, model.legend.map((l) => h('span', null, h('i', { class: `swatch ${l.kind}` }), l.label))),
        drawChart(model)));
}

// ---------- status & peringatan ----------
function statusRow(r) {
  return h('div', { class: 'status-row' }, h('span', { class: 'ibox' }, icon(r.icon ?? (r.id === 'roles' ? 'key' : 'shield'), 18)), h('div', { class: 'grow' }, h('strong', null, r.label), h('small', { class: 'muted' }, r.detail)), badge(r.state === 'ok' ? 'ok' : r.state === 'warn' ? 'warn' : r.state === 'down' ? 'down' : 'off', r.badge));
}

function statusCard(ctx) {
  const all = ctx.stats.system.realtime.ok !== false && ctx.stats.system.database.ok !== false;
  const worst = systemModel(ctx.stats, ctx.apiMs).some((r) => r.state === 'down') ? 'down' : systemModel(ctx.stats, ctx.apiMs).some((r) => r.state === 'warn' || r.state === 'off') ? 'warn' : 'ok';
  const txt = worst === 'ok' ? 'Semua sistem berjalan normal' : worst === 'down' ? 'Ada layanan bermasalah' : 'Perlu perhatian';
  void all;
  return card('status-card',
    cardHead('Status Sistem', h('span', { class: `live-dot ${worst}` }, h('i'), txt)),
    systemModel(ctx.stats, ctx.apiMs).map(statusRow),
    h('div', { class: 'divider' }),
    securityModel(ctx.stats).map((r) => statusRow({ ...r, icon: r.id === 'roles' ? 'key' : 'shield' })));
}

function alertsCard(ctx) {
  const list = ctx.stats.alerts;
  if (!list.length) return null;
  return card('alerts-card', cardHead('Peringatan Sistem', badge(list.some((a) => a.level !== 'info') ? 'warn' : 'info', `${list.length}`)),
    list.map((a) => h('div', { class: `alert-row ${a.level}` }, icon(a.level === 'info' ? 'info' : 'alert', 18), h('div', null, h('strong', null, a.title), h('small', { class: 'muted' }, a.detail)))));
}

function promoCard() {
  return h('section', { class: 'card promo' }, h('small', { class: 'eyebrow' }, 'NIKORA / ORBIT WORLD'), h('h3', null, 'Wujudkan acara impian di dunia virtual'), h('p', null, 'Dari pernikahan, tazkirah, hingga event komunitas, semua dalam satu platform.'), linkBtn('Jelajahi Dunia 3D', '/villa.html', { gold: true, small: false }));
}

// ---------- baris acara ----------
function eventCells(e, ctx, { actions = 'lihat' } = {}) {
  const act = actions === 'lihat'
    ? navBtn(ctx, 'Lihat', 'acara', e.slug, { small: true })
    : h('div', { class: 'btn-group' }, linkBtn('Undangan', invitationLink(e.slug)), linkBtn('Dunia', worldUrl(e.world, e.slug)), navBtn(ctx, 'Tautan', 'tautan', e.slug, { small: true }));
  return [
    { label: 'Acara', cls: 'main', node: h('div', { class: 'who' }, avatar(e.title), h('div', null, h('strong', null, e.title), h('small', { class: 'muted' }, e.slug))) },
    { label: 'Jenis', node: e.typeLabel },
    { label: 'Dunia', node: e.world === 'villa' ? 'Vila' : 'Aula' },
    { label: 'Status', node: statusBadge(e.status) },
    { label: 'Tanggal', node: e.dateLabel },
    { label: 'Aksi', cls: 'act', node: act },
  ];
}

// ---------- halaman ----------
export function viewOverview(ctx) {
  const cards = overviewModel(ctx.stats);
  const latest = latestEvents(ctx.stats, ctx.now, 5);
  const alerts = alertsCard(ctx);
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Selamat datang ', h('span', { class: 'gold' }, 'kembali')), h('p', { class: 'muted' }, 'Pantau seluruh acara dan dunia virtual Anda.')),
      h('div', { class: 'actions' }, linkBtn('Buat Acara', STUDIO_URL, { gold: true, small: false }), navBtn(ctx, 'Kelola tautan', 'tautan', ''))),
    h('div', { class: 'stats' }, cards.map((c) => h('div', { class: `card stat ${c.tone}` }, h('span', { class: 'ibox big' }, icon(c.icon, 24)), h('div', null, h('small', { class: 'label' }, c.label), h('strong', { class: 'value' }, c.value), h('small', { class: `sub ${c.tone === 'warn' ? 'warn' : 'ok'}` }, c.sub))))),
    h('div', { class: 'cols' },
      h('div', { class: 'col' },
        chartCard(ctx),
        card('recent',
          cardHead('Aktivitas Terbaru', h('button', { type: 'button', class: 'link', onclick: () => ctx.go('acara', '') }, 'Lihat semua ', icon('chevron', 14))),
          rowList({ cols: '2.4fr 1.1fr .6fr 1.5fr 1.2fr .9fr', head: ['Nama Acara', 'Jenis', 'Dunia', 'Status', 'Tanggal', 'Aksi'], rows: latest.map((e) => eventCells(e, ctx)), emptyNode: empty('calendar', 'Belum ada acara', ctx.stats.events.configured ? 'Buat acara pertama lewat Studio.' : 'Hubungkan Supabase agar daftar acara tampil.') }))),
      h('div', { class: 'col side' }, statusCard(ctx), alerts, promoCard())));
}

export function viewEvents(ctx) {
  const m = eventsModel(ctx.stats, { now: ctx.now, query: ctx.ui.eventsQuery, filter: ctx.ui.eventsFilter });
  const chips = [['semua', 'Semua'], ['berlangsung', 'Berlangsung'], ['mendatang', 'Mendatang'], ['selesai', 'Selesai'], ['tanpa-tanggal', 'Tanpa tanggal']];
  const scopeNote = ctx.stats.events.scope === 'aktif' ? 'Menampilkan undangan aktif.' : 'Menampilkan semua undangan.';
  return h('div', { class: 'page' },
    pageHead('Acara & Undangan', `${formatNumber(ctx.stats.events.total)} acara · ${scopeNote}`, [linkBtn('Buat Acara', STUDIO_URL, { gold: true, small: false })]),
    card('',
      h('div', { class: 'toolbar' },
        h('label', { class: 'field grow' }, icon('search', 16), h('input', { id: 'events-search', type: 'search', placeholder: 'Cari judul, slug, atau jenis…', value: ctx.ui.eventsQuery, autocomplete: 'off', oninput: (e) => ctx.setUi({ eventsQuery: e.target.value }) })),
        h('div', { class: 'chips' }, chips.map(([id, label]) => h('button', { type: 'button', class: `chip ${ctx.ui.eventsFilter === id ? 'on' : ''}`, onclick: () => ctx.setUi({ eventsFilter: id }) }, label, h('b', null, m.counts[id]))))),
      rowList({ cols: '2fr .9fr .55fr 1.3fr 1fr 2.9fr', head: ['Nama Acara', 'Jenis', 'Dunia', 'Status', 'Tanggal', 'Aksi'], rows: m.rows.map((e) => eventCells(e, ctx, { actions: 'penuh' })), emptyNode: empty('calendar', m.counts.semua ? 'Tidak ada acara yang cocok' : 'Belum ada acara', m.counts.semua ? 'Ubah kata kunci atau filter.' : ctx.stats.events.configured ? 'Buat acara pertama lewat Studio.' : 'Hubungkan Supabase agar daftar acara tampil.') })));
}

export function viewWorlds(ctx) {
  const worlds = worldsModel(ctx.stats);
  const total = ctx.stats.live.totalParticipants;
  return h('div', { class: 'page' },
    pageHead('Dunia 3D', ctx.stats.live.unavailable ? 'Data realtime belum tersedia.' : `${formatNumber(total)} pengguna online di ${formatNumber(worlds.filter((w) => w.active).length)} ruang.`, [linkBtn('Buka Vila', '/villa.html', { gold: true, small: false }), linkBtn('Buka Aula', '/', { small: false })]),
    h('div', { class: 'tiles' }, worlds.map((w) => h('div', { class: `card tile ${w.active ? 'live' : ''}` },
      h('div', { class: 'tile-top' }, h('span', { class: 'ibox' }, icon('globe', 18)), badge(w.active ? 'ok' : 'off', w.active ? 'Aktif' : 'Kosong')),
      h('strong', null, w.label),
      h('div', { class: 'big-number' }, formatNumber(w.participants), h('small', { class: 'muted' }, ' online')),
      h('small', { class: 'muted' }, w.createdAt ? `Dibuka ${relativeTime(w.createdAt, ctx.now)}` : 'Belum ada yang masuk'),
      h('div', { class: 'btn-group' }, w.url ? linkBtn('Buka', w.url) : null, w.slug ? navBtn(ctx, 'Acara', 'acara', w.slug, { small: true }) : null)))),
    ctx.stats.live.unavailable ? card('', empty('signal', 'Realtime tidak tersedia', 'Daftar ruang tidak bisa dimuat. Lihat Status Sistem di Ringkasan.')) : null);
}

export function viewUsers(ctx) {
  const m = usersModel(ctx.stats, { query: ctx.ui.usersQuery });
  const chip = (label, n) => h('span', { class: 'chip static' }, label, h('b', null, n));
  return h('div', { class: 'page' },
    pageHead('Pengguna', 'Peserta yang sedang berada di dunia sekarang (live). Riwayat pengguna belum disimpan.'),
    card('',
      h('div', { class: 'toolbar' },
        h('label', { class: 'field grow' }, icon('search', 16), h('input', { id: 'users-search', type: 'search', placeholder: 'Cari nama atau ruang…', value: ctx.ui.usersQuery, autocomplete: 'off', oninput: (e) => ctx.setUi({ usersQuery: e.target.value }) })),
        h('div', { class: 'chips' }, chip('Online', m.summary.total), chip('Pemilik', m.summary.owner), chip('MC', m.summary.mc), chip('Tamu', m.summary.guest))),
      ctx.stats.live.unavailable
        ? empty('signal', 'Realtime tidak tersedia', 'Daftar peserta tidak bisa dimuat.')
        : rowList({ cols: '2fr 1fr 2.4fr 1fr', head: ['Nama', 'Peran', 'Ruang', 'Bergabung'], rows: m.rows.map((p) => [
          { label: 'Nama', cls: 'main', node: h('div', { class: 'who' }, avatar(p.name), h('strong', null, p.name)) },
          { label: 'Peran', node: roleBadge(p.role) },
          { label: 'Ruang', node: h('span', null, p.world ? WORLD_LABELS[p.world] : p.room, p.slug ? h('small', { class: 'muted block' }, p.slug) : null) },
          { label: 'Bergabung', node: relativeTime(p.joinedAt, ctx.now) },
        ]), emptyNode: empty('users', 'Belum ada yang online', 'Peserta muncul di sini saat membuka dunia.') })));
}

// ---------- tautan pemilik / MC ----------
function linkResult(ctx, role, url, event) {
  const status = h('div', { class: 'verify' });
  const copy = h('button', { type: 'button', class: 'btn btn-gold btn-sm' }, icon('copy', 14), 'Salin');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.replaceChildren(icon('check', 14), 'Tersalin');
    } catch {
      ctx.toast('Tekan lama tautan untuk menyalin.');
    }
  });
  const share = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => window.open(`https://wa.me/?text=${encodeURIComponent(`Tautan ${ROLE_LABELS[role]}: ${url}`)}`, '_blank', 'noopener') }, icon('send', 14), 'WhatsApp');
  const verify = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, icon('shield', 14), 'Periksa di server');
  verify.addEventListener('click', async () => {
    if (ctx.demo) return void (status.textContent = 'Mode contoh: pemeriksaan server dinonaktifkan.');
    status.textContent = 'Memeriksa…';
    status.className = 'verify';
    try {
      const res = await fetch('/api/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Uji', world: 'villa', event: event || undefined, key: new URL(url).searchParams.get('key') }) });
      const verdict = interpretServerCheck(res.ok ? await res.json() : null, role);
      status.textContent = `${verdict.ok ? '✓' : '✗'} ${verdict.message}`;
      status.className = `verify ${verdict.ok ? 'ok' : 'bad'}`;
    } catch {
      status.textContent = '✗ Tidak bisa menghubungi server.';
      status.className = 'verify bad';
    }
  });
  return h('div', { class: 'link-card' }, h('div', { class: 'link-title' }, roleBadge(role), h('small', { class: 'muted' }, role === 'owner' ? 'Kontrol penuh panggung, suara terdengar di mana pun' : 'Membuka panggung dan menaikkan pembicara')), h('code', { class: 'link-url' }, url), h('div', { class: 'btn-group' }, copy, share, verify), status);
}

export function viewLinks(ctx) {
  const targets = linkTargets(ctx.stats);
  const results = h('div', { class: 'link-results' });
  const selected = targets.find((t) => t.value === ctx.ui.linkEvent) ?? targets[0];
  const page = ctx.ui.linkPage || (selected.world === 'hall' ? 'hall' : 'villa');
  const make = async () => {
    if (!ctx.secret) return ctx.toast('Mode contoh tidak memiliki rahasia. Masuk dengan rahasia induk untuk membuat tautan sungguhan.');
    results.replaceChildren();
    try {
      for (const role of ['owner', 'mc']) {
        const { url } = await buildLink({ origin: window.location.origin, page, event: selected.value, role, secret: ctx.secret });
        results.append(linkResult(ctx, role, url, selected.value));
      }
    } catch (error) {
      ctx.toast(String(error?.message ?? error));
    }
  };
  return h('div', { class: 'page narrow' },
    pageHead('Tautan Pemilik/MC', 'Buat tautan khusus pemilik acara dan MC. Server memeriksa kuncinya; suara mereka terdengar di seluruh dunia.'),
    card('',
      h('label', { class: 'form-label', for: 'link-event' }, 'Acara'),
      h('select', { id: 'link-event', class: 'input', onchange: (e) => ctx.setUi({ linkEvent: e.target.value, linkPage: '' }) }, targets.map((t) => h('option', { value: t.value, selected: t.value === selected.value }, t.label))),
      h('label', { class: 'form-label', for: 'link-page' }, 'Halaman tujuan'),
      h('select', { id: 'link-page', class: 'input', onchange: (e) => ctx.setUi({ linkPage: e.target.value }) }, Object.keys(PAGES).map((k) => h('option', { value: k, selected: k === page }, k === 'villa' ? 'Vila (/villa.html)' : 'Aula (/)'))),
      h('div', { class: 'btn-group top' }, h('button', { type: 'button', class: 'btn btn-gold', onclick: make }, icon('link', 16), 'Buat tautan')),
      h('p', { class: 'note' }, icon('info', 16), 'Kirim tautan secara pribadi ke orangnya (mis. WhatsApp pribadi), jangan ke grup atau undangan umum. Bila bocor, putar rahasia di menu Admin & Peran.')),
    results);
}

// ---------- admin & peran ----------
export function viewAdmin(ctx) {
  const holders = ctx.stats.live.participants.filter((p) => p.role !== 'guest');
  const gen = h('div', { class: 'gen-out' });
  const generate = () => {
    try {
      const secret = generateSecret();
      const copy = h('button', { type: 'button', class: 'btn btn-gold btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(secret); ctx.toast('Rahasia baru disalin.'); } catch { ctx.toast('Tekan lama nilai untuk menyalin.'); } } }, icon('copy', 14), 'Salin');
      gen.replaceChildren(h('code', { class: 'link-url' }, secret), copy, h('ol', { class: 'steps' }, h('li', null, 'Di Vercel, ubah nilai EVENT_ROLE_SECRET menjadi rahasia ini, lalu Redeploy.'), h('li', null, 'Masuk ulang ke dasbor dengan rahasia baru.'), h('li', null, 'Buat ulang tautan pemilik/MC. Semua tautan lama berhenti berlaku.')));
    } catch (error) {
      ctx.toast(String(error?.message ?? error));
    }
  };
  return h('div', { class: 'page' },
    pageHead('Admin & Peran', 'Keamanan akses admin dan kunci peran pemilik acara/MC.'),
    h('div', { class: 'cols' },
      h('div', { class: 'col' },
        card('', cardHead('Kunci peran', badge(ctx.stats.env.roleSecret ? 'ok' : 'warn', ctx.stats.env.roleSecret ? 'Aktif' : 'Terbuka')),
          h('ul', { class: 'bullets' },
            h('li', null, 'Satu rahasia induk (EVENT_ROLE_SECRET) menurunkan kunci terpisah untuk tiap acara dan tiap peran.'),
            h('li', null, 'Server memeriksa kunci dan menaruh peran di token LiveKit (bertanda tangan, tidak bisa dipalsukan).'),
            h('li', null, 'Pemilik acara dan MC selalu terdengar di seluruh dunia; tamu hanya terdengar jika berdekatan.'),
            !ctx.stats.env.roleSecret && h('li', { class: 'warn' }, 'Rahasia belum terbaca: siapa pun bisa menjadi MC. Pasang EVENT_ROLE_SECRET lalu Redeploy.'))),
        card('', cardHead('Pemegang peran online', badge('off', `${holders.length}`)),
          holders.length ? holders.map((p) => h('div', { class: 'status-row' }, avatar(p.name), h('div', { class: 'grow' }, h('strong', null, p.name), h('small', { class: 'muted' }, p.slug ?? p.room)), roleBadge(p.role))) : empty('mic', 'Tidak ada pemilik/MC yang online', 'Muncul di sini saat tautan pemilik atau MC dibuka.'))),
      h('div', { class: 'col side' },
        card('', cardHead('Putar rahasia', icon('key', 18)), h('p', { class: 'muted' }, 'Ganti rahasia induk bila tautan bocor atau secara berkala.'), h('button', { type: 'button', class: 'btn btn-gold', onclick: generate }, 'Buat rahasia acak'), gen),
        card('', cardHead('Akses admin', icon('shield', 18)), h('ul', { class: 'bullets' }, h('li', null, 'Dasbor memakai token HMAC berumur 5 menit; rahasia induk tidak pernah dikirim ke server.'), h('li', null, 'Rahasia disimpan di tab ini saja dan hilang saat tab ditutup.')), h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.logout() }, icon('logout', 16), 'Keluar')))));
}

// ---------- pengaturan ----------
export function viewSettings(ctx) {
  const s = ctx.stats;
  const yes = (v, labelYes = 'Terbaca', labelNo = 'Belum') => badge(v ? 'ok' : 'warn', v ? labelYes : labelNo);
  const rows = [
    ['LIVEKIT_URL / API_KEY / API_SECRET', yes(s.env.livekit), 'Suara dan multiplayer'],
    ['SUPABASE_URL / SUPABASE_ANON_KEY', yes(s.env.supabase), 'Daftar acara dan undangan'],
    ['EVENT_ROLE_SECRET', yes(s.env.roleSecret), 'Kunci peran dan akses dasbor'],
    ['SUPABASE_SERVICE_ROLE_KEY', badge(s.env.serviceKey ? 'ok' : 'off', s.env.serviceKey ? 'Terbaca' : 'Opsional'), 'Menampilkan draf dan undangan nonaktif'],
  ];
  const intervals = [10, 15, 30, 60];
  return h('div', { class: 'page narrow' },
    pageHead('Pengaturan', 'Diagnostik konfigurasi server dan preferensi dasbor.'),
    card('', cardHead('Konfigurasi server', h('small', { class: 'muted' }, 'nilai rahasia tidak pernah ditampilkan')), rows.map(([name, node, desc]) => h('div', { class: 'status-row' }, h('div', { class: 'grow' }, h('strong', { class: 'mono' }, name), h('small', { class: 'muted' }, desc)), node))),
    card('', cardHead('Informasi'),
      [['Versi', s.version ?? '—'], ['Wilayah server', s.region ?? '—'], ['Cakupan acara', s.events.scope === 'aktif' ? 'Undangan aktif' : 'Semua'], ['Terakhir diperbarui', formatClock(s.generatedAt)], ['Tanggal data', formatDate(new Date(s.generatedAt).toISOString())]].map(([k, v]) => h('div', { class: 'status-row' }, h('span', { class: 'grow muted' }, k), h('strong', null, String(v))))),
    card('', cardHead('Preferensi'),
      h('label', { class: 'form-label', for: 'interval' }, 'Segarkan otomatis'),
      h('select', { id: 'interval', class: 'input', onchange: (e) => ctx.setIntervalSec(Number(e.target.value)) }, intervals.map((n) => h('option', { value: n, selected: n === ctx.intervalSec }, `Setiap ${n} detik`))),
      h('div', { class: 'btn-group top' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.refresh() }, icon('refresh', 16), 'Segarkan sekarang'), h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.toggleDemo() }, ctx.demo ? 'Keluar dari mode contoh' : 'Lihat data contoh'), h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.logout() }, icon('logout', 16), 'Keluar'))),
    h('p', { class: 'muted small' }, `Studio: ${STUDIO_URL} · Undangan: ${INVITATION_URL}`));
}

export function viewSoon(ctx, id) {
  const s = SOON[id];
  return h('div', { class: 'page narrow' }, pageHead(s.title, s.text), card('', empty('clock', 'Segera hadir', s.need), h('div', { class: 'btn-group center' }, navBtn(ctx, 'Kembali ke Ringkasan', 'ringkasan', ''))));
}

export const VIEWS = Object.freeze({ ringkasan: viewOverview, acara: viewEvents, dunia: viewWorlds, pengguna: viewUsers, admin: viewAdmin, tautan: viewLinks, pengaturan: viewSettings });
