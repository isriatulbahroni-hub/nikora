// Pembuat tautan pemilik acara / MC yang berjalan sepenuhnya di browser (WebCrypto).
// Rahasia induk hanya dipakai di perangkat ini untuk menghitung HMAC; tidak ada permintaan jaringan.
// Harus selalu sama dengan deriveRoleKey/verifyRoleKey di token-issuer.js (server).
export const ROLE_LABELS = Object.freeze({ owner: 'Pemilik acara', mc: 'MC' });
export const PAGES = Object.freeze({ villa: '/villa.html', hall: '/' });
export const MIN_SECRET = 16;
const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Sama seperti readEnv di server: buang spasi dan kutip yang tak sengaja ikut tersalin. */
export const normalizeSecret = (raw) => (typeof raw === 'string' ? raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim() : '');

const toBase64Url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function deriveRoleKeyWeb(secret, event, role, subtle = globalThis.crypto?.subtle) {
  if (!ROLE_LABELS[role]) throw new Error('peran tidak dikenal');
  if (!subtle) throw new Error('browser tidak mendukung WebCrypto (butuh HTTPS)');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', key, enc.encode(`${event || '-'}:${role}`)));
  return `${role}-${toBase64Url(mac).slice(0, 24)}`;
}

/** Validasi isian formulir. Mengembalikan { ok, error?, secret, event } */
export function checkInputs({ secret, slug }) {
  const clean = normalizeSecret(secret);
  if (clean.length < MIN_SECRET) return { ok: false, error: `Rahasia induk minimal ${MIN_SECRET} karakter (sama dengan EVENT_ROLE_SECRET di Vercel).` };
  const raw = (slug ?? '').trim().toLowerCase();
  const event = raw === '' || raw === '-' ? '' : raw;
  if (event && !EVENT_SLUG.test(event)) return { ok: false, error: 'Slug acara tidak valid: huruf kecil, angka, dan tanda minus, 3 sampai 40 karakter.' };
  return { ok: true, secret: clean, event };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // tanpa huruf mirip (I l 1 O 0)

/** Rahasia induk acak 32 karakter (sampling tanpa bias dari WebCrypto). Hanya untuk disalin ke Vercel dan dipakai di halaman ini. */
export function generateSecret(length = 32, rng = globalThis.crypto) {
  if (!rng?.getRandomValues) throw new Error('browser tidak mendukung WebCrypto (butuh HTTPS)');
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const b of rng.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** Menafsirkan jawaban /api/token untuk kunci yang kita buat. expected = 'owner' | 'mc'. */
export function interpretServerCheck(result, expected) {
  if (!result || result.enabled === false) {
    return { ok: false, message: 'Server belum siap (suara/LiveKit belum aktif di deploy ini). Cek variabel LIVEKIT_* dan Redeploy.' };
  }
  if (!result.restricted) {
    return { ok: false, message: 'Server belum membaca EVENT_ROLE_SECRET (belum dipasang di project ini, atau belum di-Redeploy, atau kurang dari 16 karakter).' };
  }
  if (result.role === expected) return { ok: true, message: `Server menerima kunci ini sebagai ${ROLE_LABELS[expected]}.` };
  return { ok: false, message: 'Server menolak kunci ini: rahasia yang dipakai di halaman ini berbeda dengan EVENT_ROLE_SECRET di Vercel. Buat ulang rahasia, simpan di Vercel, Redeploy, lalu buat tautan lagi dengan rahasia yang sama.' };
}

export async function buildLink({ origin, page = 'villa', event, role, secret, subtle }) {
  const key = await deriveRoleKeyWeb(secret, event, role, subtle);
  const query = event ? `?e=${event}&key=${key}` : `?key=${key}`;
  return { key, url: `${origin}${PAGES[page] ?? PAGES.villa}${query}` };
}
