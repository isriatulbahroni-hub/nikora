// Sayap Ruang Game NIKORA Wedding Villa (satuan meter, sistem koordinat sama dengan villa-layout.js).
// Modul ini murni data + fungsi kecil (tanpa THREE) supaya dipakai bersama klien dan server.
//
// Aturan produk:
//  - Ruang game ada di semua tempat acara KECUALI masjid (lihat GAME_ROOM_EXCLUDED).
//  - Tiap permainan punya ruangannya sendiri (bulu tangkis, horor, dst.). Tamu harus masuk ke sayap ini
//    lewat lobi untuk bermain; di luar sayap tidak ada permainan yang berjalan.
//  - Pintu masuk tunggal lewat lobi, jadi pemilik acara kelak bisa menutup seluruh sayap dari satu tempat.
//
// Letak: pojok barat daya halaman villa (selatan dapur, di dalam pagar). Pagar barat x = -42, selatan z = 42.

export const GAME_ROOM_EXCLUDED = Object.freeze(['masjid']);

/** Apakah dunia/tempat acara `world` (kunci seperti di venues.js) boleh punya ruang game? */
export const gameRoomAllowed = (world) => !GAME_ROOM_EXCLUDED.includes(world);

// Batas luar sayap. Jarak ke pagar: barat 4 m, selatan 2,5 m (semak hias tembok keliling berada di luar sayap).
export const GAME_WING = Object.freeze({ rect: [-38, 31, -14, 39.5] });

// Urutan dari barat ke timur: bulu tangkis | lobi | horor. Semua ruangan hanya terhubung lewat lobi.
export const GAME_ROOMS = Object.freeze([
  { id: 'game_badminton', name: 'Ruang Bulu Tangkis', kind: 'game', game: 'badminton', rect: [-38, 31, -30, 39.5] },
  { id: 'game_lobby', name: 'Lobi Ruang Game', kind: 'game', game: null, rect: [-30, 31, -22, 39.5] },
  { id: 'game_horror', name: 'Ruang Mansion Horor', kind: 'game', game: 'horror', rect: [-22, 31, -14, 39.5] },
]);

// Katalog permainan. status: 'soon' = ruangan sudah ada tetapi permainannya belum bisa dimainkan.
// scary = diberi label peringatan di pintu ruangannya.
export const GAMES = Object.freeze({
  badminton: Object.freeze({ label: 'Bulu Tangkis', room: 'game_badminton', status: 'soon', scary: false }),
  horror: Object.freeze({ label: 'Mansion Horor', room: 'game_horror', status: 'soon', scary: true }),
});

// orient 'h' = pintu di dinding sepanjang x (koordinat z); 'v' = di dinding sepanjang z (koordinat x).
export const GAME_DOORS = Object.freeze([
  { x: -24, z: 31, orient: 'h', width: 2.2 }, // pintu masuk dari taman ke lobi (digeser dari sudut dapur)
  { x: -30, z: 35.25, orient: 'v', width: 2.2 }, // lobi <-> bulu tangkis
  { x: -22, z: 35.25, orient: 'v', width: 2.2 }, // lobi <-> horor
]);

// Terminal (mesin arcade) tiap permainan: berdiri rapat di dinding selatan ruangannya, menghadap utara.
// Belum punya tabrakan (klien dan server memakai denah yang sama, jadi tabrakan baru ditambah di villa-layout.js).
export const TERMINAL_RANGE = 1.9;
export const GAME_TERMINALS = Object.freeze([
  { id: 'term_badminton', game: 'badminton', x: -34, z: 38.7 },
  { id: 'term_horror', game: 'horror', x: -18, z: 38.7 },
]);

// Papan nama. ry = putaran sumbu y bidang (depan bidang menghadap +z saat ry = 0). Tinggi 2,25..2,85 m: di atas bukaan
// pintu (2,1 m) dan di bawah puncak dinding (3,0 m).
export const GAME_SIGNS = Object.freeze([
  { id: 'sign_entrance', text: 'RUANG GAME', sub: 'Bulu Tangkis · Mansion Horor', x: -24, y: 2.55, z: 30.78, ry: Math.PI, w: 3.0, h: 0.6 },
  { id: 'sign_badminton', game: 'badminton', text: 'BULU TANGKIS', sub: '', x: -29.8, y: 2.55, z: 35.25, ry: Math.PI / 2, w: 1.8, h: 0.55 },
  { id: 'sign_horror', game: 'horror', text: 'MANSION HOROR', sub: 'Seram', x: -22.2, y: 2.55, z: 35.25, ry: -Math.PI / 2, w: 1.8, h: 0.55, scary: true },
]);

/** Apakah titik (x,z) berada di dalam sayap ruang game, diperluas `margin` meter? */
export function insideGameWing(x, z, margin = 0) {
  const [x1, z1, x2, z2] = GAME_WING.rect;
  return x > x1 - margin && x < x2 + margin && z > z1 - margin && z < z2 + margin;
}

/** Ruang game yang memuat permainan `gameId`, atau null. */
export const gameRoomFor = (gameId) => GAME_ROOMS.find((r) => r.game === gameId) ?? null;

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
