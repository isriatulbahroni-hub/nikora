// Reaksi emoji di atas kepala avatar (murni, tanpa THREE/DOM supaya mudah diuji).
// Dikirim lewat kanal obrolan dengan awalan khusus. Vila belum menampilkan obrolan teks,
// jadi pesan ini tidak muncul sebagai teks di layar tamu mana pun.
export const EMOJIS = ['😍', '👏', '🥹', '😂', '🎉', '💐', '🥳', '😭', '🙏', '❤️', '🔥', '👋'];
const PREFIX = '::emo:';

/** Indeks emoji -> teks pesan, atau null bila indeks tidak valid. */
export function encodeReaction(index) {
  return Number.isInteger(index) && index >= 0 && index < EMOJIS.length ? `${PREFIX}${index}` : null;
}

/** Teks pesan -> indeks emoji, atau null bila bukan reaksi yang valid (aman untuk data dari jaringan). */
export function decodeReaction(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return null;
  const rest = text.slice(PREFIX.length);
  if (!/^\d{1,2}$/.test(rest)) return null;
  const index = Number(rest);
  return index < EMOJIS.length ? index : null;
}
