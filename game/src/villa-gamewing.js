// Game Center NIKORA Wedding Villa (satuan meter, sistem koordinat sama dengan villa-layout.js).
// Modul ini murni data + fungsi kecil (tanpa THREE) supaya dipakai bersama klien dan server.
//
// Aturan produk:
//  - Ruang game ada di semua tempat acara KECUALI masjid (lihat GAME_ROOM_EXCLUDED).
//  - Tiap permainan punya ruangnya sendiri. Permainan DIMAINKAN di layar penuh lewat terminal (GameHost), jadi ruang
//    hanya perlu muat pintu dan terminal: semua ruang berukuran sama dan kecil (GAME_ROOM_SIZE), bukan arena sungguhan.
//  - Ruang berjajar di kiri dan kanan jalan masuk (plaza) di selatan halaman villa. Letaknya dihitung dari slot
//    (sisi + baris), jadi menambah permainan = satu entri di GAME_LAYOUT + satu di GAMES. Slot yang masih kosong
//    bisa dilihat lewat freeGameSlots(); lahan di luar slot dibiarkan kosong untuk permainan berikutnya.
//
// Susunan (tampak atas, utara di atas; sisi 'w' = barat, 'e' = timur):
//
//        z=44   [ gerbang lengkung GAME CENTER ]
//        z=46   +----------+   plaza   +----------+   baris 0
//               | bulu     D<- x-6..6 ->D horor    |
//               | tangkis  |           |          |
//        z=55   +----------+           +----------+
//        z=56.8 +----------+           .  (slot    .   baris 1
//               | MOBA     D           .   kosong) .
//        z=65.8 +----------+           ............
//        z=67.6 (baris 2: slot kosong di kedua sisi)
//        z=84   [ pagar + gerbang ke jalan desa ]

export const GAME_ROOM_EXCLUDED = Object.freeze(['masjid']);

/** Apakah dunia/tempat acara `world` (kunci seperti di venues.js) boleh punya ruang game? */
export const gameRoomAllowed = (world) => !GAME_ROOM_EXCLUDED.includes(world);

// Tinggi dinding ruang game. Harus <= 4 m: renderer memasang dua baris jendela bila dinding lebih tinggi dari 4 m,
// dan uji atap/kamera mensyaratkan puncak dinding dekat WALL_HEIGHT (3 m) denah villa.
export const ARENA_WALL_HEIGHT = 4.0;

// Ukuran seragam semua ruang game (m). `gap` = celah antar baris; menjaga atap limasan (overhang 0,8 m) tidak saling menimpa.
export const GAME_ROOM_SIZE = Object.freeze({ width: 12, depth: 9, gap: 1.8 });
const PLAZA_HALF = 6; // plaza selebar 12 m (x -6..6): dinding ruang berdiri di tepinya
const FIRST_ROW_Z = 46;
const LAST_Z = 78; // BOUNDS.maxZ (84) - 6: sisakan jalan di depan pagar dan gerbang selatan
export const GAME_DOOR_WIDTH = 3.2; // dua daun, lega dilalui banyak tamu sekaligus

/** Jumlah baris slot yang muat di dalam pagar; tiap baris punya dua slot (barat dan timur). */
export const GAME_SLOT_ROWS = Math.floor((LAST_Z - FIRST_ROW_Z + GAME_ROOM_SIZE.gap) / (GAME_ROOM_SIZE.depth + GAME_ROOM_SIZE.gap));

/** Persegi [x1, z1, x2, z2] slot ruang game di sisi 'w' (barat) atau 'e' (timur) pada baris `row`. */
export function gameSlotRect(side, row) {
  const { width, depth, gap } = GAME_ROOM_SIZE;
  const z1 = FIRST_ROW_Z + row * (depth + gap);
  return side === 'w' ? [-PLAZA_HALF - width, z1, -PLAZA_HALF, z1 + depth] : [PLAZA_HALF, z1, PLAZA_HALF + width, z1 + depth];
}

// Daftar ruang game. Menambah permainan: satu entri di sini (pilih slot kosong dari freeGameSlots()) + satu entri di GAMES.
// `sign` = tulisan papan nama di atas pintu; `scary` = diberi label peringatan.
const GAME_LAYOUT = Object.freeze([
  { game: 'badminton', id: 'game_badminton', name: 'Ruang Bulu Tangkis', side: 'w', row: 0, sign: Object.freeze({ text: 'BULU TANGKIS', sub: 'Main di layar' }) },
  { game: 'horror', id: 'game_horror', name: 'Ruang Mansion Horor', side: 'e', row: 0, scary: true, sign: Object.freeze({ text: 'MANSION HOROR', sub: 'Seram' }) },
  // MOBA 5 lawan 5 jalan di server MOBA; ruang ini hanya lobi dengan terminal yang membuka jendelanya (moba/index.js).
  { game: 'moba', id: 'game_moba', name: 'Ruang MOBA', side: 'w', row: 1, sign: Object.freeze({ text: 'MOBA 5v5', sub: 'Lawan pemain sungguhan' }) },
]);

