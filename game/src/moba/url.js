// Alamat MOBA untuk dunia villa/tempat acara. Murni string (tanpa DOM) supaya mudah diuji.
// Server MOBA (fork claude-of-legends) membuka lobi privat lewat /?join=KODE, kode 5 huruf yang dibuat server.

export const MOBA_ORIGIN_DEFAULT = 'https://roney.biz.id';

const CODE_SHAPE = /^[A-Za-z]{5}$/;

/** Kode lobi 5 huruf (huruf besar) atau null bila bentuknya bukan kode lobi. */
export function normalizeLobbyCode(raw) {
  const typed = String(raw ?? '').trim();
  return CODE_SHAPE.test(typed) ? typed.toUpperCase() : null;
}

/** Origin MOBA yang dipakai: hanya https, tanpa jalur/kueri; selain itu kembali ke bawaan. */
export function resolveMobaOrigin(candidate) {
  try {
    const u = new URL(String(candidate ?? ''));
    if (u.protocol === 'https:' && u.username === '' && u.password === '') return u.origin;
  } catch {
    /* alamat rusak: pakai bawaan */
  }
  return MOBA_ORIGIN_DEFAULT;
}

/** Alamat yang dibuka: beranda MOBA, atau langsung ke lobi privat bila ada kode yang sah. */
export function mobaUrl(origin, lobbyCode) {
  const base = resolveMobaOrigin(origin);
  const code = normalizeLobbyCode(lobbyCode);
  return code ? `${base}/?join=${code}` : `${base}/`;
}

const MODES = new Set(['frame', 'tab']);

/**
 * Opsi MOBA untuk GameHost dari query halaman villa: ?moba=KODE (lobi privat 5 huruf) dan ?mobamode=tab|frame.
 * Nilai yang tidak sah diabaikan, jadi hasilnya aman disebar langsung ke `services`.
 */
export function mobaServicesFromSearch(search = '') {
  const p = new URLSearchParams(search);
  const out = {};
  const code = normalizeLobbyCode(p.get('moba'));
  if (code) out.mobaLobbyCode = code;
  const mode = String(p.get('mobamode') ?? '').toLowerCase();
  if (MODES.has(mode)) out.mobaMode = mode;
  return out;
}
