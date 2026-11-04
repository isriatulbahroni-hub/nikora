# Parkir villa super canggih

Lahan parkir NIKORA Wedding Villa di luar gerbang selatan, di kedua sisi jalan tanah dari gerbang (jalan yang sama dengan perjalanan hotel <-> villa).
Mulai dari z = 104 (gerbang di z = 84) sampai z = 196. Jalan di depan parkir diaspal dengan marka tengah.

## Isi

| Zona | Letak | Isi |
|---|---|---|
| Tamu | barat jalan | **300 slot** mobil, lima blok A-E (60 slot per blok, lorong 6,4 m, slot 2,8 x 5,6 m). Blok E khusus mobil listrik (pengisi daya biru muda). |
| Karyawan | timur jalan | 80 slot mobil di bawah kanopi panel surya |
| Bus | ujung selatan lajur layanan | 10 bay bus (4 x 13 m) dan lorong manuver |

Keterisian awal tamu sekitar 60% (sekitar 180 mobil), karyawan 70%, bus 60%. Mobil parkir tidak menjadi penghalang (hanya pemandangan,
sama seperti parkir hotel); pohon dan semak di luar vila tidak tumbuh di lahan parkir.

## Yang membuatnya hidup

- **Valet digital:** tiap beberapa detik ada mobil yang datang (valet memilih slot kosong terdekat, mobil menyusuri lajur masuk dan lorong blok, lalu
  parkir mundur) atau pergi (maju keluar slot dan kembali ke jalan). Paling banyak 4 mobil bergerak sekaligus.
- **Lampu LED kepala slot:** hijau kosong, merah terisi, biru muda untuk slot listrik kosong, kuning berkedip untuk slot yang sedang dituju atau baru
  ditinggalkan. Pita cahaya menyapu seluruh blok seperti pemindai.
- **Panah LED penuntun** berjalan di lajur masuk dan semua lorong (emas untuk tamu, biru muda untuk blok listrik, biru untuk karyawan, oranye untuk bus).
- **Papan digital "SISA SLOT"** di pinggir jalan menghitung langsung dari kejadian di atas; tiap blok punya papan nama.
- **Kanopi panel surya** di blok E dan seluruh parkir karyawan, gerbang lengkung bercahaya, pos valet, halte antar-jemput, lampu taman.

Semuanya InstancedMesh (sekitar 40 draw call untuk seluruh parkir).

## Berkas

- `game/src/villa-parking.js`: data dan matematika murni (slot, zona, rute, valet, kejadian datang/pergi). Diuji `villa-parking.test.js`.
- `game/src/villa-parking-world.js`: gambar 3D dan animasinya. Diuji `villa-parking-world.test.js` (dengan `three` asli, tanpa DOM; bagian kanvas
  seperti papan, panah, dan tekstur panel surya dilewati di Node).
- `game/src/villa-world.js`: memasang parkir (`buildVillaParking`) dan memanggil `update` tiap bingkai.
- `game/src/villa-layout.js`: pohon di luar vila tidak tumbuh di atas parkir. Diuji `villa-parking-layout.test.js` (pemain bisa berjalan ke semua lorong).

## Belum dikerjakan

- Tabrakan dengan mobil parkir dan bus (sengaja hanya pemandangan).
- Karyawan dan bus antar-jemput yang benar-benar bergerak dari hotel; parkir ini baru menampung kendaraannya.
- Label lokasi "Parkir Tamu" di HUD (belum ada di `roomAt`).
