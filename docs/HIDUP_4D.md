# Hotel dan jalan terasa hidup + mobil 4D

Efek tambahan di atas dunia 3D yang sudah ada. Semuanya murni tampilan/indra: tidak mengubah fisika, jaringan, atau penghalang.

## Yang sudah ada sebelumnya (tidak diulang)
Pesawat dan helikopter (`hotel-aircraft.js`), petugas hotel (`hotel-staff-view.js`), langit siang-malam dan lampu (`hotel-sky.js`, `day-night.js`),
hujan dan jalan basah (`rain-boot.js`, `drive-weather.js`), badan mobil miring dan lampu rem (`vehicle-view.js`), suara mesin (`car-audio.js`),
getaran tabrakan (`haptics.js`). `car-simulator/` di PR #71 punya getar kamera dan audio sendiri (proyek terpisah).

## Yang ditambahkan
| Efek | File | Dimatikan dengan |
| --- | --- | --- |
| Lalu lintas 24 mobil di Lingkar NIKORA (sisi kiri, lampu menyala saat gelap/hujan) | `hotel-life.js`, `hotel-life-data.js` | `?lalin=0` |
| Burung mengitari tapak di siang hari | `hotel-life.js` | `?burung=0` |
| Suara sekitar: angin, dengung jalan, kicau (siang), jangkrik (malam) | `hotel-ambience.js` | `?suara=0` |
| Getaran mesin + sentakan pindah gigi | `haptics.js` | `?getar=0` |
| Lampu depan otomatis saat gelap/hujan | `car-auto-lights.js` | tekan tombol lampu (manual sampai turun) |

`?q=low` mengurangi lalu lintas menjadi 8 mobil dan burung menjadi 8.

## Catatan
- Mobil lalu lintas tidak punya tabrakan: bila terlalu dekat pemain (< 34 m) ia mengecil halus lalu hilang.
- Lalu lintas dan burung disembunyikan selama perjalanan lorong (dunia lain).
- `hotel-main.js` membungkus efek hidup dengan `try/catch`: bila gagal dibuat atau galat saat berjalan, efek itu dimatikan sendiri dan hotel tetap jalan.
- Suara baru menyala setelah sentuhan/tombol pertama (aturan autoplay peramban).
