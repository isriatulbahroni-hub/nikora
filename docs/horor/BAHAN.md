# Bahan Game Horor (gaya survival horror)

Status: tahap bahan. Belum ada dunia horor yang bisa dimainkan.

## Hasil cek lisensi (kode)

| Repo | Lisensi kode | Dipakai |
|---|---|---|
| rishipr/der-koloss-ce | MIT (Vesper Tech, Inc.) | collision.js, navmesh.js sudah disalin |
| webdevcody/survive-the-night-fps | MIT (Web Dev Cody) | referensi: siklus siang-malam, barikade, server otoritatif |
| bridge-mind/claude-opus-5.5-zombies-game | MIT (BridgeMind) | referensi: struktur TypeScript + Vite |
| justinw916-sketch/claude-zombies | MIT (kontributor) | referensi: zombie ronde tanpa aset eksternal |

Yang BELUM dicek: lisensi aset (model, tekstur, suara) di repo 1, 3, dan 4. Cek dulu sebelum menyalin aset apa pun.

## Sudah masuk ke project

- `game/src/horor/vendor/collision.js`: tabrakan lingkaran vs kotak 2D, gerak bertahap anti-tembus dinding, raycast segmen vs kotak. Tanpa dependensi.
- `game/src/horor/vendor/navmesh.js`: navigasi musuh (grid berlapis + A*). Butuh objek `map` dengan `rooms`, `colliders`, `floorY(x, z, y)`, `floorZones`, `ramps`.

## Sengaja TIDAK dimasukkan

- `combat-rules.js`, `weapons.js`, `zombies.js`, `game.js` dari der-koloss-ce: sangat spesifik Call of Duty (senjata ajaib, anjing neraka, dll.) dan ukurannya besar. Untuk gaya Resident Evil (zombie lambat, peluru langka) lebih baik ditulis ulang.
- `assets/audio/beauty-of-annihilation.mp3` dan semua nama/karakter Call of Duty: milik Activision/Treyarch.
- Nama, karakter, model, dan musik Resident Evil milik Capcom. Game ini hanya meminjam gaya (kamera tetap, inventori terbatas, teka-teki, amunisi langka) dengan nama dan aset orisinal.

## Aset yang boleh (CC0, unduh dari sumber aslinya)

- Model zombie dan decal darah: Quaternius (https://quaternius.com)
- Tekstur bata, beton, logam, kayu: ambientCG (https://ambientcg.com)

## Langkah berikutnya (usulan)

1. Halaman baru `horor.html` + `horor-main.js` mengikuti pola `villa.html` / `villa-main.js`.
2. Denah mansion orisinal (`horor-layout.js`) yang menghasilkan `rooms`, `colliders`, `floorY` untuk navmesh.
3. Zombie lambat memakai navmesh; amunisi dan kunci sebagai item inventori.
4. Pakai ulang siklus siang-malam dan sistem kunci kamar yang sudah ada.
