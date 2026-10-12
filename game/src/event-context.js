// Penghubung undangan -> dunia. Link dari undangan membawa ?e=<slug>&to=<nama tamu>.
// slug = identitas acara yang sama dengan invitations.slug di Supabase; dipakai sebagai nama ruang LiveKit.
export const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const clean = (v, max) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Baca ?e= dan ?to= dari URL. slug null bila tidak ada atau formatnya tidak valid. */
export function parseEventParams(search = '') {
  const p = new URLSearchParams(search);
  const e = (p.get('e') || '').toLowerCase();
  return { slug: EVENT_SLUG.test(e) ? e : null, to: clean(p.get('to'), 24) || null };
}

export function titleOfInvitation(inv) {
  const extra = inv?.extra && typeof inv.extra === 'object' ? inv.extra : {};
  const custom = clean(extra.title, 80);
  if (custom) return custom;
  const a = clean(inv?.groom, 60);
  const b = clean(inv?.bride, 60);
  return a && b ? `${a} & ${b}` : a || b || '';
}

/**
 * Ambil data publik acara (judul, jenis, tema) dari Supabase REST dengan anon key (dibatasi RLS).
 * Gagal/lambat/tidak dikonfigurasi -> null; dunia tetap bisa dimasuki tanpa judul.
 */
export async function loadEventInfo(slug, { url, key, fetchImpl, timeoutMs = 3500 } = {}) {
  if (!slug || !EVENT_SLUG.test(slug) || !url || !key) return null;
  const doFetch = fetchImpl ?? ((...a) => globalThis.fetch(...a));
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(
      `${url.replace(/\/+$/, '')}/rest/v1/invitations?slug=eq.${slug}&select=slug,groom,bride,event_type,event_date,theme,extra&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctrl?.signal },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const inv = Array.isArray(rows) ? rows[0] : null;
    if (!inv) return null;
    return { slug, title: titleOfInvitation(inv), eventType: inv.event_type ?? null, theme: inv.theme ?? null, date: inv.event_date ?? null, tz: typeof inv.extra?.tz === 'string' ? inv.extra.tz : null };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
