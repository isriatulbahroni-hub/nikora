// Pesan efek khusus yang dikirim lewat kanal obrolan yang sudah ada (tanpa mengubah transport):
// diawali karakter lebar-nol (U+200B) lalu "jenis|argumen". Teks tanpa penanda adalah ucapan biasa.
export const FX_MARK = '\u200b';
export const FX_KINDS = Object.freeze(['toast', 'sky', 'pad']);
export const SKY_MODES = Object.freeze(['auto', 'sunset', 'night']);

export const encodeFx = (kind, arg = '') => `${FX_MARK}${kind}|${String(arg).slice(0, 24)}`;

/** { kind, arg } untuk pesan efek yang sah, atau null (ucapan biasa / pesan tidak dikenal). */
export function decodeFx(text) {
  if (typeof text !== 'string' || !text.startsWith(FX_MARK)) return null;
  const [kind, arg = ''] = text.slice(1).split('|');
  if (!FX_KINDS.includes(kind)) return null;
  if (kind === 'sky' && !SKY_MODES.includes(arg)) return null;
  if (kind === 'pad' && !/^[a-z_0-9]{1,16}$/.test(arg)) return null;
  return { kind, arg };
}
