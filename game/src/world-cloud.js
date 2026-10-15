// Klien awan Creator Studio (Fase 9.2/9.3). Tipis dan tanpa DOM: semua perubahan status lewat fungsi dunia_* di database
// (supabase/migrations/20261013000000_creator_studio_worlds.sql), bukan menulis kolom langsung. Klien ini HANYA memakai anon key
// + sesi pengguna; penegakan izin ada di database (RLS + fungsi). Memeriksa izin di klien hanya untuk menampilkan tombol.
import { statusOf } from './world-lifecycle.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id) => {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('ID proyek tidak valid.');
  return id.toLowerCase();
};
const intVersion = (v) => {
  if (!Number.isInteger(v) || v < 1 || v > 100) throw new Error('Nomor versi tidak valid.');
  return v;
};

/** Baris world_projects -> objek proyek dengan status yang sudah diterjemahkan (aturan sama dengan world-lifecycle). */
export function projectFromRow(row) {
  const state = { liveVersion: row.live_version ?? null, pendingVersion: row.pending_version ?? null, rejected: row.rejected ?? null, takedown: row.takedown ?? null };
  return {
    id: row.id, name: row.name, template: row.template, ownerId: row.owner_id, latest: row.latest_version ?? 0,
    live: state.liveVersion, pending: state.pendingVersion, rejected: state.rejected, takedown: state.takedown,
    updatedAt: row.updated_at ?? null, ...statusOf(state),
  };
}

const PROJECT_COLS = 'id,name,template,owner_id,latest_version,live_version,pending_version,rejected,takedown,updated_at';

