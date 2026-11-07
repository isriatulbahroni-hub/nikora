# Karyawan pulang-pergi ganti shift (hotel)

Hotel belum punya tamu sungguhan, jadi yang ramai di jalan dan di depan menara adalah karyawan sendiri: tiap orang datang sebelum shift mulai
dan pulang sesudah shift selesai, lalu berjalan kaki ke pintu karyawan (atau dari pintu ke kendaraannya).

## Siapa datang dengan apa

- Motor 55%, mobil 15%, sisanya bus antar-jemput (bila jatah slot parkir shift itu penuh, sisanya naik bus).
- Parkir memakai slot yang sudah ada (`hotel-parking.js`): slot motor berkanopi yang KOSONG pada keterisian statis `hotel-parking-world.js`,
  dua modul motor tambahan di lahan cadangan timurnya, dan slot mobil di lahan karyawan. Satu slot satu orang; jatah slot dibagi per shift
  (slot ke-k dipakai shift k mod 3), jadi dua shift yang bersilangan di pergantian tidak pernah berebut slot.
- Bus antar-jemput berhenti 40 detik di halte bahu jalan sisi utara Lingkar NIKORA, empat rit per pergantian shift (datang 40, 31, 22, 13 menit
  sebelum shift; pulang 8, 17, 26, 35 menit sesudahnya).
- Kendaraan karyawan memakai lajur dalam sisi utara Lingkar (`COMMUTE_LANE` di `hotel-life-data.js`); lalu lintas biasa tidak memakai lajur itu.

## Jam

Shift 06.00, 14.00, 22.00 (`SHIFTS` di `hotel-staff.js`), jam asli di zona waktu acara (sama dengan petugas dan langit). Rata-rata orang datang
6 sampai 36 menit sebelum shift dan pulang 4 sampai 34 menit sesudahnya, jadi jalan ramai sekitar 80 menit di setiap pergantian dan tenang di
tengah shift (parkir tetap terisi sesuai yang sedang bekerja).

Untuk menguji kapan saja: `?jam=5.6` (datang shift pagi), `?jam=13.6`, `?jam=21.6`, dan `?jam=14.1` (pulang). Untuk karyawan pulang-pergi,
`?jam=` hanya menetapkan jam awal dan jam terus berjalan, jadi pergantian shift terlihat bergerak. `?komuter=0` mematikannya.

## Berkas

- `hotel-commute-data.js`: model murni (slot, rute berwaktu, rencana tiap orang, cuplikan pada jam tertentu), diuji `hotel-commute-data.test.js`.
- `hotel-commute.js`: gambar 3D (kendaraan berjalan, kendaraan parkir per slot, pejalan kaki dari kolam avatar, jalan masuk, halte).
- `hotel-vehicle-parts.js`: bentuk kendaraan bersama (juga dipakai `hotel-life.js` dan lalu lintas jalan tempat acara).
- `hotel-staff.js`: jumlah karyawan dinaikkan supaya lobi, restoran, dan halaman tidak sepi (414 menjadi 630; housekeeping tetap 240).

Hanya pemandangan: tidak ada tabrakan dan tidak ada efek ke fisika mobil pemain.
