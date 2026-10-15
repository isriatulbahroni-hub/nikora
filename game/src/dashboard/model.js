// Model tampilan dasbor: fungsi murni dari statistik server -> data siap gambar. Tanpa DOM.
import { WORLD_LABELS, countAlerts, eventStatus } from '../admin-shared.js';
import { formatDate, formatDayMonth, formatNumber, formatShortClock } from './format.js';

export const STATUS_LABELS = Object.freeze({ berlangsung: 'Berlangsung', mendatang: 'Mendatang', selesai: 'Selesai', 'tanpa-tanggal': 'Tanpa tanggal' });
export const TYPE_LABELS = Object.freeze({ pernikahan: 'Pernikahan', tazkirah: 'Tazkirah', karaoke: 'Karaoke', komunitas: 'Komunitas', tarannum: 'Tarannum', 'ulang-tahun': 'Ulang tahun' });
export const typeLabel = (t) => TYPE_LABELS[t] ?? (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—');
const includes = (hay, q) => String(hay ?? '').toLowerCase().includes(q);

export function worldUrl(world, slug) {
  const path = world === 'villa' ? '/villa.html' : '/';
  return slug ? `${path}?e=${slug}` : path;
}

/** Baris status sistem (kartu "Status Sistem"). */
export function systemModel(stats, apiMs) {
  const sys = stats.system;
  const level = (c, label, okDetail) => {
    if (!c.configured) return { state: 'off', badge: 'Belum diatur', detail: `${label} belum terhubung` };
    if (!c.ok) return { state: 'down', badge: 'Offline', detail: c.error || 'Tidak merespons' };
    if (c.ms > 1500) return { state: 'warn', badge: 'Lambat', detail: `Respons waktu: ${c.ms}ms` };
    return { state: 'ok', badge: 'Online', detail: okDetail(c) };
  };
  return [
    { id: 'api', icon: 'cloud', label: 'API', state: 'ok', badge: 'Online', detail: Number.isFinite(apiMs) ? `Respons waktu: ${apiMs}ms` : 'Berjalan' },
    { id: 'database', icon: 'database', label: 'Database', ...level(sys.database, 'Supabase', (c) => `Respons waktu: ${c.ms}ms`) },
    { id: 'realtime', icon: 'signal', label: 'Realtime', ...level(sys.realtime, 'LiveKit', (c) => `Suara & multiplayer · ${c.ms}ms`) },
  ];
}

export function securityModel(stats) {
  return [
    stats.env.roleSecret
      ? { id: 'roles', label: 'Peran Pemilik/MC', state: 'ok', badge: 'Aktif', detail: 'Dikunci server (HMAC per acara)' }
      : { id: 'roles', label: 'Peran Pemilik/MC', state: 'warn', badge: 'Terbuka', detail: 'EVENT_ROLE_SECRET belum dipasang' },
    { id: 'admin', label: 'Akses Admin', state: 'ok', badge: 'Aman', detail: 'Token HMAC berumur 5 menit' },
  ];
}

export function overviewModel(stats) {
  const { events, live, system, alerts } = stats;
  const active = live.rooms.filter((r) => r.participants > 0).length;
  const nAlerts = countAlerts(alerts);
  return [
    { id: 'acara', icon: 'calendar', label: 'Total Acara', value: events.configured && !events.unavailable ? formatNumber(events.total) : '—', sub: !events.configured ? 'Database belum terhubung' : events.unavailable ? 'Database tidak merespons' : events.scope === 'aktif' ? 'undangan aktif' : 'semua undangan', tone: events.configured && !events.unavailable ? 'ok' : 'warn' },
    { id: 'online', icon: 'users', label: 'Pengguna Online', value: live.unavailable ? '—' : formatNumber(live.totalParticipants), sub: live.unavailable ? (system.realtime.configured ? 'Realtime tidak merespons' : 'Realtime belum aktif') : `di ${formatNumber(active)} ruang sekarang`, tone: live.unavailable ? 'warn' : 'ok' },
    { id: 'dunia', icon: 'globe', label: 'Ruang Aktif', value: live.unavailable ? '—' : formatNumber(active), sub: live.unavailable ? 'Tidak ada data' : 'Aula dan Vila siap dipakai', tone: live.unavailable ? 'warn' : 'ok' },
    { id: 'peringatan', icon: 'alert', label: 'Peringatan', value: formatNumber(nAlerts), sub: nAlerts ? 'perlu ditindaklanjuti' : 'Semua berjalan normal', tone: nAlerts ? 'warn' : 'ok' },
  ];
}

const sortKey = (e) => Date.parse(e.createdAt ?? e.date ?? '') || 0;

export function eventsModel(stats, { now = Date.now(), query = '', filter = 'semua' } = {}) {
  const q = query.trim().toLowerCase();
  const all = stats.events.items.map((e) => ({ ...e, status: eventStatus(e.date, now, e.tz || undefined), typeLabel: typeLabel(e.type), worldLabel: WORLD_LABELS[e.world] ?? '—', dateLabel: formatDate(e.date, e.tz || undefined) }));
  const counts = { semua: all.length, mendatang: 0, berlangsung: 0, selesai: 0, 'tanpa-tanggal': 0 };
  for (const e of all) counts[e.status] += 1;
  const rows = all.filter((e) => (filter === 'semua' || e.status === filter) && (!q || includes(e.title, q) || includes(e.slug, q) || includes(e.type, q)));
  return { rows, counts, total: stats.events.total, shown: rows.length };
}

export const latestEvents = (stats, now, n = 5) => eventsModel(stats, { now }).rows.slice().sort((a, b) => sortKey(b) - sortKey(a)).slice(0, n);

/** Kartu dunia: dua ruang umum selalu ada, ditambah ruang acara yang sedang hidup. */
export function worldsModel(stats) {
  const byName = new Map(stats.live.rooms.map((r) => [r.name, r]));
  const base = [
    { key: 'orbit-hall', world: 'hall', kind: 'umum', slug: null, label: `${WORLD_LABELS.hall} · ruang umum` },
    { key: 'nikora-villa', world: 'villa', kind: 'umum', slug: null, label: `${WORLD_LABELS.villa} · ruang umum` },
  ].map((b) => ({ ...b, participants: byName.get(b.key)?.participants ?? 0, createdAt: byName.get(b.key)?.createdAt ?? null }));
  const extra = stats.live.rooms.filter((r) => r.kind !== 'umum').map((r) => ({ key: r.name, world: r.world, kind: r.kind, slug: r.slug, label: r.label, participants: r.participants, createdAt: r.createdAt }));
  return [...base, ...extra].map((r) => ({ ...r, active: r.participants > 0, url: r.world ? worldUrl(r.world, r.slug) : null }));
}

export function usersModel(stats, { query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const all = stats.live.participants;
  const rows = all.filter((p) => !q || includes(p.name, q) || includes(p.slug, q) || includes(p.room, q));
  const count = (role) => all.filter((p) => p.role === role).length;
  return { rows, summary: { total: all.length, owner: count('owner'), mc: count('mc'), guest: count('guest') } };
}

export function searchModel(stats, query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const e of stats.events.items) if (includes(e.title, q) || includes(e.slug, q)) out.push({ type: 'acara', label: e.title, sub: e.slug, route: 'acara', query: e.slug });
  for (const p of stats.live.participants) if (includes(p.name, q)) out.push({ type: 'pengguna', label: p.name, sub: p.room, route: 'pengguna', query: p.name });
  for (const w of worldsModel(stats)) if (includes(w.label, q)) out.push({ type: 'dunia', label: w.label, sub: `${w.participants} online`, route: 'dunia', query: '' });
  return out.slice(0, 8);
}

/** Pilihan acara untuk pembuat tautan pemilik/MC. */
export const linkTargets = (stats) => [{ value: '', label: 'Ruang umum (uji coba)', world: 'villa' }, ...stats.events.items.map((e) => ({ value: e.slug, label: `${e.title} (${e.slug})`, world: e.world }))];

export function pushSample(samples, sample, max = 120) {
  const next = samples.slice();
  const last = next[next.length - 1];
  if (last && sample.t - last.t < 5000) next[next.length - 1] = sample;
  else next.push(sample);
  return next.slice(-max);
}

const DAY = 86_400_000;
const dayKeyWib = (ms) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** mode: 'live' | '7' | '30' | '90'. */
export function chartModel({ mode, samples = [], stats, now = Date.now() }) {
  if (mode === 'live') {
    if (samples.length < 2) return { labels: [], bars: [], line: null, legend: [], empty: 'Mengumpulkan data… grafik live terisi tiap beberapa detik selama dasbor terbuka.' };
    return {
      labels: samples.map((s) => formatShortClock(s.t)), bars: samples.map((s) => s.rooms), line: samples.map((s) => s.users), empty: null,
      legend: [{ kind: 'line', label: 'Pengguna online' }, { kind: 'bar', label: 'Ruang aktif' }],
    };
  }
  const days = Number(mode);
  const ev = stats.events;
  if (!ev.configured || ev.unavailable) return { labels: [], bars: [], line: null, legend: [], empty: 'Database belum terhubung atau tidak merespons.' };
  if (!ev.perDay) return { labels: [], bars: [], line: null, legend: [], empty: 'Riwayat pembuatan acara belum tersedia (kolom created_at tidak terbaca dari database).' };
  const labels = [];
  const bars = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const t = now - i * DAY;
    labels.push(formatDayMonth(t));
    bars.push(ev.perDay[dayKeyWib(t)] ?? 0);
  }
  let run = 0;
  const line = bars.map((b) => (run += b));
  return { labels, bars, line, empty: null, legend: [{ kind: 'line', label: 'Akumulasi' }, { kind: 'bar', label: 'Acara dibuat' }] };
}
