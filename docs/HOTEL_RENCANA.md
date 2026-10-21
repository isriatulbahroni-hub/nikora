# NIKORA Grand Hotel & Mobil — Rencana dan Roadmap

Dokumen ini mencatat rencana pemilik proyek (disampaikan 19–21 Oktober 2026) dan roadmap pengerjaannya, supaya Claude atau pengembang lain yang melanjutkan pekerjaan tahu arah yang diinginkan dan apa yang sudah/belum ada. Bagian rencana adalah **keinginan pemilik**, bukan status implementasi. Bagian "Roadmap dan status" menjelaskan apa yang benar-benar sudah ada di `main`.

Terakhir diperbarui: 21 Oktober 2026.

## Roadmap dan status

Tanda: `[x]` sudah ada di `main`, `[~]` sebagian / belum diuji tampilannya, `[ ]` belum dikerjakan.

### Hotel (menara)

- [x] Halaman hotel mandiri `game/hotel.html`: jalan kaki, kamera, peta per lantai, menu Jelajah (PR #59).
- [x] Menara **1000 lantai** (level 0..999, tinggi 4,2 km), lantai dibuat malas (PR #74). Podium 1–4 (lobi, ballroom, spa, belanja), kamar tamu 975 lantai × 34 kamar, Sky Lobby tiap 50 lantai, suite eksekutif (lantai 999), Sky Level (lantai 1000).
- [x] Lift ekspres (4 lift, perjalanan ke puncak sekitar 22 detik) dan panel lift untuk 1000 lantai (ketik nomor, lompat ±1/10/100).
- [~] Cangkang menara (pelat, kaca tirai, sirip emas, sabuk Sky Lobby, mahkota) dan interior hanya untuk podium + lantai di dekat pemain. **Tampilan 3D belum dinilai pemilik**; CI hanya menguji logika dan build. Pemilik sebelumnya menilai desain lama kurang sesuai ("arsitektur lama"); perlu iterasi desain eksterior.
- [ ] Arsitektur hotel yang benar-benar baru dan "seperti dunia nyata" (bentuk menara, fasad, lobi megah). Sekarang masih kotak 72 × 56 m di semua ketinggian.
- [ ] Fasilitas dirancang satu per satu (sekarang masih ruangan dasar berupa kotak): restoran, ballroom, spa, gym, bioskop, ruang VIP, dll.
- [ ] Pindahkan ruang game dari villa ke hotel (hotel diperluas, lebih canggih).

### Kamar

- [~] Kamar tamu ada (34 per lantai, tempat tidur), tapi belum lengkap.
- [ ] Kamar luas dan lengkap: sofa, tempat duduk, meja kerja, kamar mandi, WC, dll.
- [ ] Kontrol TV, AC, lampu, dan perangkat lain di kamar.
- [ ] Maksimal 2 orang tidur per kamar.
- [ ] Akses kontrol kamar untuk siapa pun yang masuk (tanpa batas jumlah) dengan izin pemesan (booking).
- [ ] Suara TV tidak terdengar di luar kamar.
- [ ] Sistem booking kamar.

### Taman, kolam, parkir

- [ ] Taman indah: siang penuh burung, malam sunyi dengan suara pancuran. (Rencana: burung boids buatan sendiri dengan instancing; suara air.)
- [~] Air kolam renang (adaptasi beautiful-water, MIT; PR #73, dikerjakan di sesi lain). Belum ada kolam berdesain berbeda-beda dan belum bisa berenang.
- [ ] Setiap kolam berdesain berbeda-beda dan pengguna bisa berenang seperti di dunia nyata.
- [ ] Parkir berarsitektur luar biasa dan canggih.

### Mobil

- [x] Mobil bersama dan fisika mengemudi (`vehicle-fleet.js`, `car-ride.js`) dan multiplayer LiveKit di halaman hotel (PR #65, #72). Hotel punya 8 mobil.
- [~] Simulator mobil multiplayer terpisah di `car-simulator/` (PR #71, dari sesi lain).
- [ ] 500 mobil termewah per tempat acara (villa, aula, masjid, royal).
- [ ] Mobil tak terpakai dinonaktifkan sesuai jumlah pengguna, diatur admin.
- [ ] Admin tahu tiap tamu berasal dari acara mana dan siapa yang memakai mobil; tamu tidak boleh mengemudi atau masuk hotel tanpa persetujuan admin.

### Sambungan antar-lokasi

- [ ] Menyambungkan hotel ke dunia villa lewat jalan raya (PR #67 ditutup tanpa merge; masih berasumsi hotel 15 lantai dan perlu dibuat ulang untuk menara 1000 lantai).
- [ ] Hotel terhubung langsung ke villa, aula, royal, dan masjid; antar-tempat acara tidak saling terhubung.
- [ ] Server dunia mengenal geometri hotel (risiko pemain ditarik balik oleh `SNAP_DISTANCE` saat berjalan di hotel dalam dunia villa).

## Rencana pemilik (rincian)

### Hotel NIKORA

- Hotel adalah tempat penginapan yang **jauh dari tempat acara** dan sengaja diletakkan **di tengah-tengah keempat tempat acara**: villa, aula, royal, dan masjid.
- Rencana akhir: **1000 lantai** dengan arsitektur paling canggih, bukan hotel biasa. Target kelas bintang 5 namun paling canggih dengan sistem dan fitur canggih.
- Tampilan harus terasa seperti **dunia nyata**, bukan sekadar terlihat 3D.
- Hotel diperluas dan ditingkatkan: lebih luas, lebih canggih, semua fasilitas, ruang VIP, dan lain-lain.
- **Ruangan game yang sekarang ada di villa dipindah ke hotel.**
- Fitur dicari dulu di GitHub lalu dimasukkan ke proyek supaya tidak membuat kode dari awal.

### Konektivitas antar-lokasi

- Villa, aula, royal, dan masjid **masing-masing terhubung langsung ke hotel**.
- Antar-tempat acara **tidak saling terhubung**. Contoh: villa ke hotel bisa, villa ke masjid tidak; masjid ke hotel bisa, masjid ke villa tidak.
- Perpindahan antara tempat acara dan hotel memakai **mobil**.

### Kamar

- Tiap kamar tidur luas dan punya semua fasilitas: sofa, tempat duduk, meja kerja, kamar mandi, WC, dan lain-lain.
- Tamu bisa mengontrol **TV, AC, lampu, dan perangkat lain** di kamar.
- Satu kamar maksimal ditiduri **2 orang**.
- Kontrol kamar bisa dilihat siapa pun yang masuk ke kamar itu, **tanpa batas jumlah**, asalkan ada **izin dari yang memesan (booking)** kamar.
- **Suara TV tidak boleh terdengar oleh orang di luar kamar.**

### Fasilitas

- Kolam renang: **setiap kolam berdesain berbeda-beda** dan pengguna bisa berenang seperti di dunia nyata.
- Taman yang sangat indah: siang hari penuh burung yang indah; malam hari tampak mempesona dan sunyi dengan suara pancuran terdengar.
- Desain parkir juga harus berarsitektur luar biasa dan canggih, bukan biasa-biasa saja.

### Mobil

- Villa, aula, masjid, dan royal masing-masing punya mobil sendiri: **500 unit per tempat acara** (angka 100 sebelumnya diganti).
- Semuanya mobil **paling mewah dan termahal**.
- Mobil yang tidak terpakai bisa **dinonaktifkan sesuai jumlah pengguna**, diatur admin supaya tidak berat.
- **Admin harus tahu** tiap tamu berasal dari acara mana dan siapa yang memakai mobil.
- Tamu **tidak punya akses** ke penginapan (hotel) maupun mengendarai mobil **tanpa persetujuan admin**.

## Catatan untuk pengembang berikutnya

- Dunia villa memakai three.js (aula dan vila); repo bernama `nikora`.
- Hotel 1000 lantai: lantai dibuat malas (`getHotelWorld().levels` adalah Proxy). Jangan mengulang `for (l < HOTEL_LEVEL_COUNT)` untuk membangun geometri atau daftar tujuan; pakai `featuredLevels()` atau jendela `focus(level)` di `hotel-world.js`.
- Server villa belum mengenal geometri hotel; lihat risiko `SNAP_DISTANCE` di atas.
- Kode dari luar hanya boleh dipakai bila berlisensi bebas (MIT, CC0, dan sejenisnya) dan dicatat di `game/THIRD_PARTY_NOTICES.md`. Kode tanpa lisensi tidak disalin; idenya boleh ditulis ulang sendiri.
- Jalankan perubahan lewat branch dan PR, bukan langsung ke `main`.
- Jangan menulis seolah fitur sudah ada sebelum dibangun dan diuji (lihat prinsip "No fake product claims" di README).
