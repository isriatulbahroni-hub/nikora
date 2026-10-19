// Autentikasi dasbor. Dua jalur:
//  1) Akun staf (email + kata sandi Supabase): server mengembalikan token sesi yang disimpan di tab ini.
//  2) Rahasia induk (developer/cadangan): tidak pernah dikirim. Yang dikirim hanya tanda tangan HMAC berumur 5 menit
//     ("Admin <detik>.<tanda tangan>") yang dihitung dari rahasia itu; server memverifikasinya dengan EVENT_ROLE_SECRET.
import { MIN_SECRET, normalizeSecret } from '../role-link.js';

export const SESSION_KEY = 'orbit-admin-secret';
export const STAFF_KEY = 'orbit-admin-staff';

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

/** Sesi akun staf: { token, expiresAt (ms), email, role }. Sesi yang sudah (hampir) habis dianggap tidak ada. */
export function loadStaff(storage, now = Date.now()) {
  try {
    const s = JSON.parse(storage?.getItem(STAFF_KEY) ?? 'null');
    if (s && typeof s.token === 'string' && s.token && typeof s.email === 'string' && ['owner', 'admin'].includes(s.role) && Number(s.expiresAt) > now + 5000) {
      return { token: s.token, expiresAt: Number(s.expiresAt), email: s.email, role: s.role };
    }
  } catch {
    /* rusak: anggap tidak ada */
  }
  return null;
}

export function saveStaff(storage, session) {
  try {
    storage?.setItem(STAFF_KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt, email: session.email, role: session.role }));
  } catch {
    /* penyimpanan tidak tersedia: sesi hanya berlaku sampai muat ulang */
  }
}

export function clearStaff(storage) {
  try {
    storage?.removeItem(STAFF_KEY);
  } catch {
    /* abaikan */
  }
}