export function createCloud({ url, key, store, fetchImpl = globalThis.fetch, nowSec = () => Math.floor(Date.now() / 1000) }) {
  if (!url || !key) throw new Error('Konfigurasi Supabase belum diisi (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY).');
  const base = url.replace(/\/+$/, '');
  const read = () => { try { return JSON.parse(store.get() || 'null'); } catch { return null; } };
  const head = (token) => ({ apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json' });

  async function auth(path, body) {
    const res = await fetchImpl(`${base}/auth/v1/${path}`, { method: 'POST', headers: head(), body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(authMessage(data, res.status));
    return data;
  }
  const keep = (d) => {
    if (!d.access_token) return null;
    const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || nowSec() + (d.expires_in || 3600), user: d.user ? { id: d.user.id, email: d.user.email } : null };
    store.set(JSON.stringify(s));
    return s;
  };
  async function token() {
    const s = read();
    if (!s) throw new Error('Silakan masuk dulu.');
    if (s.expires_at - 60 > nowSec()) return s.access_token;
    const d = await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token }).catch(() => null);
    const n = d && keep({ ...d, user: d.user || s.user });
    if (!n) { store.set(null); throw new Error('Sesi berakhir, silakan masuk lagi.'); }
    return n.access_token;
  }
  async function call(path, { method = 'GET', body, prefer } = {}) {
    const headers = head(await token());
    if (prefer) headers.Prefer = prefer;
    const res = await fetchImpl(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(dbMessage(await res.json().catch(() => ({})), res.status));
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  }
  const rpc = (name, args) => call(`rpc/${name}`, { method: 'POST', body: args });

  return {
    session: read,
    /** Token akses yang masih berlaku (disegarkan bila perlu); dipakai untuk memanggil API server milik sendiri. */
    accessToken: token,
    userId() { const s = read(); return s?.user?.id ?? null; },
    email() { const s = read(); return s?.user?.email ?? null; },
    signIn: async (email, password) => keep(await auth('token?grant_type=password', { email: String(email || '').trim().slice(0, 254), password })),
    async signUp(email, password) {
      const d = await auth('signup', { email: String(email || '').trim().slice(0, 254), password });
      return { session: keep(d), needsConfirm: !d.access_token };
    },
    signOut() { store.set(null); },

    async listProjects() {
      return (await call(`world_projects?select=${PROJECT_COLS}&order=updated_at.desc`)).map(projectFromRow);
    },
    async createProject(name, template = 'kosong') {
      const owner = this.userId();
      if (!owner) throw new Error('Silakan masuk dulu.');
      const rows = await call('world_projects?select=' + PROJECT_COLS, { method: 'POST', body: { owner_id: owner, name: String(name || '').trim().slice(0, 60), template }, prefer: 'return=representation' });
      return projectFromRow(rows[0]);
    },
    async saveVersion(projectId, project, note = null) {
      const v = await rpc('dunia_simpan_versi', { p_project: uuid(projectId), p_data: project, p_note: note ? String(note).slice(0, 200) : null });
      return intVersion(Number(v));
    },
    listVersions: async (projectId) => call(`world_project_versions?project_id=eq.${uuid(projectId)}&select=version,note,created_at&order=version.desc`),
    async loadVersion(projectId, version) {
      const rows = await call(`world_project_versions?project_id=eq.${uuid(projectId)}&version=eq.${intVersion(version)}&select=data`);
      if (!rows?.length) throw new Error('Versi tidak ditemukan atau Anda tidak berhak melihatnya.');
      return rows[0].data; // WAJIB divalidasi ulang oleh pemanggil (validateProject) sebelum dipakai
    },
    submit: async (projectId, version) => rpc('dunia_ajukan', { p_project: uuid(projectId), p_version: intVersion(version) }),
    withdraw: async (projectId) => rpc('dunia_batal_ajukan', { p_project: uuid(projectId) }),
    unpublish: async (projectId, reason = null) => rpc('dunia_tarik', { p_project: uuid(projectId), p_alasan: reason }),
    audit: async (projectId) => call(`world_audit?project_id=eq.${uuid(projectId)}&select=action,detail,created_at&order=id.desc&limit=50`),

    // Moderator
    async canModerate() { try { return (await rpc('bisa_moderasi_dunia', {})) === true; } catch { return false; } },
    async pendingReviews() {
      return (await call(`world_projects?pending_version=not.is.null&select=${PROJECT_COLS}&order=updated_at.asc`)).map(projectFromRow);
    },
    async liveWorlds() {
      return (await call(`world_projects?live_version=not.is.null&select=${PROJECT_COLS}&order=updated_at.desc`)).map(projectFromRow);
    },
    decide: async (projectId, version, approve, reason = null) => rpc('dunia_putuskan', { p_project: uuid(projectId), p_version: intVersion(version), p_setuju: approve === true, p_alasan: reason }),
    takedown: async (projectId, reason) => rpc('dunia_tarik', { p_project: uuid(projectId), p_alasan: reason }),
  };
}

function authMessage(d, status) {
  const m = String((d && (d.msg || d.error_description || d.message)) || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email atau kata sandi salah.';
  if (m.includes('already registered')) return 'Email ini sudah terdaftar, silakan masuk.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (m.includes('password')) return 'Kata sandi minimal 6 karakter.';
  if (status === 429) return 'Terlalu banyak percobaan. Coba lagi sebentar.';
  return `Gagal masuk (${status}).`;
}

/** Pesan fungsi dunia_* sudah berbahasa Indonesia (P0001/54000), jadi diteruskan; kode lain diterjemahkan. */
function dbMessage(e, status) {
  const code = e?.code;
  if ((code === 'P0001' || code === '54000') && typeof e.message === 'string') return e.message;
  if (code === '42501' || status === 401 || status === 403) return 'Tidak punya izin untuk tindakan ini. Masuk ulang bila perlu.';
  if (code === '23514') return 'Data dunia tidak memenuhi bentuk yang diizinkan (format orbit.world, maksimal 400 objek, 256 KB).';
  if (code === '23505') return 'Data sudah ada.';
  return `Permintaan gagal (${status}).`;
}
