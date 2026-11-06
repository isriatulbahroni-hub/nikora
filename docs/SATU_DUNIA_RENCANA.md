# Satu dunia: semua tempat acara masuk dunia hotel

Permintaan pemilik (7 Nov 2026): semua tempat acara harus satu jalan, satu dunia, bukan dunia berbeda.
Arti yang dipilih pemilik: **aula, royal, dan masjid dipasang di dunia hotel seperti villa; jalan tiap tempat tetap seperti sekarang** (rute `journey.js` per gerbang, tidak diubah).

## Keadaan sekarang (dicek di `main`)

- Villa sudah satu dunia: `hotel-villa.js` dipasang di ujung rute lewat `hotel-journey.js` (`villa.anchor`, `villa.load`, `villa.release`).
- Aula (`hall`), Royal (`royal`), dan Masjid (`masjid`) masih halaman sendiri: di ujung rute ada area penurunan dan tombol "Masuk" (`enterUrl(gate)` di `createHotelJourney`) yang pindah halaman (`venues.js`, `highway.js` `venueUrl`).
- Komentar di `hotel-journey.js` sudah menandai ini sebagai tahap berikutnya.
- Aturan lama: antar-tempat acara tidak saling tersambung (semua lewat hotel). Tetap berlaku untuk pekerjaan ini.

## Urutan kerja (satu cabang dan satu PR per tempat acara)

1. **Masjid** (`fitur/satu-dunia-masjid`): paling mudah. `masjid-world.js` membangun satu grup `root` di bingkainya sendiri dan menerima `scene`; fisika di `masjid-layout.js`.
2. **Aula** (`fitur/satu-dunia-aula`): `hall-world.js`, `hall-layout.js`; logika permainan di `main.js`.
3. **Royal** (`fitur/satu-dunia-royal`): `royal-world.js`, `royal-layout.js`; logika di `royal-main.js`.

## Isi tiap PR

1. Adapter `game/src/hotel-<tempat>.js` meniru `hotel-villa.js`: `anchor(f)`, `load()`, `release()`, `active(p)`, `near(p)`, `walk(p, dx, dz)`, `constrain(p)`, `place(p)`, `update(...)`, `state()`.
   - Dunia tempat acara dibangun di scene tampungan (`new THREE.Scene()`), lalu hanya `root` yang dipindah ke grup adapter. Langit, kabut, dan lampu bawaan tempat acara dibuang karena hotel punya langit sendiri (`masjid-world.js` memasang `hemi`, `sun`, `fill`, dan `createMasjidSky` ke scene yang diberikan).
   - Buang bagian yang hanya cocok untuk halaman sendiri (tanah 3200 m, jalan tanah dari gerbang), seperti `stripStandaloneParts` di `hotel-villa.js`; cari bagian itu dengan ciri geometri atau berikan opsi di fungsi `build...World`.
   - Fisika berjalan di bingkai tempat acara: putar posisi dunia ke lokal, pakai `move`/`constrain` bawaan, putar balik hasilnya.
2. Fungsi pemasangan di `hotel-math` (`hotel-journey-math.js`): tambah `<tempat>Anchor(gate, j, ...)` seperti `villaAnchor`, dengan tes di `hotel-journey-math.test.js`.
3. `hotel-journey.js`: pasang di `stepRideFrame` untuk `gate.id` tempat itu (seperti `gate.id === 'villa'`); `dropArrivalPlaceholder` juga berlaku untuk tempat itu.
4. `hotel-main.js`: sambungkan adapter (aktif/walk/place/occluders/update) dan buat `enterUrl(gate)` mengembalikan `null` untuk tempat itu.
5. Satukan ruang multiplayer: ROOMS di `token-issuer.js` dan `invitation/src/engine/world-link.js` (satu entri per tempat acara) supaya tamu tidak terpisah dari dunia hotel.
6. Hapus tombol "Masuk" untuk tempat itu; halaman lama (`masjid.html`, dst.) boleh tetap ada sebagai cadangan sampai semua selesai.
7. Tes baru untuk adapter dan penyambung; `npm test --prefix game` hijau; cek di peramban (siang, malam, HP).

## Yang perlu dicek lebih dulu

- Cabang `fitur/satu-dunia-hotel-perjalanan` (PR #105, #110) masih punya commit sisa (lihat `docs/STATUS-CABANG.md`): cek dulu supaya tidak dobel.
- PR terbuka #163, #164, #167 (dua di antaranya CI merah) agar `main` bersih sebelum mulai.
- Kinerja di HP: tiga tempat acara besar dalam satu scene, muat hanya saat pemain dekat (pola `PRELOAD`/`KEEP` di `hotel-journey.js`) dan bongkar saat jauh.

## Batasan yang diketahui

- Belum dilihat di peramban; hanya matematika dan build yang bisa diuji otomatis.
- Fitur lengkap tiap tempat acara (lift, ruang game, TV kamar, dll. untuk villa; ibadah dan museum untuk masjid) tidak ikut pada tahap pertama; tombol "buka versi lengkap" tetap ada seperti villa.
