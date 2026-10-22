# Karyawan NIKORA Grand Hotel

Rencana dan status fitur karyawan hotel (414 petugas: cleaning service, resepsionis, bellboy, satpam, pelayan, valet, petugas parkir, tukang kebun, penjaga kolam).

## Prinsip

- Ratusan petugas **tidak** digambar sekaligus. Mereka disimulasikan sebagai jadwal (angka). Avatar hanya dibuat untuk petugas di lantai pemain, dalam radius 40 m, paling dekat dahulu, paling banyak 14 (`pickNearby`). Avatar dipakai ulang dari kolam.
- Posisi petugas adalah fungsi dari jam permainan, jadi deterministik dan sama di semua klien (tidak perlu sinkron per frame lewat jaringan).
- Lantai hotel dibuat malas, jadi petugas di lantai jauh cukup dihitung jumlahnya (`dutySummary`, `workSummary`).
- Jam permainan = jam asli di zona waktu acara (`hoursAt` dari `day-night.js`; `?tz=` mengganti zona, bawaan WIB). `?jam=10` pada alamat `hotel.html` mengunci jam (untuk pengujian).
- Setiap petugas punya pekerjaan berulang yang disusun dari urutan "leg" (`jobBuilder` di `hotel-staff.js`): jalan lurus ke satu titik, lalu diam mengerjakan sesuatu. Shift dimulai dari awal putaran kerja.

## Pekerjaan tiap peran (semua diuji)

| Peran | Jumlah | Pekerjaan | Tugas (pose) |
| --- | --- | --- | --- |
| Cleaning service | 240 | membersihkan semua kamar di 4 atau 5 lantai tamu yang dipegangnya, kamar demi kamar | `cleaning` (membungkuk) |
| Resepsionis | 12 | menyambut tamu di meja lobi, lalu menunggu | `greeting` (melambai) |
| Bellboy | 24 | ambil bagasi di lobi, naik lift ke lantai tamu, antar ke kamar, turun lagi (4 pengantaran per putaran) | `serving`, `riding` |
| Satpam | 30 | berkeliling empat titik jaga di lobi atau halaman depan | `watching` |
| Pelayan | 40 | ambil pesanan di konter ruang makan, antar ke meja bergantian | `serving` (membungkuk) |
| Valet | 16 | menyambut tamu di drop-off, memeriksa mobil di slot parkir (mobil asli tidak dipindahkan) | `greeting`, `working` |
| Petugas parkir | 24 | berpatroli di samping dua baris slot parkir, berhenti mengarahkan mobil | `directing` (melambai) |
| Tukang kebun | 20 | merawat lima titik di petaknya sendiri (16 x 16 m) di halaman barat menara | `working` |
| Penjaga kolam | 8 | berkeliling tepi ruang kolam di lantai 3 sambil mengawasi | `watching` |

## Sudah ada

- `game/src/hotel-staff.js` (murni, diuji): roster, shift, mesin pekerjaan, pekerjaan semua peran, seragam (`staffConfig`), pose (`staffActFor`), `staffOnLevel`, `dutySummary`, `workSummary` (jumlah petugas per tugas pada satu jam, untuk panel admin).
- `game/src/hotel-staff-view.js` (THREE): menggambar petugas dekat pemain memakai avatar sederhana (`avatar.js`); petugas yang pindah lantai lewat lift muncul di lantai tujuan.
- `game/src/hotel-main.js`: memasang tampilan petugas dan jam kerja.
- `game/src/hotel-staff.test.js`: uji roster, pembagian lantai, shift, tiap petugas bekerja selama shift, tiap peran bekerja di tempatnya tanpa melompat, bellboy naik lift dan mengantar ke kamar, seragam, pemilihan petugas, determinisme.

## Belum ada

- Hasil di layar belum dilihat: uji unit hanya mencakup logika. Perlu dicoba di browser (`hotel.html?jam=10`, `window.__hotel.staff()` menampilkan petugas yang digambar).
- Performa di HP: satu avatar sederhana sekitar 30 mesh, jadi batas 14 avatar dipilih hati-hati. Untuk lebih banyak orang perlu LOD: figur sederhana ber-instancing untuk yang jauh.
- Jalur lorong yang benar. Rute sekarang garis lurus antar titik pintu dan bisa menembus dinding inti, kamar sudut, atau air mancur dan tiang kanopi di halaman depan. Tahap berikutnya: navmesh (kandidat `recast-navigation-js` atau `three-pathfinding-3d`) dan perilaku (kandidat `yuka`); keduanya perlu `npm install` dan pembaruan `package-lock.json`.
- Penjaga kolam berjalan di tepi ruang kolam, tetapi bentuk kolam sebenarnya belum dibaca; bisa jadi melewati air.
- Valet belum memindahkan mobil tamu dan petugas parkir belum bereaksi pada mobil pemain.
- Lift: bellboy berdiri di kabin selama 8 detik lalu muncul di lantai tujuan; belum disinkronkan dengan lift sungguhan dan pintu lift.
- Titik petugas di peta mini dan panel admin untuk jumlah, jadwal, dan tugas petugas (`dutySummary` dan `workSummary` sudah siap dipakai).
- Percakapan dengan resepsionis (opsional, memakai NPC berotak AI).
- Penambahan dependensi pihak ketiga harus dicatat di `THIRD_PARTY_NOTICES.md` dan dicek lisensinya.