const PLACED = Object.freeze(GAME_LAYOUT.map((e) => Object.freeze({ ...e, rect: gameSlotRect(e.side, e.row) })));
const doorZ = (p) => (p.rect[1] + p.rect[3]) / 2; // pintu tepat di tengah dinding sisi plaza
const doorX = (p) => (p.side === 'w' ? -PLAZA_HALF : PLAZA_HALF);

export const GAME_ROOMS = Object.freeze(PLACED.map((p) => Object.freeze({ id: p.id, name: p.name, kind: 'game', game: p.game, wallH: ARENA_WALL_HEIGHT, rect: p.rect })));

/** Slot yang belum dipakai ruang mana pun (di dalam pagar), siap untuk permainan baru. */
export function freeGameSlots() {
  const used = new Set(GAME_LAYOUT.map((e) => `${e.side}${e.row}`));
  const out = [];
  for (let row = 0; row < GAME_SLOT_ROWS; row++) {
    for (const side of ['w', 'e']) if (!used.has(`${side}${row}`)) out.push({ side, row, rect: gameSlotRect(side, row) });
  }
  return out;
}

// Plaza = lobi terbuka di antara dua deret ruang, menyambung jalan setapak dari taman villa ke gerbang.
export const GAME_ZONES = Object.freeze([
  { id: 'game_plaza', name: 'Plaza Game Center', kind: 'garden', rect: [-6, 44, 6, 84] },
]);

// Katalog permainan. status: 'soon' = ruang sudah ada tetapi permainannya belum bisa dimainkan.
// scary = diberi label peringatan di pintu ruangnya.
export const GAMES = Object.freeze({
  badminton: Object.freeze({ label: 'Bulu Tangkis', room: 'game_badminton', status: 'ready', scary: false }),
  horror: Object.freeze({ label: 'Mansion Horor', room: 'game_horror', status: 'soon', scary: true }),
  // 'soon' sampai server MOBA hidup (moba/index.js hanya jendela ke sana); ganti ke 'ready' setelah server siap.
  moba: Object.freeze({ label: 'MOBA 5v5', room: 'game_moba', status: 'soon', scary: false }),
});

// orient 'h' = pintu di dinding sepanjang x (koordinat z); 'v' = di dinding sepanjang z (koordinat x).
export const GAME_DOORS = Object.freeze(PLACED.map((p) => Object.freeze({ x: doorX(p), z: doorZ(p), orient: 'v', width: GAME_DOOR_WIDTH })));

// Atap limasan di atas tiap ruang (puncak dinding = ARENA_WALL_HEIGHT). Id tidak boleh berakhiran "_roof"
// (itu khusus atap menara tangga di uji).
export const GAME_ROOFS = Object.freeze(GAME_ROOMS.map((r) => Object.freeze({
  id: `${r.id}_arena`, kind: 'hip', rect: r.rect, base: ARENA_WALL_HEIGHT, rise: 2.6, overhang: 0.8,
})));

// Terminal (mesin arcade) tiap permainan: menempel di dinding sisi plaza, 2,8 m dari pintu, menghadap ke dalam ruang.
// face = arah depan: n (utara, -z), s, w (barat, -x), e (timur, +x). Belum punya tabrakan (klien dan server memakai
// denah yang sama, jadi tabrakan baru ditambah di villa-layout.js).
export const TERMINAL_RANGE = 1.9;
export const GAME_TERMINALS = Object.freeze(PLACED.map((p) => Object.freeze({
  id: `term_${p.game}`, game: p.game, x: p.side === 'w' ? -6.5 : 6.5, z: doorZ(p) + 2.8, face: p.side === 'w' ? 'w' : 'e',
})));

// Papan nama di atas pintu (sisi plaza). ry = putaran sumbu y bidang (depan bidang menghadap +z saat ry = 0).
// Tinggi 2,75..3,55 m: di atas bukaan pintu (2,1 m) dan di bawah puncak dinding (4,0 m).
export const GAME_SIGNS = Object.freeze(PLACED.map((p) => Object.freeze({
  id: `sign_${p.game}`, game: p.game, text: p.sign.text, sub: p.sign.sub,
  x: p.side === 'w' ? -5.78 : 5.78, y: 3.15, z: doorZ(p), ry: p.side === 'w' ? Math.PI / 2 : -Math.PI / 2, w: 3.0, h: 0.8,
  ...(p.scary ? { scary: true } : {}),
})));

// Gerbang lengkung di mulut plaza (hiasan; tiangnya berdiri di tepi plaza, tidak menghalangi jalan tengah).
export const GAME_ARCH = Object.freeze({ z: 44.5, halfSpan: 5.3, height: 5.6, text: 'GAME CENTER', sub: 'Bulu Tangkis · Horor · MOBA' });

/** Apakah titik (x,z) berada di dalam salah satu ruang game, diperluas `margin` meter? */
export function insideGameWing(x, z, margin = 0) {
  return GAME_ROOMS.some(({ rect: [x1, z1, x2, z2] }) => x > x1 - margin && x < x2 + margin && z > z1 - margin && z < z2 + margin);
}

/** Ruang game yang memuat permainan `gameId`, atau null. */
export const gameRoomFor = (gameId) => GAME_ROOMS.find((r) => r.game === gameId) ?? null;

/**
 * Tinggi dinding untuk segmen dinding `w` (hasil buildWallSegments) bila segmen itu bagian tepi ruang game, selain itu null.
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
