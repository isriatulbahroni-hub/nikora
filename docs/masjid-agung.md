# Masjid Agung NIKORA (`/masjid.html`)

Dunia 3D yang dijelajahi dengan avatar yang sama seperti aula dan vila. Rancangan orisinal (bukan replika bangunan nyata) dengan skala sekelas masjid-masjid terbesar di dunia. Mode saat ini: **offline, satu pemain**.

## Skala dan ruang

| Bagian | Ukuran |
| --- | --- |
| Kompleks (pagar keliling, 3 gerbang) | 600 x 500 m = 300.000 m² |
| Aula Shalat Utama (ratusan tiang, kubah utama, mihrab, mimbar) | 360 x 200 m = 72.000 m² |
| Sahn (halaman utama, pancuran wudhu tengah) + serambi/riwaq tiga sisi | 300 x 170 m |
| Menara | 4 buah, tinggi 150 m |
| Ruang lain | Muslimah, Tahfidz, Perpustakaan, Museum, Wudhu Putra dan Putri, Ruang Akad Nikah, Gedung Walimah |

Kiblat = utara (-z). Titik awal di luar Gerbang Utama; berjalan lurus ke utara melewati halaman, sahn, lalu pintu utama aula.

## Kontrol

WASD/panah atau joystick (HP), Shift atau R untuk lari, seret untuk memutar kamera, scroll atau cubit untuk zoom, C ganti sudut kamera, M peta, J (atau tombol 📍) daftar tujuan untuk melompat ke tiap ruang.

## Rancangan teknis

- `src/masjid-layout.js`: data murni (ruangan, pintu, properti, tujuan) + tabrakan + penghalang kamera. Tabrakan memakai `resolveMove`/`isWalkable` dari `villa-layout.js`, dengan grid spasial 40 m agar pencarian tabrakan dan kamera cepat meski ada ±1.000 collider.
- `src/masjid-world.js`: renderer. Semua benda berulang memakai `InstancedMesh` (kotak, silinder, kerucut, bola, setengah bola) dengan warna per benda, jadi seluruh kompleks hanya belasan draw call. Tanpa bayangan dinamis (bayangan bulat kecil di bawah avatar).
- `src/masjid-main.js`: input, kamera orbit (memakai `villa-camera.js`), peta mini, daftar tujuan, kualitas adaptif.
- `src/masjid-layout.test.js`: uji pintu valid, semua tujuan terjangkau dari titik awal (penelusuran 2 m), tabrakan dinding/pagar/gerbang, rute gerbang ke bawah kubah.

## Trade-off

- Satu lantai, tanpa tangga: seluruh ruang bisa dijangkau tanpa logika bertingkat, tetapi tidak ada mezanin atau atap yang bisa dikunjungi.
- Kompleks dibuat dari kotak dan silinder berwarna (tanpa model 3D/tekstur rumit): ringan di HP, tetapi detail arsitektur (lengkung, kaligrafi) masih sederhana.
- Tanpa server: tidak ada tamu lain, suara, atau MC di sini. Dunia ini belum didaftarkan di `server/`.

## Yang perlu ditinjau saat berkembang

- Tampilan belum diverifikasi di browser sungguhan (kode dunia dan input ditulis tanpa dijalankan; hanya denah dan tabrakan yang diuji otomatis). Cek kecepatan gambar di HP dan tampilkan `window.__masjid.renderStats()`.
- Multiplayer: daftarkan dunia `masjid` di server (validasi gerak memakai `masjid-layout.js`) dan LiveKit.
- Lengkung dan jendela pada fasad, lantai/atap yang bisa dikunjungi, jam shalat dan suasana cahaya.
