import { cleanText } from './config.js';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const GIFT_KINDS = ['bank', 'ewallet', 'qris'];

function endpoint({ url, key }) {
  if (!url || !key) throw new Error('Konfigurasi Supabase belum diisi (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY).');
  return { base: url.replace(/\/+$/, ''), headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const needSlug = (slug) => {
  if (!SLUG.test(slug || '')) throw new Error('Alamat undangan tidak valid.');
};

/** Rapikan isian RSVP sesuai batas di database (nama 80, tamu 1-10, ucapan 300, menu 60). */
export function cleanRsvp(input) {
  const name = cleanText(input && input.name, 80);
  if (!name) throw new Error('Nama wajib diisi.');
  const attending = !!(input && input.attending);
  const n = Math.round(Number(input && input.guests));
  const guests = attending ? Math.min(10, Math.max(1, Number.isFinite(n) ? n : 1)) : 1;
  return {
    name,
    attending,
    guests,
    wish: cleanText(input && input.wish, 300),
    meal: attending ? cleanText(input && input.meal, 60) : null,
  };
}

export async function submitRsvp(slug, input, cfg) {
  needSlug(slug);
  const row = { slug, ...cleanRsvp(input) };
  const { base, headers } = endpoint(cfg);
  const res = await (cfg.fetchImpl || globalThis.fetch)(`${base}/rest/v1/rsvps`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Konfirmasi gagal dikirim (${res.status}). Coba lagi sebentar.`);
  return row;
}

/** Buku tamu = ucapan publik pada tabel rsvps. Hanya nama dan ucapan yang diambil, bukan jumlah tamu atau menu. */
export async function loadWishes(slug, cfg, { limit = 30 } = {}) {
  needSlug(slug);
  const { base, headers } = endpoint(cfg);
  const lim = Math.min(100, Math.max(1, Math.round(limit) || 30));
  const res = await (cfg.fetchImpl || globalThis.fetch)(
    `${base}/rest/v1/rsvps?slug=eq.${slug}&wish=not.is.null&select=name,wish,created_at&order=created_at.desc&limit=${lim}`, { headers });
  if (!res.ok) throw new Error(`Gagal memuat buku tamu (${res.status}).`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ name: cleanText(r.name, 80), wish: cleanText(r.wish, 300), at: r.created_at }))
    .filter((r) => r.name && r.wish);
}

export async function loadGifts(slug, cfg) {
  needSlug(slug);
  const { base, headers } = endpoint(cfg);
  const res = await (cfg.fetchImpl || globalThis.fetch)(
    `${base}/rest/v1/invitation_gifts?slug=eq.${slug}&active=eq.true&select=kind,label,account_name,account_no,qr_path&order=position.asc`, { headers });
  if (!res.ok) throw new Error(`Gagal memuat hadiah (${res.status}).`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((g) => GIFT_KINDS.includes(g.kind))
    .map((g) => ({
      kind: g.kind,
      label: cleanText(g.label, 60) || 'Hadiah',
      accountName: cleanText(g.account_name, 80),
      accountNo: cleanText(g.account_no, 40),
      qrPath: cleanText(g.qr_path, 200),
    }));
}
