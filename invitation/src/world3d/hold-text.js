/** Ubah petunjuk "sentuh/ketuk segel…" milik tema menjadi petunjuk "tahan segel…" tanpa menghilangkan nuansanya. */
export function holdHint(text) {
  const t = String(text || '').trim();
  if (!t) return 'Tahan segel hingga meleleh';
  const r = t.replace(/\b(sentuh|ketuk|tekan)\b/i, (m) => (m[0] === m[0].toUpperCase() ? 'Tahan' : 'tahan'));
  return r !== t ? r : `${t} (tahan)`;
}
export const NUDGE_TEXT = 'Tahan lebih lama sampai segel meleleh…';
