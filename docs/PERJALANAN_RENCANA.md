# Perjalanan menuju tempat acara

Permintaan pemilik (22 Okt 2026): jalan raya yang menyambung hotel ke tempat acara terlihat seperti editan tempelan
(lingkungan berubah mendadak, gerbang tidak menyatu, dunia kosong). Ganti dengan **perjalanan virtual minimal 20 menit**
dengan banyak pengkolan dan pemandangan berganti, supaya pengunjung merasa benar-benar menempuh perjalanan menuju acara.
Rute **berbeda untuk tiap tempat acara** (villa, aula, royal, masjid).

## Lima bagian

| # | Menit | Bagian | Isi |
|---|-------|--------|-----|
| 1 | 00-04 | Jalan utama menuju kawasan NIKORA | jalan lebar, gerbang utama yang menyatu dengan fondasi, lampu jalan; tempat acara belum terlihat |
| 2 | 04-08 | Jalan berkelok melewati kawasan hijau | tikungan kiri-kanan, jarak pandang bervariasi, jalan naik-turun, jembatan kecil |
| 3 | 08-13 | Kawasan bukit dan persimpangan | tikungan tajam yang aman, persimpangan, jembatan sungai, papan petunjuk arah |
| 4 | 13-17 | Memasuki kawasan premium | danau, taman, villa mewah, bangunan pendukung; tempat acara belum terlihat penuh |
| 5 | 17-20+ | Kedatangan | tikungan terakhir, lurus ke area penurunan tamu, tempat acara terlihat |

Aturan jaringan yang tetap berlaku: antar-tempat acara tidak saling tersambung (semua lewat hotel); cabang di persimpangan
adalah jalan khusus yang tertutup.

## Yang sudah ada (cabang `fitur/perjalanan-menuju-acara`)

- `game/src/journey.js` (murni data, tanpa THREE): rute dibangun dengan mengintegrasikan kelengkungan (radius terkecil 28 m,
  kemiringan <= 10%), dijaga tidak menabrak dirinya sendiri; jembatan dan persimpangan di jendela lurus-datar; danau dengan
  jalan datar; satu fungsi `terrainHeight` untuk gambar dan tabrakan (tanah dipaksa rata dengan badan jalan, lalu naik-turun
  mulus: tebing potongan dan tanggul). Benih per tempat acara di `JOURNEYS`; `attempt` hasil `searchAttempt()` (dijaga tes).
- `game/src/journey-world.js` (THREE): medan per potongan, pohon, jalan dengan marka, pagar pengaman, rambu chevron, lampu,
  jembatan dan air, danau, rambu persimpangan, **gerbang utama sebagai kompleks** (fondasi, sayap tebal, tiang, kanopi, pos jaga,
  palang, air mancur, paving) dan area kedatangan.
- `game/src/journey-drive.js`: mobil otomatis (melambat di tikungan, berhenti di area penurunan tamu). 20,6 menit per rute.
- `game/journey.html` + `journey-main.js`: halaman demo. `?venue=villa|hall|royal|masjid&waktu=siang|senja|malam&mobil=royale|noir|argent|rubis`;
  `&kecepatan=10` hanya untuk menguji; `&q=ringan` mematikan bayangan.

## Belum ada / batasan (jujur)

- **Belum dilihat di peramban**: tampilan 3D (warna, skala, kinerja di HP) belum diperiksa mata. Diuji: matematika rute (tes) dan build.
- Bangunan di area kedatangan adalah bentuk **sementara**; tempat acara yang sebenarnya dibuka lewat tombol "Masuk" ke halaman
  tempat acara (pindah halaman). Dunia tempat acara belum menyatu dalam satu koordinat dengan rute.
- Persimpangan baru berupa papan petunjuk; cabang jalan (jalan khusus tertutup) belum digambar. Rambu belum memakai ikon per tempat acara.
- Belum: mobil dikendarai pemain (hanya autopilot), suara (angin, burung, ban), siang-malam otomatis (`day-night.js`), tampilan
  khas tiap tempat acara (`JOURNEYS.*.theme` baru benih), vegetasi bervariasi (semak, bunga), NPC, multiplayer di rute.
- Gerbang jalan raya hotel (`highway.js`, `gateUrl`) sekarang membuka perjalanan (`journey.html?venue=...`); `?langsung=1` melompatinya ke halaman tempat acara. Jalan raya lama 4 lengan di hotel masih ada sebagai penghubung ke gerbang; penggantiannya (jalan hotel -> gerbang utama NIKORA) belum.
- Server villa dan `SNAP_DISTANCE` belum mengenal geometri ini.

## Tes

`node --test src/journey.test.js src/journey-drive.test.js` (durasi >= 20 menit, radius/kemiringan, rute tidak menabrak diri,
kontinuitas, peristiwa, medan menyatu dengan jalan, benih tertanam). Jika generator diubah, jalankan `searchAttempt(venue)` dan
perbarui `attempt` di `JOURNEYS`.

Tidak ada kode pihak ketiga yang disalin; ide teknik (tinggi medan sebagai fungsi murni untuk tampilan dan tabrakan) dari diskusi
komunitas Three.js dan repo "mars" (MIT) hanya dijadikan acuan konsep.
