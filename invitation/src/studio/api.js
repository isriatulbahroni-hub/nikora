import { cleanText, defaultScenes, SCENE_KINDS } from '../engine/config.js';
import { EVENT_TYPES, getTheme } from '../themes/index.js';
import { WORLDS, DEFAULT_WORLD_URL } from '../engine/world-link.js';

export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
// Sama dengan check constraint invitations_slug_check di database.
export const RESERVED = ['admin', 'api', 'kirim', 'masuk', 'dashboard', 'editor', 'panel', '_next', 'favicon'];

/** "Rani & Dimas" -> "rani-dimas". Hasil selalu lolos SLUG atau string kosong. */
export function slugify(text) {
  const s = String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return SLUG.test(s) && !RESERVED.includes(s) ? s : '';
}

export function validateInvitation(input) {
  const errors = {};
  const eventType = EVENT_TYPES.includes(input.eventType) ? input.eventType : null;
  if (!eventType) errors.eventType = 'Pilih jenis acara.';
  const groom = cleanText(input.groom, 60);
  const bride = cleanText(input.bride, 60);
  if (!groom) errors.groom = eventType === 'pernikahan' ? 'Nama mempelai pria wajib diisi.' : 'Nama wajib diisi.';
  if (eventType === 'pernikahan' && !bride) errors.bride = 'Nama mempelai wanita wajib diisi.';
  const date = new Date(input.eventDate);
  if (!input.eventDate || Number.isNaN(date.getTime())) errors.eventDate = 'Tanggal dan jam acara wajib diisi.';
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!SLUG.test(slug)) errors.slug = 'Alamat 3-40 karakter: huruf kecil, angka, tanda minus.';
  else if (RESERVED.includes(slug)) errors.slug = 'Alamat ini dicadangkan sistem.';
  const theme = getTheme(input.theme);
  if (!theme || theme.eventType !== eventType) errors.theme = 'Pilih tema yang sesuai jenis acara.';
  const world = input.world && WORLDS.includes(input.world) ? input.world : null;
  return { ok: Object.keys(errors).length === 0, errors, value: { slug, eventType, groom, bride: bride || '', date, theme: input.theme, world, tz: cleanText(input.tz, 40) || 'Asia/Jakarta', venue: cleanText(input.venue, 120), address: cleanText(input.address, 240), mapsUrl: safeUrl(input.mapsUrl), message: cleanText(input.message, 500) } };
}

