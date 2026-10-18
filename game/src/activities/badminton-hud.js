// Teks papan skor dan pesan poin bulu tangkis (murni; diuji tanpa DOM). `nameOf(id)` mengembalikan nama pemain.
const WHY = Object.freeze({ net: 'Kok tersangkut di net', out: 'Kok keluar garis', in: 'Kok jatuh di lapangan', fault: 'Pelanggaran' });

const idOfSide = (snap, side) => (side === 'a' ? snap.a : side === 'b' ? snap.b : null);

/** Papan skor satu baris, mis. "Kamu 3 – 2 Budi · servis: Kamu". */
export function scoreText(snap, nameOf) {
  if (!snap) return '';
  const a = snap.a ? nameOf(snap.a) : '…';
  const b = snap.b ? nameOf(snap.b) : '…';
  let tail = '';
  if (snap.ph === 'lobby') tail = ' · menunggu lawan';
  else if (snap.ph === 'over') {
    const winner = idOfSide(snap, snap.w);
    tail = winner ? ` · ${nameOf(winner)} menang` : ' · selesai';
  } else if (snap.ph === 'serve' && snap.sv) {
    const server = idOfSide(snap, snap.sv);
    if (server) tail = ` · servis: ${nameOf(server)}`;
  }
  return `${a} ${snap.sc[0]} – ${snap.sc[1]} ${b}${tail}`;
}

/** Pesan setelah satu poin selesai (dari snapshot.lp), atau null bila belum ada poin. */
export function pointMessage(snap, nameOf) {
  if (!snap?.lp) return null;
  const [, side, why] = snap.lp;
  const winner = idOfSide(snap, side);
  if (!winner) return null;
  return `${WHY[why] ?? 'Poin'} · poin untuk ${nameOf(winner)} (${snap.sc[0]}–${snap.sc[1]})`;
}

export { WHY };
