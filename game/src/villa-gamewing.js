// Game Center NIKORA Wedding Villa (satuan meter, sistem koordinat sama dengan villa-layout.js).
// Modul ini murni data + fungsi kecil (tanpa THREE) supaya dipakai bersama klien dan server.
//
// Aturan produk:
//  - Ruang game ada di semua tempat acara KECUALI masjid (lihat GAME_ROOM_EXCLUDED).
//  - Tiap permainan punya arenanya sendiri, berukuran sungguhan (lapangan bulu tangkis resmi 13,4 x 6,1 m).
//  - Dua arena berdiri di kiri dan kanan jalan masuk (plaza) di selatan halaman villa. Kompleks villa diperluas ke
//    selatan (BOUNDS.maxZ = 84) untuk memberi ruang; plaza di tengah berfungsi sebagai lobi terbuka.
//
// Susunan (tampak atas, utara di atas):
//
//        z=44   [ gerbang lengkung GAME CENTER ]
//        z=46   +-----------------+   plaza   +-----------------+
//               |  Arena Bulu     |  x -6..6  |  Ruang Mansion  |
//               |  Tangkis        D<--- jalan --->D  Horor       |
//        z=70   +-----------------+           +-----------------+
//               x -40..-6                      x 6..40
//        z=84   [ pagar + gerbang ke jalan desa ]
//
// Ruang MOBA berupa lobi memanjang di selatan Arena Bulu Tangkis (x -30..-6, z 71.8..77.9), pintunya menghadap plaza.
// Celah 1,8 m dari arena menjaga atap limasan keduanya tidak saling menimpa. Sisi barat taman (lapangan luar ruangan,
// palem) dan timur (parkir) sudah terpakai, dan ruang tidak boleh melewati BOUNDS.maxZ - 6 (pagar dan gerbang).

export const GAME_ROOM_EXCLUDED = Object.freeze(['masjid']);

/** Apakah dunia/tempat acara `world` (kunci seperti di venues.js) boleh punya ruang game? */
export const gameRoomAllowed = (world) => !GAME_ROOM_EXCLUDED.includes(world);

// Tinggi dinding arena. Harus <= 4 m: renderer memasang dua baris jendela bila dinding lebih tinggi dari 4 m,
// dan uji atap/kamera mensyaratkan puncak dinding dekat WALL_HEIGHT (3 m) denah villa.
export const ARENA_WALL_HEIGHT = 4.0;

// Urutan dari barat ke timur. Tiap arena punya satu pintu lebar yang menghadap plaza.
export const GAME_ROOMS = Object.freeze([
  { id: 'game_badminton', name: 'Arena Bulu Tangkis', kind: 'game', game: 'badminton', wallH: ARENA_WALL_HEIGHT, rect: [-40, 46, -6, 70] },
  { id: 'game_horror', name: 'Ruang Mansion Horor', kind: 'game', game: 'horror', wallH: ARENA_WALL_HEIGHT, rect: [6, 46, 40, 70] },
  // MOBA 5 lawan 5 jalan di server MOBA; ruang ini hanya lobi dengan terminal yang membuka jendelanya (moba/index.js).
  { id: 'game_moba', name: 'Ruang MOBA', kind: 'game', game: 'moba', wallH: ARENA_WALL_HEIGHT, rect: [-30, 71.8, -6, 77.9] },
]);

// Plaza = lobi terbuka di antara dua arena, menyambung jalan setapak dari taman villa ke gerbang.
export const GAME_ZONES = Object.freeze([
  { id: 'game_plaza', name: 'Plaza Game Center', kind: 'garden', rect: [-6, 44, 6, 84] },
]);

// Katalog permainan. status: 'soon' = arena sudah ada tetapi permainannya belum bisa dimainkan.
// scary = diberi label peringatan di pintu ruangannya.
export const GAMES = Object.freeze({
  badminton: Object.freeze({ label: 'Bulu Tangkis', room: 'game_badminton', status: 'soon', scary: false }),
  horror: Object.freeze({ label: 'Mansion Horor', room: 'game_horror', status: 'soon', scary: true }),
  // 'soon' sampai server MOBA hidup (moba/index.js hanya jendela ke sana); ganti ke 'ready' setelah server siap.
  moba: Object.freeze({ label: 'MOBA 5v5', room: 'game_moba', status: 'soon', scary: false }),
});

// orient 'h' = pintu di dinding sepanjang x (koordinat z); 'v' = di dinding sepanjang z (koordinat x).
// Pintu lebar 3,2 m (dua daun) agar lega dilalui banyak tamu sekaligus.
export const GAME_DOORS = Object.freeze([
  { x: -6, z: 58, orient: 'v', width: 3.2 }, // plaza <-> arena bulu tangkis
  { x: 6, z: 58, orient: 'v', width: 3.2 }, // plaza <-> ruang horor
  { x: -6, z: 75, orient: 'v', width: 3.2 }, // plaza <-> ruang MOBA
]);

// Atap limasan di atas tiap arena (puncak dinding = ARENA_WALL_HEIGHT). Id tidak boleh berakhiran "_roof"
// (itu khusus atap menara tangga di uji).
export const GAME_ROOFS = Object.freeze(GAME_ROOMS.map((r) => Object.freeze({
  id: `${r.id}_arena`, kind: 'hip', rect: r.rect, base: ARENA_WALL_HEIGHT, rise: 3.2, overhang: 0.8,
})));

