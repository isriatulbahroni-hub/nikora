# Karyawan NIKORA Grand Hotel

Rencana dan status fitur karyawan hotel (ratusan petugas: cleaning service, resepsionis, bellboy, satpam, pelayan, valet, tukang kebun, penjaga kolam).

## Prinsip

- Ratusan petugas **tidak** digambar sekaligus. Mereka disimulasikan sebagai jadwal (angka). Posisi dan avatar hanya dibuat untuk petugas di lantai yang dekat pemain (`staffOnLevel`).
- Posisi petugas adalah fungsi dari jam permainan, jadi deterministik dan sama di semua klien (tidak perlu sinkron per frame lewat jaringan).
- Lantai hotel dibuat malas, jadi petugas di lantai jauh cukup dihitung jumlahnya (`dutySummary`).

## Sudah ada (PR ini)

- `game/src/hotel-staff.js`: roster 390 petugas dalam 8 peran, tiga shift (pagi 06-14, siang 14-22, malam 22-06), pembagian lantai tamu ke 240 cleaning service (4 atau 5 lantai per orang), rute membersihkan kamar (pintu, tempat tidur, pintu), pos tetap untuk peran lain.
- `game/src/hotel-staff.test.js`: roster, pembagian lantai, shift, rute cleaning service (di dalam kamar saat membersihkan, tidak melompat), determinisme.

## Belum ada

- Avatar petugas di dunia hotel (memakai `avatar-human.js`; LOD: avatar penuh dekat pemain, figur sederhana ber-instancing untuk yang jauh).
- Jalur lorong yang benar. Rute sekarang garis lurus antar titik pintu dan bisa menembus dinding inti atau kamar sudut. Tahap berikutnya: navmesh (kandidat `recast-navigation-js` atau `three-pathfinding-3d`) dan perilaku (kandidat `yuka`).
- Tugas lain: bellboy mengantar tamu, valet memarkir mobil, pelayan melayani meja, petugas naik lift antar lantai.
- Panel admin untuk jumlah dan jadwal petugas, dan menyambungkan jam permainan (`day-night.js`) ke parameter `hour`.
- Percakapan dengan resepsionis (opsional, memakai NPC berotak AI).
- Penambahan dependensi pihak ketiga harus dicatat di `THIRD_PARTY_NOTICES.md` dan dicek lisensinya.
