// Statistik untuk dasbor admin (hanya dipanggil dari api/admin/stats.js setelah autentikasi).
// Tiap bagian dikumpulkan terpisah dengan batas waktu: satu layanan yang mati tidak merusak bagian lain.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RoomServiceClient } from 'livekit-server-sdk';
import { LIVEKIT_VARS, readEnv, roleSecret } from './token-issuer.js';
import { buildAlerts, parseRole, parseRoomName, worldFor } from './admin-shared.js';

export const ADMIN_WINDOW_SEC = 300;
const sig = (secret, ts) => createHmac('sha256', secret).update(`admin:${ts}`).digest('base64url').slice(0, 32);

/** Header "Admin <detik>.<tanda tangan>". Berlaku ±5 menit; hanya turunan HMAC yang dikirim, bukan rahasia induk. */
export const makeAdminHeader = (secret, nowMs) => {
  const ts = Math.floor(nowMs / 1000);
  return `Admin ${ts}.${sig(secret, ts)}`;
};

export function verifyAdminHeader(secret, header, nowMs) {
  if (!secret) return { ok: false, reason: 'not_configured' };
  const m = /^Admin (\d{9,12})\.([A-Za-z0-9_-]{32})$/.exec(typeof header === 'string' ? header : '');
  if (!m) return { ok: false, reason: 'unauthorized' };
  const ts = Number(m[1]);
  if (Math.abs(Math.floor(nowMs / 1000) - ts) > ADMIN_WINDOW_SEC) return { ok: false, reason: 'expired' };
  const a = Buffer.from(m[2]);
  const b = Buffer.from(sig(secret, ts));
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'unauthorized' };
}

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

// Pesan galat untuk dasbor: ringkas, tanpa URL/kunci.
const safeError = (e) => (e?.message === 'timeout' ? 'Tidak merespons (timeout)' : 'Gagal dihubungi');

async function timed(fn, ms) {
  const t0 = Date.now();
  try {
    const value = await withTimeout(fn(), ms);
    return { ok: true, ms: Date.now() - t0, value };
  } catch (error) {
    return { ok: false, ms: Date.now() - t0, error: safeError(error) };
  }
}

const defaultRoomClient = ({ url, key, secret }) => new RoomServiceClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), key, secret);
const num = (v) => (typeof v === 'bigint' ? Number(v) : Number(v) || 0);
const cut = (v, n) => String(v ?? '').slice(0, n);

async function collectLive(client, timeoutMs) {
  const rooms = await withTimeout(client.listRooms(), timeoutMs);
  const list = rooms.slice(0, 30).map((r) => ({ name: r.name, ...parseRoomName(r.name), participants: num(r.numParticipants), createdAt: num(r.creationTime) * 1000 || null }));
  const people = [];
  await Promise.all(list.filter((r) => r.participants > 0).map(async (r) => {
    try {
      for (const p of await withTimeout(client.listParticipants(r.name), timeoutMs)) {
        people.push({ id: cut(p.identity, 12), name: cut(p.name || 'Tamu', 24), role: parseRole(p.metadata), room: r.name, world: r.world, slug: r.slug, joinedAt: num(p.joinedAt) * 1000 || null });
      }
    } catch {
      /* satu ruang gagal: lewati, ruang lain tetap tampil */
    }
  }));
  people.sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0));
  return { rooms: list, participants: people.slice(0, 300), totalParticipants: list.reduce((s, r) => s + r.participants, 0) };
}

async function collectEvents({ url, key, scope, fetchImpl, timeoutMs }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/invitations`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' };
  const get = async (select) => {
    const res = await withTimeout(fetchImpl(`${base}?select=${select}&order=event_date.desc.nullslast&limit=200`, { headers }), timeoutMs);
    if (!res.ok) throw new Error(`http ${res.status}`);
    const total = Number(/\/(\d+)$/.exec(res.headers?.get?.('content-range') ?? '')?.[1]);
    return { rows: await res.json(), total: Number.isFinite(total) ? total : null };
  };
  let result;
  let hasCreated = true;
  try {
    result = await get('slug,groom,bride,event_type,event_date,theme,extra,created_at');
  } catch {
    hasCreated = false; // kolom created_at mungkin tidak ada/diizinkan: ulangi tanpa itu
    result = await get('slug,groom,bride,event_type,event_date,theme,extra');
  }
  const items = (Array.isArray(result.rows) ? result.rows : []).map((r) => {
    const extra = r.extra && typeof r.extra === 'object' ? r.extra : {};
    const couple = [r.groom, r.bride].filter(Boolean).join(' & ');
    return {
      slug: cut(r.slug, 40), title: cut(extra.title || couple || r.slug, 80), type: cut(r.event_type, 30),
      world: worldFor(r.event_type, extra.world), mode: cut(extra.mode, 12) || null, theme: cut(r.theme, 30) || null,
      date: r.event_date ?? null, tz: cut(extra.tz, 40) || null, createdAt: hasCreated ? r.created_at ?? null : null,
    };
  });
  const perDay = {};
  if (hasCreated) for (const it of items) if (it.createdAt) perDay[String(it.createdAt).slice(0, 10)] = (perDay[String(it.createdAt).slice(0, 10)] ?? 0) + 1;
  return { configured: true, scope, total: result.total ?? items.length, items, perDay: hasCreated ? perDay : null };
}

export async function collectStats({ env = process.env, now = Date.now(), fetchImpl = (...a) => globalThis.fetch(...a), makeRoomClient = defaultRoomClient, timeoutMs = 4000 } = {}) {
  const [lkUrl, lkKey, lkSecret] = LIVEKIT_VARS.map((n) => readEnv(env, n));
  const sbUrl = readEnv(env, 'SUPABASE_URL') || readEnv(env, 'VITE_SUPABASE_URL');
  const anon = readEnv(env, 'SUPABASE_ANON_KEY') || readEnv(env, 'VITE_SUPABASE_ANON_KEY');
  const service = readEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const dbKey = service || anon;
  const lkConfigured = Boolean(lkUrl && lkKey && lkSecret);
  const dbConfigured = Boolean(sbUrl && dbKey);

  const [rt, db] = await Promise.all([
    lkConfigured ? timed(() => collectLive(makeRoomClient({ url: lkUrl, key: lkKey, secret: lkSecret }), timeoutMs), timeoutMs + 500) : null,
    dbConfigured ? timed(() => collectEvents({ url: sbUrl, key: dbKey, scope: service ? 'semua' : 'aktif', fetchImpl, timeoutMs }), timeoutMs + 500) : null,
  ]);

  const stats = {
    generatedAt: now,
    version: cut(env.VERCEL_GIT_COMMIT_SHA, 7) || null,
    region: cut(env.VERCEL_REGION, 12) || null,
    env: { livekit: lkConfigured, supabase: dbConfigured, roleSecret: Boolean(roleSecret(env)), serviceKey: Boolean(service) },
    system: {
      api: { ok: true },
      realtime: lkConfigured ? { configured: true, ok: rt.ok, ms: rt.ms, error: rt.error ?? null } : { configured: false, ok: false },
      database: dbConfigured ? { configured: true, ok: db.ok, ms: db.ms, error: db.error ?? null } : { configured: false, ok: false },
    },
    live: rt?.ok ? rt.value : { rooms: [], participants: [], totalParticipants: 0, unavailable: true },
    events: db?.ok ? db.value : { configured: dbConfigured, scope: service ? 'semua' : 'aktif', total: 0, items: [], perDay: null, unavailable: true },
  };
  stats.alerts = buildAlerts(stats);
  return stats;
}
