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

/** Apakah titik (x,z) berada di dalam sayap ruang game, diperluas `margin` meter? */
export function insideGameWing(x, z, margin = 0) {
  const [x1, z1, x2, z2] = GAME_WING.rect;
  return x > x1 - margin && x < x2 + margin && z > z1 - margin && z < z2 + margin;
}

/** Ruang game yang memuat permainan `gameId`, atau null. */
export const gameRoomFor = (gameId) => GAME_ROOMS.find((r) => r.game === gameId) ?? null;
