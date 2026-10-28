# Taman Air Terjun & Kolam Lagoon (hotel)

Taman di sudut tenggara tapak NIKORA Grand Hotel: lahan kosong di timur menara, tepat di selatan Royal Garage, di dalam jalan Lingkar (tebing air terjunnya terlihat dari jalan).
Murni tampilan dan indra, ditambah penghalang jalan kaki di lantai dasar. Fisika mobil dan jaringan tidak berubah.

## Isi
- Dek travertin 66 x 60 m (`x 82..148, z 504..564`), kolam lagoon 38 x 46 m (air dari `pool-water.js`, desain `lagoon`), dermaga kayu sampai peron pandang 3 m dari kaki air terjun.
- Tebing berundak setinggi 15,5 m: satu air terjun besar (10 m lebar) dan dua kecil. Air melengkung keluar (shader), busa di dasar, kabut percikan naik ke arah dermaga.
- 4 kabana, 24 kursi berjemur, 10 payung, 12 palem, jalur tanam berbunga, papan nama "NIKORA LAGOON" di pintu masuk barat.
- Malam hari: lentera, lampu kabana, lampu bawah air, dan air terjun menyala otomatis mengikuti `hotel-sky.js`. Siang cerah: pelangi tipis di kabut.
- Menu Jelajah: "Taman Air Terjun & Kolam Lagoon" (kelompok Halaman & parkir), titik awal di dermaga.
- Kolam tidak bisa dimasuki (berenang belum ada); dermaga satu-satunya jalan ke tengah kolam.

## Efek 4D
| Efek | File | Dimatikan dengan |
| --- | --- | --- |
| Suara air terjun stereo (gemuruh, desis, debur), volume dari jarak, redam di dalam gedung dan kabin, naik 30% saat hujan | `hotel-lagoon-sound.js` | `?suara=0` |
| Getaran halus HP di dermaga (makin dekat makin rapat) | `hotel-lagoon-4d.js` | `?getar=0` |
| Tetes air dan kabut tipis di layar saat kamera dekat dan menghadap air terjun | `hotel-lagoon-4d.js` | `?lagoon=0`, "kurangi gerakan" di sistem |
| Air terjun lebih deras dan kabut lebih tebal saat hujan (`window.__weather`) | `hotel-lagoon.js` | `?lagoon=0` |

`?lagoon=0` mematikan seluruh taman. `?q=low`: kabut 40 titik (bukan 120), tetes layar maksimal 12 (bukan 30), dan air kolam tanpa pantulan hidup (tanpa render scene tambahan).
iPhone/Safari tidak punya `navigator.vibrate`: getaran otomatis tidak ada.

## Berkas
- `hotel-lagoon-data.js`: denah, tabrakan, batu/tebing deterministik, rumus suara (murni, tanpa THREE). Dipakai `hotel-layout.js` (zona `hotel_lagoon` + penghalang) dan `hotel-world.js` (pohon tidak tumbuh di taman).
- `hotel-lagoon.js`: gambar 3D, semua benda berulang memakai `InstancedMesh`; air terjun, busa, dan kabut dianimasikan di shader.
- `hotel-lagoon-sound.js`, `hotel-lagoon-4d.js`: suara, getaran, percikan layar.
- Tes: `hotel-lagoon-data.test.js` (denah, tabrakan seluruh air kolam, dermaga bisa dijalani, suara), `hotel-lagoon-4d.test.js`.
- `hotel-main.js` membungkus semuanya dengan `try/catch` seperti efek hidup lain, dan menyembunyikannya selama perjalanan lorong. `window.__hotel.lagoon()` untuk pengujian.

## Belum
Berenang di kolam, kolam infinity Sky Level dan kolam dalam ruang Lt 3 masih air datar lama (bisa dipasangi `pool-water.js` berikutnya), penjaga kolam di taman.
