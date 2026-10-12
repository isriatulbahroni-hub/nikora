import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';

export const VOICE_ROOM = 'orbit-hall';
export const ROOMS = Object.freeze({ hall: VOICE_ROOM, villa: 'nikora-villa' });

/** Hanya nama dunia yang dikenal yang diterima; selain itu jatuh ke aula. */
const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const isEventSlug = (v) => typeof v === 'string' && EVENT_SLUG.test(v);

/** Ruang per acara: tiap undangan punya dunianya sendiri ("evt-<slug>-<dunia>"); tanpa acara memakai ruang umum. */
export const roomFor = (world, event) => {
  const base = ROOMS[world] ? world : 'hall';
  return isEventSlug(event) ? `evt-${event}-${base}` : ROOMS[base];
};

/** Pastikan acara ada dan aktif (RLS hanya mengembalikan undangan aktif). Tanpa konfigurasi Supabase atau saat jaringan gagal: diizinkan. */
export async function eventExists(slug, { env = process.env, fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/invitations?slug=eq.${slug}&select=slug&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return true;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length > 0 : true;
  } catch {
    return true;
  }
}

export function cleanName(raw) {
  if (typeof raw !== 'string') return 'Tamu';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || 'Tamu';
}

/** Terbitkan identitas + token LiveKit untuk satu tamu. { enabled:false } bila LiveKit belum dikonfigurasi. */
export async function issueToken({ env = process.env, name, world, event, fetchImpl } = {}) {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = env;
  if (!url || !key || !secret) return { enabled: false };
  if (event !== undefined && event !== null && event !== '') {
    if (!isEventSlug(event) || !(await eventExists(event, { env, ...(fetchImpl ? { fetchImpl } : {}) }))) return { enabled: false, reason: 'event' };
  }
  const id = randomUUID().slice(0, 8);
  const at = new AccessToken(key, secret, { identity: id, name: cleanName(name), ttl: '2h' });
  at.addGrant({ roomJoin: true, room: roomFor(world, event), canPublish: true, canPublishData: true, canSubscribe: true });
  return { enabled: true, url, token: await at.toJwt(), id };
}
