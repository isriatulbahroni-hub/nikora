// Daftar karakter manusia (rig Mixamo) untuk avatar profil utama. SATU sumber untuk editor, jaringan, dan pemuat model:
// avatar-config.js (CHARACTERS) dan avatar-human.js (HUMAN_MODELS) sama-sama membacanya.
//
// Menambah karakter: unggah GLB ke game/public/models/ lalu tambahkan SATU baris di bawah.
// ATURAN: tambah hanya di AKHIR dan jangan ubah urutan. Urutan = nomor karakter yang dikirim ke pemain lain dan
// tersimpan di perangkat pemain; mengubah urutan menggeser pilihan semua orang.
export const HUMAN_ROSTER = Object.freeze([
  { id: 'michelle', name: 'Michelle', file: 'models/michelle.glb' },
]);
