# Karyawan tempat acara

Modul: `game/src/venue-staff.js` (tes: `venue-staff.test.js`), tampilan: `game/src/venue-staff-view.js`. Pola sama dengan karyawan hotel (`hotel-staff.js`, docs `HOTEL_KARYAWAN.md`), hotel tidak diubah.

## Jumlah dan peran

| Tempat | Jumlah | Peran |
|---|---|---|
| Villa | 120 | resepsionis 6, bellboy 8, cleaning service 24, dapur 12, pelayan 16, satpam 14, tukang kebun 12, penjaga kolam 4, terapis spa 6, petugas parkir 8, teknisi 10 |
| Royal | 100 | penyambut 8, pengatur kursi 12, pelayan VIP 16, katering 8, satpam 14, tukang kebun 14, kru panggung 6, kebersihan 12, host lounge 6, petugas dermaga 4 |
| Aula Resepsi | 50 | penyambut 6, pelayan 14, satpam 8, tukang kebun 8, kebersihan 6, teknisi 4, perawat kolam 4 |
| Masjid Agung | 200 | kebersihan 50, satpam 30, tukang kebun 24, petugas wudhu 12, pustakawan 6, pemandu 12, pengajar tahfidz 8, kru walimah 16, petugas parkir 14, penjaga sandal 12, teknisi 16 |

Total 470. Jumlah dan peran ada di `VENUE_DEFS`; mengubahnya cukup di sana (tes membaca jumlah dari tabel peran, jadi angka `EXPECTED` di tes ikut disesuaikan).

## Shift dan pulang ke hotel

- Tiga shift seperti hotel: pagi 06-14, siang 14-22, malam 22-06. Peran kebersihan hanya pagi dan siang.
- Di luar shift karyawan ada di hotel (`STAFF_HOME`). `presence(staff, jam)` = `working` | `arriving` | `leaving` | `hotel`. Berangkat 30 menit sebelum shift, pulang 30 menit sesudahnya (`COMMUTE_H`).
- Tiap karyawan punya `transport`: `motor` (sebagian besar) atau `bus` (30% villa, royal, masjid; 20% aula): yang tidak punya kendaraan naik bus jemputan.
- `commuteSummary(tempat, jam)` memberi jumlah yang sedang berangkat/pulang per jenis kendaraan: dasar jadwal bus hotel <-> tempat acara.

## Cara kerja

Simulasi jadwal, bukan ratusan avatar sekaligus: posisi karyawan adalah fungsi jam (`venueHourNow`: jam asli di zona waktu acara, `?tz=`, sama dengan langit siang-malam), jadi semua pemain melihat hal yang sama. `staffState`, `staffOnLevel(tempat, lantai, jam)`, `dutySummary`. Yang digambar dibatasi `pickNearby` (radius 40 m, paling banyak 14). Rute masih garis lurus antar titik (belum navmesh), sama seperti hotel. Cleaning service villa naik turun lewat menara tangga sayap tamu.

## Sudah terpasang di dunia

`createVenueStaffView` dipasang di `villa-main.js`, `masjid-main.js`, dan `royal-main.js` (di Royal hanya saat pemain di zona utama, bukan di pulau melayang). Tes `venue-staff-wiring.test.js` menjaga agar pemasangannya tidak terlepas. Untuk debug: `window.__villa.staff()`, `window.__masjid.staff()`, `window.__royal.staff()`.

## Belum ada (tahap berikutnya)

- Pemasangan di Aula Resepsi (`main.js`).
- Parkir tamu dan parkir karyawan; sepeda motor karyawan.
- Mobil dinas villa (6 sedan di depan gerbang) dan bus antar-jemput hotel <-> tempat acara.
