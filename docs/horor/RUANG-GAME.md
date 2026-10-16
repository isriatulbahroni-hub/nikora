# Ruang Game (sayap permainan di tempat acara)

## Aturan

- Ada di semua tempat acara **kecuali masjid** (`gameRoomAllowed` di `game/src/villa-gamewing.js`).
- **Tiap permainan punya ruangannya sendiri** (bulu tangkis, horor, dst.). Tamu harus masuk ke sayap ini untuk bermain.
- Pintu masuk tunggal lewat **lobi**, sehingga seluruh sayap kelak bisa ditutup pemilik acara dari satu tempat.

## Yang sudah ada di villa (tahap 1: denah)

Sayap di pojok barat daya halaman (selatan dapur), x -38..-14, z 31..39,5:

| Ruangan | id | Isi |
|---|---|---|
| Ruang Bulu Tangkis | `game_badminton` | kosong, status "segera hadir" |
| Lobi Ruang Game | `game_lobby` | pintu masuk dari taman (x -24, z 31) |
| Ruang Mansion Horor | `game_horror` | kosong, status "segera hadir", diberi tanda `scary` |

Ruang bulu tangkis dan horor hanya terhubung lewat lobi. Dinding, pintu otomatis, tabrakan, nama lokasi di HUD, dan suara per ruangan sudah jalan karena denah villa berbasis data.
Palem yang tumbuh di lokasi sayap dipindahkan (dilewati) di `buildProps`.

Menambah permainan baru = satu entri di `GAME_ROOMS` + `GAMES` (dan ruangan baru perlu dimasukkan ke deretan sayap).

## Belum dikerjakan

1. Tampilan ruangan: lantai/dinding bertema, papan nama di pintu, mesin/terminal permainan (butuh ubahan `villa-world.js`).
2. Interaksi: tombol "Main" saat dekat terminal, layar permainan terbuka di halaman villa yang sama (butuh ubahan `villa-main.js`).
3. Permainan pertama (satu ruangan + satu zombie memakai `navmesh.js`), lalu bulu tangkis.
4. Papan skor di dinding dan tombol buka/tutup sayap untuk pemilik acara.
5. Ruang game di venue lain (Royal, Aula). Masjid dikecualikan.

## Catatan pengujian

Test baru ada di `game/src/villa-gamewing.test.js` (jalankan `npm test` di folder `game`). Test lama `villa-layout.test.js` seharusnya tetap lulus (jumlah kamar tamu, kasur, dan titik duduk tidak berubah), tetapi belum dijalankan.
