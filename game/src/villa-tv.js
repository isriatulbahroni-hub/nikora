// Bantuan penempatan TV (room-tv.js): bagian dinding yang tidak boleh ditutup TV (pintu dan jendela).
// Murni data + matematika (tanpa THREE/DOM) agar bisa diuji.

// Aturan jendela SAMA dengan buildWalls() di villa-world.js (lebar 1,5 m; hanya dinding luar sepanjang >= 3,4 m;
// n = floor((panjang - 1,4) / 3,2) jendela, tersebar rata). villa-tv.test.js menjaga agar keduanya tidak berpisah.
export const WINDOW_W = 1.5;

/** Dinding luar = salah satu sisinya tidak berbatasan dengan ruangan mana pun (titik uji 0,5 m di kedua sisi). */
export function wallIsExterior(w, rooms) {
  const mid = (w.a + w.b) / 2;
  const inside = (x, z) => rooms.some((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]);
  const p1 = w.orient === 'h' ? [mid, w.coord - 0.5] : [w.coord - 0.5, mid];
  const p2 = w.orient === 'h' ? [mid, w.coord + 0.5] : [w.coord + 0.5, mid];
  return !(inside(...p1) && inside(...p2));
}

/** Titik tengah jendela di satu potongan dinding. */
export function windowCenters(w, exterior) {
  const len = w.b - w.a;
  const n = exterior && len >= 3.4 ? Math.floor((len - 1.4) / 3.2) : 0;
  return Array.from({ length: n }, (_, i) => w.a + (len * (i + 0.5)) / n);
}

export const EDGE = 0.25; // jarak dari garis tengah dinding sudut ruangan (tebal dinding 0,15 + napas)
export const DOOR_PAD = 0.12; // rangka pintu menjorok
export const WINDOW_HALF = WINDOW_W / 2 + 0.06 + 0.05; // rangka jendela menjorok + napas

/**
 * Interval sepanjang dinding (koordinat x untuk dinding 'h', z untuk 'v') yang tidak boleh ditutup TV.
 * orient/coord = dinding yang dipilih; level = world.levels[n].
 */
export function blockedSpans(level, orient, coord) {
  const spans = [];
  for (const d of level.doors) {
    if (d.orient !== orient || Math.abs((orient === 'h' ? d.z : d.x) - coord) > 1e-6) continue;
    const c = orient === 'h' ? d.x : d.z;
    spans.push([c - d.width / 2 - DOOR_PAD, c + d.width / 2 + DOOR_PAD]);
  }
  for (const w of level.walls) {
    if (w.dup || w.orient !== orient || Math.abs(w.coord - coord) > 1e-6) continue;
    for (const c of windowCenters(w, wallIsExterior(w, level.rooms))) spans.push([c - WINDOW_HALF, c + WINDOW_HALF]);
  }
  return spans;
}
