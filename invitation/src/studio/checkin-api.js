// Klien tipis untuk pengajuan dan kartu check-in (PostgREST + fungsi RPC). Semua izin ditegakkan database
// (RLS dan fungsi security definer di supabase/migrations/20261019060000_*); tampilan hanya mengikuti.

const intId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error('ID tidak valid.');
  return n;
};
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export const STATUS_LABEL = Object.freeze({ menunggu: 'Menunggu admin', disetujui: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' });

/** "a1b2c3d4e5f6" -> "A1B2-C3D4-E5F6" (mudah dibaca dan diketik). */
export const formatCode = (code) => normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
export const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Galat dari fungsi database (RAISE EXCEPTION, kode P0001) sudah berbahasa Indonesia dan aman ditampilkan; yang lain digeneralisasi. */
function messageOf(e, status) {
  if (e && e.code === 'P0001' && e.message) return e.message;
  if (status === 401 || status === 403) return 'Tidak punya izin untuk tindakan ini. Masuk ulang bila perlu.';
  return `Permintaan gagal (${status}).`;
}

export function createCheckinApi({ client, url, key, fetchImpl = globalThis.fetch }) {
  const base = String(url || '').replace(/\/+$/, '');
  async function call(path, { method = 'GET', body, prefer } = {}) {
    const token = await client.accessToken();
    const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetchImpl(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(messageOf(e, res.status));
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  const slugQ = (slug) => encodeURIComponent(slug);

  return {
    // ----- pemilik acara -----
    requestsOf: (slug) => call(`checkin_requests?slug=eq.${slugQ(slug)}&select=id,guest_name,party_size,note,status,decision_note,decided_at,created_at&order=created_at.desc&limit=100`),
    cardsOf: (slug) => call(`checkin_cards?slug=eq.${slugQ(slug)}&select=id,request_id,code,guest_name,room_label,expires_at,revoked_at&order=created_at.desc&limit=100`),
    async request(slug, { guestName, partySize, note } = {}) {
      const uid = client.userId();
      if (!uid) throw new Error('Silakan masuk dulu.');
      const name = clean(guestName, 80);
      if (!name) throw new Error('Nama tamu wajib diisi.');
      const size = Math.trunc(Number(partySize) || 1);
      if (size < 1 || size > 50) throw new Error('Jumlah orang harus 1 sampai 50.');
      try {
        await call('checkin_requests', { method: 'POST', body: { slug, requested_by: uid, guest_name: name, party_size: size, note: clean(note, 300) || null }, prefer: 'return=minimal' });
      } catch (e) {
        if (/izin/.test(e.message)) throw new Error('Pengajuan ditolak sistem. Pastikan undangan ini milikmu dan belum ada terlalu banyak pengajuan yang menunggu (maks. 30).');
        throw e;
      }
    },
    async cancel(id) {
      const rows = await call(`checkin_requests?id=eq.${intId(id)}&status=eq.menunggu`, { method: 'PATCH', body: { status: 'dibatalkan' }, prefer: 'return=representation' });
      if (!Array.isArray(rows) || !rows.length) throw new Error('Pengajuan tidak bisa dibatalkan (mungkin sudah diproses admin).');
    },
    // ----- admin / staf -----
    queue: () => call('checkin_requests?status=eq.menunggu&select=id,slug,guest_name,party_size,note,created_at,invitations(groom,bride,event_type)&order=created_at.asc&limit=100'),
    activeCards: () => call(`checkin_cards?revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,slug,code,guest_name,room_label,expires_at&order=created_at.desc&limit=100`),
    async approve(id, { roomLabel, expiresAt } = {}) {
      const rows = await call('rpc/setujui_pengajuan_checkin', { method: 'POST', body: { p_request_id: intId(id), p_room_label: clean(roomLabel, 40) || null, p_expires_at: expiresAt || null } });
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || !r.kode) throw new Error('Kartu tidak terbit. Coba lagi.');
      return { id: r.kartu_id, code: r.kode, expiresAt: r.berlaku_sampai };
    },
    reject: (id, note) => call('rpc/tolak_pengajuan_checkin', { method: 'POST', body: { p_request_id: intId(id), p_note: clean(note, 300) || null } }),
    revoke: (id) => call('rpc/cabut_kartu_checkin', { method: 'POST', body: { p_card_id: intId(id) } }),
  };
}
