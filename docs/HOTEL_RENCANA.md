# NIKORA Grand Hotel & Mobil — Rencana dari Pemilik

Dokumen ini mencatat rencana pemilik proyek (disampaikan 19–20 Oktober 2026) supaya Claude atau pengembang lain yang melanjutkan pekerjaan tahu arah yang diinginkan. Isinya adalah **rencana**, bukan status implementasi. Bagian "Status saat ini" di bawah menjelaskan apa yang benar-benar sudah ada.

## Status saat ini (per 21 Oktober 2026)

- Hotel di kode masih **menara 15 lantai dengan desain/arsitektur lama** (`game/src/hotel-world.js`, `hotel-layout.js`, `hotel-ui.js`, halaman `hotel.html`). Pemilik menyatakan tampilannya belum sesuai keinginan dan harus diganti dengan arsitektur baru.
- Mobil: `vehicle-fleet.js`, `vehicle-view.js`, `car-ride.js` (PR #65, sudah di `main`).
- PR #67 (menggabungkan hotel 15 lantai, lift hotel, dan mobil ke dunia villa) masih terbuka dan belum diuji di peta.
- Belum ada: hotel 1000 lantai, 500 mobil per tempat acara, kontrol admin mobil, kolam renang, taman, kontrol kamar, sistem booking.

## Hotel NIKORA

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

## Mobil

- Villa, aula, masjid, dan royal masing-masing punya mobil sendiri: **500 unit per tempat acara** (angka 100 sebelumnya diganti).
- Semuanya mobil **paling mewah dan termahal**.
- Mobil yang tidak terpakai bisa **dinonaktifkan sesuai jumlah pengguna**, diatur admin supaya tidak berat.
- **Admin harus tahu** tiap tamu berasal dari acara mana dan siapa yang memakai mobil.
- Tamu **tidak punya akses** ke penginapan (hotel) maupun mengendarai mobil **tanpa persetujuan admin**.

## Catatan teknis untuk pengembang berikutnya

- Dunia villa memakai three.js (aula dan vila); repo bernama `nikora`.
- Server villa belum mengenal geometri hotel. Saat berjalan di hotel, klien mengirim gerak ke server villa; ada risiko pemain ditarik balik oleh pengecekan `SNAP_DISTANCE`. Perlu diuji dan, bila terjadi, server perlu diberi dunia hotel.
- Jalankan perubahan lewat branch dan PR, bukan langsung ke `main`.
- Jangan menulis seolah fitur sudah ada sebelum dibangun dan diuji (lihat prinsip "No fake product claims" di README).
