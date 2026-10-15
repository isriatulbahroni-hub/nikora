/** Pemformat kecil untuk dasbor (tanggal Indonesia, hitung mundur, CSV aman). */

export function fmtDate(v) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }); } catch { return ''; }
}

export function fmtDay(v) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; }
}

const day = (t) => { const x = new Date(t); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); };

/** { label, tone }: tone = past | today | soon (<= 7 hari) | later. */
export function countdownInfo(iso, now = Date.now()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return { label: 'Tanggal belum diisi', tone: 'later' };
  const n = Math.round((day(d) - day(now)) / 86400000);
  if (n < 0) return { label: 'Sudah lewat', tone: 'past' };
  if (n === 0) return { label: 'Hari ini', tone: 'today' };
  if (n === 1) return { label: 'Besok', tone: 'soon' };
  return { label: `${n} hari lagi`, tone: n <= 7 ? 'soon' : 'later' };
}

/** Sel CSV: kutip ganda digandakan; awalan = + - @ ditandai agar tidak dibaca sebagai rumus di Excel/Sheets. */
export function csvCell(v) {
  let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const csvOf = (rows) => `\ufeff${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

export function downloadText(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
