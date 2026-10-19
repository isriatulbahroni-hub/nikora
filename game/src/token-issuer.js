import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';

export const LIVEKIT_VARS = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];

/** Baca variabel lingkungan: buang spasi/baris baru di ujung dan tanda kutip pembungkus (salah tempel yang umum). */
export function readEnv(env, name) {
  const raw = env?.[name];
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

/**
 * Peran acara. Pemilik acara dan MC punya kunci rahasia sendiri PER ACARA, diturunkan dari satu rahasia server
 * (EVENT_ROLE_SECRET) lewat HMAC: tidak ada yang disimpan di basis data, dan kunci acara A tidak berlaku di acara B.
 * Kunci hanya diperiksa di server; hasilnya masuk ke token LiveKit sebagai metadata bertanda tangan (tidak bisa dipalsukan klien).
 */
export const ROLE_SECRET_VAR = 'EVENT_ROLE_SECRET';
export const ROLES = Object.freeze(['owner', 'mc']);
const MIN_SECRET_LENGTH = 16;

export function roleSecret(env) {
  const secret = readEnv(env, ROLE_SECRET_VAR);
  return secret.length >= MIN_SECRET_LENGTH ? secret : ''; // rahasia terlalu pendek dianggap tidak dipasang
}

const mac = (secret, event, role) => createHmac('sha256', secret).update(`${event || '-'}:${role}`).digest('base64url').slice(0, 24);

/** Kunci untuk dibagikan ke pemilik/MC suatu acara: "<peran>-<tanda tangan>". event kosong = ruang umum. */
export function deriveRoleKey(secret, event, role) {
  if (!ROLES.includes(role)) throw new Error('peran tidak dikenal');
  return `${role}-${mac(secret, event, role)}`;
}

/** Peran yang sah untuk kunci ini ('owner' | 'mc'), atau null bila salah. Perbandingan waktu-tetap. */
export function verifyRoleKey(secret, event, key) {
  if (!secret || typeof key !== 'string' || key.length > 64) return null;
  const role = ROLES.find((r) => key.startsWith(`${r}-`));
  if (!role) return null;
  const given = Buffer.from(key);
  const expected = Buffer.from(deriveRoleKey(secret, event, role));
  return given.length === expected.length && timingSafeEqual(given, expected) ? role : null;
}

export const VOICE_ROOM = 'orbit-hall';
export const ROOMS = Object.freeze({ hall: VOICE_ROOM, villa: 'nikora-villa', royal: 'nikora-royal', masjid: 'nikora-masjid' });

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
export async function issueToken({ env = process.env, name, world, event, key: roleKey, fetchImpl } = {}) {
  const [url, key, secret] = LIVEKIT_VARS.map((name) => readEnv(env, name));
  const missing = LIVEKIT_VARS.filter((_, i) => ![url, key, secret][i]);
  // Hanya NAMA variabel yang kurang yang dikirim (tidak pernah nilainya), supaya salah konfigurasi bisa didiagnosis dari HP.
  if (missing.length) return { enabled: false, reason: 'config', missing };
  if (event !== undefined && event !== null && event !== '') {
    if (!isEventSlug(event) || !(await eventExists(event, { env, ...(fetchImpl ? { fetchImpl } : {}) }))) return { enabled: false, reason: 'event' };
  }
  const id = randomUUID().slice(0, 8);
  const rs = roleSecret(env);
  const role = rs ? verifyRoleKey(rs, isEventSlug(event) ? event : '', roleKey) ?? 'guest' : 'guest';
  const at = new AccessToken(key, secret, { identity: id, name: cleanName(name), ttl: '2h', ...(role === 'guest' ? {} : { metadata: JSON.stringify({ role }) }) });
  at.addGrant({ roomJoin: true, room: roomFor(world, event), canPublish: true, canPublishData: true, canSubscribe: true });
  // restricted: bila rahasia peran dipasang, hanya pemilik/MC terverifikasi yang boleh membuka panggung
  return { enabled: true, url, token: await at.toJwt(), id, role, restricted: Boolean(rs) };
}
