# Karyawan NIKORA Grand Hotel

Rencana dan status fitur karyawan hotel (ratusan petugas: cleaning service, resepsionis, bellboy, satpam, pelayan, valet, petugas parkir, tukang kebun, penjaga kolam).

## Prinsip

- Ratusan petugas **tidak** digambar sekaligus. Mereka disimulasikan sebagai jadwal (angka). Avatar hanya dibuat untuk petugas di lantai pemain, dalam radius 40 m, paling dekat dahulu, paling banyak 14 (`pickNearby`). Avatar dipakai ulang dari kolam.
- Posisi petugas adalah fungsi dari jam permainan, jadi deterministik dan sama di semua klien (tidak perlu sinkron per frame lewat jaringan).
- Lantai hotel dibuat malas, jadi petugas di lantai jauh cukup dihitung jumlahnya (`dutySummary`).
- Jam permainan = jam asli di zona waktu acara (`hoursAt` dari `day-night.js`; `?tz=` mengganti zona, bawaan WIB). `?jam=10` pada alamat `hotel.html` mengunci jam (untuk pengujian).

## Sudah ada (PR ini)

- `game/src/hotel-staff.js` (murni, diuji): roster 414 petugas dalam 9 peran, tiga shift (pagi 06-14, siang 14-22, malam 22-06), pembagian lantai tamu ke 240 cleaning service (4 atau 5 lantai per orang), rute membersihkan kamar (pintu, tempat tidur, pintu), pos tetap untuk peran lain, seragam per peran (`staffConfig`), pose per tugas (`staffActFor`).
- Petugas parkir (24 orang): berpatroli di samping slot parkir tamu (`HOTEL_CAR_SPOTS`, dua baris), berhenti 6 detik di tiap slot untuk mengarahkan mobil (`task: 'directing'`, avatar melambai).
- `game/src/hotel-staff-view.js` (THREE): menggambar petugas dekat pemain memakai avatar sederhana (`avatar.js`). Cleaning service membungkuk saat membersihkan kamar.
- `game/src/hotel-main.js`: 11 baris tambahan untuk memasang tampilan petugas dan jam kerja.
- `game/src/hotel-staff.test.js`: 12 uji (roster, pembagian lantai, shift, rute cleaning service, patroli parkir, seragam, pemilihan petugas, determinisme).

## Belum ada

- Hasil di layar belum dilihat: uji unit hanya mencakup logika. Perlu dicoba di browser (`hotel.html?jam=10`, `window.__hotel.staff()` menampilkan petugas yang digambar).
- Performa di HP: satu avatar sederhana sekitar 30 mesh, jadi batas 14 avatar dipilih hati-hati. Untuk lebih banyak orang perlu LOD: figur sederhana ber-instancing untuk yang jauh.
- Jalur lorong yang benar. Rute sekarang garis lurus antar titik pintu dan bisa menembus dinding inti atau kamar sudut. Tahap berikutnya: navmesh (kandidat `recast-navigation-js` atau `three-pathfinding-3d`) dan perilaku (kandidat `yuka`); keduanya perlu `npm install` dan pembaruan `package-lock.json`.
- Tugas lain: bellboy mengantar tamu, valet memarkir mobil tamu (mobil asli di `HOTEL_CAR_SPOTS`), pelayan melayani meja, petugas naik lift antar lantai.
- Petugas parkir belum bereaksi pada mobil pemain yang masuk area parkir.
- Titik petugas di peta mini dan panel admin untuk jumlah dan jadwal petugas (`dutySummary` sudah siap dipakai).
- Percakapan dengan resepsionis (opsional, memakai NPC berotak AI).
- Penambahan dependensi pihak ketiga harus dicatat di `THIRD_PARTY_NOTICES.md` dan dicek lisensinya.
