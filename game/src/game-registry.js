// Daftar pemuat permainan untuk GameHost (import malas: kode permainan tidak ikut dimuat sampai tamu membukanya).
//
// Aturan: tiap permainan menambah SATU baris di sini, dan hanya setelah modul permainannya ada.
// Menambah baris untuk berkas yang belum ada akan membuat build Vite gagal.
// Kunci harus sama dengan kunci di GAMES (villa-gamewing.js).
//
// Contoh (tambahkan oleh pembuat permainan):
//   horror: () => import('./horor/index.js'),
export const GAME_LOADERS = Object.freeze({
  badminton: () => import('./badminton/index.js'),
  moba: () => import('./moba/index.js'),
});
