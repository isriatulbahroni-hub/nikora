// Alamat MOBA untuk dunia villa/tempat acara. Murni string (tanpa DOM) supaya mudah diuji.
// Server MOBA (fork claude-of-legends) membuka lobi privat lewat /?join=KODE, kode 5 huruf yang dibuat server.

export const MOBA_ORIGIN_DEFAULT = 'https://moba.roneysagita.online';

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
