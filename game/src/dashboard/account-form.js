// Logika murni formulir akun (dites tanpa DOM). Aturan ini mencerminkan server (src/staff-auth.js); server tetap yang memutuskan.
export const KIND_LABELS = Object.freeze({ pemilik: 'Pemilik acara', admin: 'Admin', developer: 'Developer' });
export const KIND_HELP = Object.freeze({
  pemilik: 'Masuk ke Studio untuk membuat dan mengelola undangannya sendiri.',
  admin: 'Masuk ke dasbor ini dan bisa membuat akun pemilik acara.',
  developer: 'Akses penuh dasbor, termasuk membuat admin.',
});
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

/** Jenis akun yang boleh dibuat. Developer = akun staf berperan owner atau yang masuk dengan rahasia induk. */
export function allowedKinds({ role, viaSecret } = {}) {
  if (viaSecret) return ['pemilik', 'admin', 'developer'];
  if (role === 'owner') return ['pemilik', 'admin'];
  if (role === 'admin') return ['pemilik'];
  return [];
}

// Tanpa huruf yang mudah tertukar (0/O, 1/l/I) supaya mudah disalin atau dibacakan.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function secureInt(max) {
  const limit = Math.floor(0x100000000 / max) * max; // tolak nilai di atas kelipatan max agar tidak bias
  const buf = new Uint32Array(1);
  let v;
  do {
    globalThis.crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % max;
}

/** Kata sandi acak. `randomInt(n)` bisa diganti untuk uji. */
export function generatePassword(length = 12, randomInt = secureInt) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function validateAccountForm({ email, password, kind } = {}) {
  const mail = String(email ?? '').trim().toLowerCase();
  if (!mail || mail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, message: 'Isi alamat email yang valid.' };
  const pass = String(password ?? '');
  if (pass.length < MIN_PASSWORD || pass.length > MAX_PASSWORD) return { ok: false, message: `Kata sandi harus ${MIN_PASSWORD} sampai ${MAX_PASSWORD} karakter.` };
  if (!Object.prototype.hasOwnProperty.call(KIND_LABELS, kind)) return { ok: false, message: 'Pilih jenis akun.' };
  return { ok: true, value: { email: mail, password: pass, kind } };
}
