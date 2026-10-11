const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Ambil undangan + adegannya dari Supabase REST memakai anon key.
 * Hak akses dijaga RLS: tamu hanya bisa membaca undangan berstatus aktif.
 */
export async function loadInvitation(slug, { url, key, fetchImpl = globalThis.fetch } = {}) {
  if (!SLUG.test(slug || '')) throw new Error('Alamat undangan tidak valid.');
  if (!url || !key) throw new Error('Konfigurasi Supabase belum diisi (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY).');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = url.replace(/\/+$/, '');
  const [invRes, scRes] = await Promise.all([
    fetchImpl(`${base}/rest/v1/invitations?slug=eq.${slug}&select=slug,groom,bride,event_date,event_type,theme,extra&limit=1`, { headers }),
    fetchImpl(`${base}/rest/v1/invitation_scenes?slug=eq.${slug}&select=kind,position,active,config&order=position.asc`, { headers }),
  ]);
  if (!invRes.ok) throw new Error(`Gagal memuat undangan (${invRes.status}).`);
  const rows = await invRes.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Undangan tidak ditemukan atau belum aktif.');
  const scenes = scRes.ok ? await scRes.json() : [];
  return { invitation: rows[0], scenes: Array.isArray(scenes) ? scenes : [] };
}