/** Hanya tautan http(s); selain itu dibuang (mencegah javascript: dan data:). */
export function safeUrl(v) {
  try {
    const u = new URL(String(v || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

export function invitationRow(value, ownerId) {
  const extra = { tz: value.tz };
  if (value.world) extra.world = value.world;
  return {
    slug: value.slug, owner_id: ownerId, event_type: value.eventType, groom: value.groom, bride: value.bride,
    event_date: value.date.toISOString(), theme: value.theme, venue: value.venue, address: value.address,
    maps_url: value.mapsUrl, message: value.message, extra, status: 'active', status_by: 'owner',
  };
}

/** Link siap bagikan. Nama tamu masuk lewat ?to= dan ikut ke dunia 3D. */
export function shareLinks({ slug, inviteBase, worldBase = DEFAULT_WORLD_URL }) {
  const base = String(inviteBase || '').replace(/\/+$/, '');
  const invite = new URL(`${base}/`);
  invite.searchParams.set('slug', slug);
  return {
    invite: invite.toString(),
    forGuest(name) {
      const u = new URL(invite);
      const to = cleanText(name, 60);
      if (to) u.searchParams.set('to', to);
      return u.toString();
    },
    world: (() => { const u = new URL(`${String(worldBase).replace(/\/+$/, '')}/villa.html`); u.searchParams.set('e', slug); return u.toString(); })(),
  };
}

/** Selisih zona waktu (ms) pada saat `ms` untuk zona IANA `tz`. */
function tzOffsetMs(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ms / 1000) * 1000;
}

/** "2026-12-12T08:00" di zona `tz` -> ISO UTC. null bila format salah. */
export function zonedIso(local, tz = 'Asia/Jakarta') {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ''));
  if (!m) return null;
  const [Y, Mo, D, H, Mi] = m.slice(1).map(Number);
  const guess = Date.UTC(Y, Mo - 1, D, H, Mi);
  try {
    const t = guess - tzOffsetMs(guess - tzOffsetMs(guess, tz), tz);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

/** ISO -> "YYYY-MM-DDTHH:mm" di zona `tz` (untuk kolom datetime-local). */
export function isoToLocal(iso, tz = 'Asia/Jakarta') {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
  } catch { return ''; }
}

export const MAX_CONFIG_BYTES = 24000;

/** Teks WhatsApp per tamu. */
const intId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error('ID tidak valid.');
  return n;
};

export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Klien GoTrue + PostgREST tipis. Sesi disimpan lewat `store` (di browser: localStorage). */
export function createClient({ url, key, fetchImpl = globalThis.fetch, store }) {
  if (!url || !key) throw new Error('Konfigurasi Supabase belum diisi.');
  const base = url.replace(/\/+$/, '');
  const read = () => { try { return JSON.parse(store.get() || 'null'); } catch { return null; } };
  const jsonHeaders = (token) => ({ apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json' });

  async function auth(path, body) {
    const res = await fetchImpl(`${base}/auth/v1/${path}`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(authMessage(data, res.status));
    return data;
  }
  const keep = (d) => {
    if (!d.access_token) return null;
    const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user ? { id: d.user.id, email: d.user.email } : null };
    store.set(JSON.stringify(s));
    return s;
  };

  async function token() {
    const s = read();
    if (!s) throw new Error('Silakan masuk dulu.');
    if (s.expires_at - 60 > Math.floor(Date.now() / 1000)) return s.access_token;
    const d = await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token }).catch(() => null);
    const n = d && keep({ ...d, user: d.user || s.user });
    if (!n) { store.set(null); throw new Error('Sesi berakhir, silakan masuk lagi.'); }
    return n.access_token;
  }

  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const headers = jsonHeaders(await token());
    if (prefer) headers.Prefer = prefer;
    const res = await fetchImpl(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(restMessage(e, res.status));
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  return {
    session: read,
    async signIn(email, password) { const s = keep(await auth('token?grant_type=password', { email: cleanText(email, 254), password })); return s; },
    async signUp(email, password) {
      const d = await auth('signup', { email: cleanText(email, 254), password });
      return { session: keep(d), needsConfirm: !d.access_token };
    },
    signOut() { store.set(null); },
    userId() { const s = read(); return s && s.user ? s.user.id : null; },
    rest,
    myInvitations: () => rest('invitations?select=slug,groom,bride,event_type,event_date,theme,status,created_at&order=created_at.desc'),
    async createInvitation(value) {
      const ownerId = this.userId();
      if (!ownerId) throw new Error('Silakan masuk dulu.');
      await rest('invitations', { method: 'POST', body: invitationRow(value, ownerId), prefer: 'return=minimal' });
      const scenes = defaultScenes().map((s) => ({ slug: value.slug, kind: s.kind, position: s.position, active: s.active, config: s.config }));
      await rest('invitation_scenes', { method: 'POST', body: scenes, prefer: 'return=minimal' });
      return value.slug;
    },
    invitationOf: async (slug) => (await rest(`invitations?slug=eq.${encodeURIComponent(slug)}&select=slug,event_type,theme,event_date,extra&limit=1`) || [])[0] || null,
    scenesOf: (slug) => rest(`invitation_scenes?slug=eq.${encodeURIComponent(slug)}&select=kind,position,active,config&order=position.asc`),
    /** Simpan isi satu adegan. Hanya jenis adegan yang dikenal dan config JSON <= 24 KB. */
    async saveScene(slug, kind, { config, active }) {
      if (!SCENE_KINDS.includes(kind)) throw new Error('Jenis adegan tidak dikenal.');
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Isi adegan tidak valid.');
      if (JSON.stringify(config).length > MAX_CONFIG_BYTES) throw new Error('Isi adegan terlalu besar.');
      const body = { config };
      if (typeof active === 'boolean') body.active = active;
      await rest(`invitation_scenes?slug=eq.${encodeURIComponent(slug)}&kind=eq.${kind}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    },
    /** Unggah foto (JPEG hasil kecilkan) ke bucket publik `media` di folder milik pengguna; mengembalikan URL https. */
    async uploadImage(slug, blob) {
      const uid = this.userId();
      if (!uid) throw new Error('Silakan masuk dulu.');
      if (!blob || blob.type !== 'image/jpeg') throw new Error('Foto harus berformat JPEG.');
      if (blob.size > 3 * 1024 * 1024) throw new Error('Foto terlalu besar (maks 3 MB).');
      const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `${uid}/galeri/${slug}/${id}.jpg`;
      const res = await fetchImpl(`${base}/storage/v1/object/media/${path}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${await token()}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob });
      if (!res.ok) throw new Error(res.status === 413 ? 'Foto terlalu besar.' : `Unggah gagal (${res.status}).`);
      return `${base}/storage/v1/object/public/media/${path}`;
    },
    rsvpsOf: (slug) => rest(`rsvps?slug=eq.${encodeURIComponent(slug)}&select=id,name,attending,guests,meal,wish,created_at&order=created_at.desc`),
    giftsOf: (slug) => rest(`invitation_gifts?slug=eq.${encodeURIComponent(slug)}&select=id,kind,label,account_name,account_no,position,active&order=position.asc`),
    addGift: (slug, g) => rest('invitation_gifts', { method: 'POST', body: { slug, kind: g.kind, label: cleanText(g.label, 60), account_name: cleanText(g.accountName, 80), account_no: cleanText(g.accountNo, 40), position: g.position || 0, active: true }, prefer: 'return=minimal' }),
    deleteGift: async (slug, id) => rest(`invitation_gifts?id=eq.${intId(id)}&slug=eq.${encodeURIComponent(slug)}`, { method: 'DELETE' }),
    guestsOf: (slug) => rest(`guests?slug=eq.${encodeURIComponent(slug)}&select=id,name,category&order=created_at.asc`),
    addGuest: (slug, name, category) => rest('guests', { method: 'POST', body: { slug, name: cleanText(name, 80), category: cleanText(category, 20) }, prefer: 'return=minimal' }),
    deleteGuest: async (slug, id) => rest(`guests?id=eq.${intId(id)}&slug=eq.${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  };
}

function authMessage(d, status) {
  const m = String((d && (d.msg || d.error_description || d.message)) || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email atau kata sandi salah.';
  if (m.includes('already registered')) return 'Email ini sudah terdaftar, silakan masuk.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (m.includes('password')) return 'Kata sandi minimal 6 karakter.';
  if (status === 429) return 'Terlalu banyak percobaan. Coba lagi sebentar.';
  return `Gagal (${status}). Coba lagi.`;
}

function restMessage(e, status) {
  if (e && e.code === '23505') return 'Alamat undangan ini sudah dipakai. Pilih alamat lain.';
  if (status === 401 || status === 403) return 'Tidak punya izin untuk tindakan ini. Masuk ulang bila perlu.';
  return `Permintaan gagal (${status}).`;
}
