/** Logika murni untuk jaring pengaman kartu 3D (mudah diuji tanpa WebGL). */

/** Apakah kotak kanvas (getBoundingClientRect) berada, sebagian saja, di dalam layar? Lebih andal daripada IntersectionObserver di sebagian peramban. */
export function rectOnScreen(r, vw, vh) {
  if (!r || !(r.width > 0) || !(r.height > 0)) return false;
  return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
}

/** Penggambaran macet: setelah `ms` milidetik, kanvas yang seharusnya tampil belum menggambar bingkai. Tab tersembunyi tidak dihitung. */
export function renderStalled({ frames, hidden, ms, limit = 3000 }) {
  return !hidden && ms >= limit && frames < 3;
}
