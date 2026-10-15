// Autentikasi dasbor: rahasia induk tidak pernah dikirim. Yang dikirim hanya tanda tangan HMAC berumur 5 menit
// ("Admin <detik>.<tanda tangan>") yang dihitung dari rahasia itu; server memverifikasinya dengan EVENT_ROLE_SECRET.
import { MIN_SECRET, normalizeSecret } from '../role-link.js';

export const SESSION_KEY = 'orbit-admin-secret';

export async function adminHeaderWeb(secret, nowMs, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('browser tidak mendukung WebCrypto (butuh HTTPS)');
  const enc = new TextEncoder();
  const ts = Math.floor(nowMs / 1000);
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', key, enc.encode(`admin:${ts}`)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  const sig = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
  return `Admin ${ts}.${sig}`;
}

export function loadSecret(storage) {
  try {
    const s = normalizeSecret(storage?.getItem(SESSION_KEY) ?? '');
    return s.length >= MIN_SECRET ? s : '';
  } catch {
    return '';
  }
}

export function saveSecret(storage, secret) {
  try {
    storage?.setItem(SESSION_KEY, secret);
  } catch {
    /* penyimpanan tidak tersedia: sesi hanya berlaku sampai muat ulang */
  }
}

export function clearSecret(storage) {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    /* abaikan */
  }
}