// ---------------------------------------------------------------- lapangan bulu tangkis (ukuran resmi BWF)
// Sumbu panjang lapangan sejajar x; jaring berada di x = pusat, membentang sepanjang z.
export const COURT = Object.freeze({
  length: 13.4, width: 6.1, singlesWidth: 5.18, shortService: 1.98, backService: 0.76, netHeight: 1.55, line: 0.04,
});
// Dua lapangan berdampingan (empat pemain ganda atau dua pertandingan sekaligus), pintu tepat di antaranya.
export const BADMINTON_COURTS = Object.freeze([{ x: -23, z: 52.6 }, { x: -23, z: 63.4 }]);

/** Garis lapangan sebagai persegi panjang {x, z, w, d} (pusat, lebar sepanjang x, kedalaman sepanjang z). */
export function courtLines(cx, cz, c = COURT) {
  const hl = c.length / 2;
  const hw = c.width / 2;
  const sw = c.singlesWidth / 2;
  const t = c.line;
  const lines = [];
  for (const s of [-1, 1]) {
    lines.push({ x: cx + s * hl, z: cz, w: t, d: c.width + t }); // garis belakang
    lines.push({ x: cx, z: cz + s * hw, w: c.length + t, d: t }); // garis samping ganda
    lines.push({ x: cx, z: cz + s * sw, w: c.length, d: t }); // garis samping tunggal
    lines.push({ x: cx + s * c.shortService, z: cz, w: t, d: c.width }); // garis servis pendek
    lines.push({ x: cx + s * (hl - c.backService), z: cz, w: t, d: c.width }); // garis servis belakang (ganda)
    lines.push({ x: cx + (s * (c.shortService + hl)) / 2, z: cz, w: hl - c.shortService, d: t }); // garis tengah
  }
  lines.push({ x: cx, z: cz, w: t, d: c.width }); // garis jaring
  return lines;
}

// Terminal (meja pertandingan / mesin arcade) tiap permainan: menempel di dinding sisi plaza, menghadap ke dalam arena.
// face = arah depan: n (utara, -z), s, w (barat, -x), e (timur, +x). Belum punya tabrakan (klien dan server memakai
// denah yang sama, jadi tabrakan baru ditambah di villa-layout.js).
export const TERMINAL_RANGE = 1.9;
export const GAME_TERMINALS = Object.freeze([
  { id: 'term_badminton', game: 'badminton', x: -6.5, z: 63, face: 'w' },
  { id: 'term_horror', game: 'horror', x: 6.5, z: 63, face: 'e' },
  { id: 'term_moba', game: 'moba', x: -6.5, z: 77, face: 'w' },
]);

// Papan nama di atas pintu (sisi plaza). ry = putaran sumbu y bidang (depan bidang menghadap +z saat ry = 0).
// Tinggi 2,75..3,55 m: di atas bukaan pintu (2,1 m) dan di bawah puncak dinding arena (4,0 m).
export const GAME_SIGNS = Object.freeze([
  { id: 'sign_badminton', game: 'badminton', text: 'BULU TANGKIS', sub: 'Arena', x: -5.78, y: 3.15, z: 58, ry: Math.PI / 2, w: 3.0, h: 0.8 },
  { id: 'sign_horror', game: 'horror', text: 'MANSION HOROR', sub: 'Seram', x: 5.78, y: 3.15, z: 58, ry: -Math.PI / 2, w: 3.0, h: 0.8, scary: true },
  { id: 'sign_moba', game: 'moba', text: 'MOBA 5v5', sub: 'Lawan pemain sungguhan', x: -5.78, y: 3.15, z: 75, ry: Math.PI / 2, w: 3.0, h: 0.8 },
]);

// Gerbang lengkung di mulut plaza (hiasan; tiangnya berdiri di tepi plaza, tidak menghalangi jalan tengah).
export const GAME_ARCH = Object.freeze({ z: 44.5, halfSpan: 5.3, height: 5.6, text: 'GAME CENTER', sub: 'Bulu Tangkis · Mansion Horor' });

/** Apakah titik (x,z) berada di dalam salah satu arena, diperluas `margin` meter? */
export function insideGameWing(x, z, margin = 0) {
  return GAME_ROOMS.some(({ rect: [x1, z1, x2, z2] }) => x > x1 - margin && x < x2 + margin && z > z1 - margin && z < z2 + margin);
}

/** Ruang game yang memuat permainan `gameId`, atau null. */
export const gameRoomFor = (gameId) => GAME_ROOMS.find((r) => r.game === gameId) ?? null;

/**
 * Tinggi dinding untuk segmen dinding `w` (hasil buildWallSegments) bila segmen itu bagian tepi arena, selain itu null.
 * Dipakai getVillaWorld agar renderer dan kamera memakai tinggi yang sama.
 */
export function gameEdgeHeight(w) {
  const mid = (w.a + w.b) / 2;
  for (const r of GAME_ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    const onH = w.orient === 'h' && (Math.abs(w.coord - z1) < 1e-6 || Math.abs(w.coord - z2) < 1e-6) && mid > x1 && mid < x2;
    const onV = w.orient === 'v' && (Math.abs(w.coord - x1) < 1e-6 || Math.abs(w.coord - x2) < 1e-6) && mid > z1 && mid < z2;
    if (onH || onV) return r.wallH ?? null;
  }
  return null;
}

/** Terminal terdekat dalam jangkauan, atau null. Hanya di lantai dasar dan tidak saat di tangga. */
export function nearestTerminal(pos, range = TERMINAL_RANGE) {
  if (!pos || pos.stair != null || (pos.level ?? 0) !== 0) return null;
  let best = null;
  let bestDistance = range;
  for (const t of GAME_TERMINALS) {
    const d = Math.hypot(t.x - pos.x, t.z - pos.z);
    if (d <= bestDistance) {
      best = t;
      bestDistance = d;
    }
  }
  return best;
}
