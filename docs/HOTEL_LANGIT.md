# NIKORA Grand Hotel: langit dan cahaya otomatis

Catatan rancangan untuk `game/src/hotel-sky.js` (render) dan `game/src/hotel-sky-data.js` (data dan hitungan murni, diuji di `hotel-sky-data.test.js`). Disusun mengikuti format `/design-system` (token), `/design-handoff` (spesifikasi), dan `/design-critique` (penilaian jujur).

## Kontrol

| Cara | Efek |
|---|---|
| (tanpa parameter) | `auto`: mengikuti jam asli di zona waktu acara (bawaan WIB) |
| `?sky=day\|sunset\|night\|cycle` | mengunci siang, senja, malam, atau satu hari penuh dalam 20 menit (demo) |
| `?tz=WIB\|WITA\|WIT` atau selisih jam dari UTC | zona waktu, sama dengan villa, masjid, aula, dan jam kerja petugas hotel |
| tombol **N** | berganti mode: auto, siang, senja, malam, demo; muncul toast |
| `?q=low` | derau awan 3 oktaf (bukan 5), Bima Sakti 2 oktaf (bukan 3) |

Peralihan antar fase selalu halus (`createPhaseTracker`, 0,25 fase per detik); mengganti mode tidak melompat.

## Token (sRGB 0..1)

`fog` sekaligus warna horizon kubah, supaya tanah yang memudar di kejauhan menyatu dengan langit.

| Token | Siang | Senja | Malam |
|---|---|---|---|
| `fog` / horizon | .78 .88 .96 | .93 .62 .45 | .035 .055 .13 |
| `mid` | .30 .58 .92 | .72 .40 .46 | .018 .036 .115 |
| `zenith` | .10 .33 .74 | .13 .19 .46 | .004 .010 .050 |
| `sunColor` | 1 .925 .796 | 1 .62 .32 | .5 .62 1 (cahaya bulan) |
| `sunI` / `hemiI` | 1,3 / 1,0 | 1,0 / 0,9 | 0,45 / 0,55 |
| `exposure` (x 0,9) | 1,0 | 1,0 | 1,15 |
| `fogNear` / `fogFar` (m) | 420 / 3400 | 300 / 3000 | 240 / 2800 |
| `cloudCover` | 0,50 | 0,62 | 0,46 |

Siang memakai intensitas hotel yang lama (hemi 1,0 dan matahari 1,3), jadi tampilan siang tidak berubah selain kabut yang lebih luas.

| Fungsi | Mulai | Penuh | Dipakai untuk |
|---|---|---|---|
| `lampLevel(phase)` | -0,25 | 0,5 | lampu jalan raya, halaman, sabuk emas, gerbang, kanopi, air mancur, helipad |
| `windowLevel(phase)` | 0,05 | 0,8 | jendela kamar menara (menyala satu per satu menurut `seed`) |
| `nightLevel(phase)` | 0,3 | 0,9 | bintang, bulan, Bima Sakti, bintang jatuh |
| `sunsetLevel(phase)` | puncak di 0 | | pita senja dan pendar matahari |
| `beaconLevel(phase)` | 0,4 (siang) | 1 | lampu peringatan penerbangan |

## Komponen

| Komponen | Isi | Siang | Senja | Malam |
|---|---|---|---|---|
| Kubah langit | gradasi 3 warna, cakram matahari, pita senja, Bima Sakti, dither | biru, cakram putih kekuningan | pita jingga condong ke matahari terbenam | gelap pekat dengan pita Bima Sakti |
| Awan | satu lapis pada 2.300 m, derau fbm, sisi terang menghadap matahari | putih | jingga | biru kelam diterangi bulan |
| Bintang dan bulan | `night-sky.js` (sama dengan villa dan masjid), radius 3 km | padam | padam | 1.400 bintang berkelip, bulan 2 derajat; bintang jatuh tiap 14-44 detik |
| Jendela menara | 75.992 titik (76 per lantai x 1000), mengikuti tapak yang meruncing | padam | mulai menyala | lantai publik menyala semua; lantai tamu acak (sampai 85%), 8% berkelip biru seperti televisi |
| Sabuk Sky Lobby | untaian lampu emas tiap 3 m, 19 lantai | padam | menyala | menyala, berkelip halus |
| Lampu jalan raya | halo + kolam cahaya di tanah, dibaca dari `nikora-highway` | bohlam 30% | menyala | menyala |
| Tugu emas lingkar | halo besar di kepala tugu | | | menyala |
| Gerbang tempat acara | untaian lampu di bawah balok lengkung | | | menyala |
| Halaman hotel | 10 tiang lampu baru (drop-off dan parkir), air mancur, 10 lampu kanopi | | | menyala |
| Atap | 4 tiang sudut + ujung antena (suar merah berdenyut), 24 lampu helipad | suar pelan | suar | suar penuh |

Semua lapisan titik cahaya: `THREE.Points` aditif, tanpa kabut, satu draw call per lapisan (11 lapisan), dibuang di vertex shader saat padam. Ukuran dalam meter dunia, dijepit ke piksel: jauh = titik kecil redup, dekat = membesar lalu memudar (jendela mulai memudar di bawah 90 m, karena geometri aslinya sudah ada).

## Gerak

| Elemen | Pemicu | Gerak | Durasi |
|---|---|---|---|
| Fase langit | jam atau mode | peralihan halus | 0,25 fase/detik (sekitar 8 detik siang ke malam) |
| Awan | terus-menerus | hanyut | sekitar 1 km per 4 menit |
| Bintang | malam | berkelip | 3-5 detik |
| Suar atap | terus-menerus | denyut | 2,6 detik |
| Sabuk, televisi kamar | malam | berkelip | 2-3 detik |
| Bintang jatuh | malam (fase > 0,6 tingkat malam) | garis cepat | 1,1 detik, tiap 14-44 detik |

## Kasus tepi

- **Gerak dikurangi** (`prefers-reduced-motion`): tanpa awan hanyut, kelip bintang, denyut suar, kelip televisi, dan bintang jatuh; semua tetap tampil statis.
- **Ketinggian**: horizon turun sampai sekitar 2 derajat di puncak menara (`horizonDip`), puncak langit makin pekat (`uAlt`), awan terhampar di bawah kaki saat di lantai atas, dan tidak berkedip saat kamera tepat di lapisan awan.
- **Jarak pandang**: kamera `far` dinaikkan dari 1.800 ke 6.500 m dan kabut dilebarkan, supaya menara 4,2 km terlihat dari jalan raya. Ketepatan kedalaman ditentukan jarak dekat (`near` 0,2), bukan jauh, jadi z-fighting tidak bertambah.
- **Di dalam ruangan**: intensitas langit dan matahari tetap diredam seperti semula lewat `applyLights(indoorK)`; lampu langit-langit hotel-world tidak diubah.
- **Tanpa jalan raya di scene**: lampu jalan dan tugu dilewati; sisanya tetap jalan.
- **Antena dan helipad dicari di scene**; bila tidak ada, dipakai koordinat bawaan.

## Penilaian

**Yang berhasil.** Satu aturan dipakai ke semua tempat: `phase` -1..1 dari `day-night.js`, sama dengan villa, masjid, dan aula, jadi hotel berganti siang-senja-malam serempak dengan tempat acara. Semua lampu menyala dari satu fungsi tingkat per kelompok, bukan lampu per lampu. Lampu di kejauhan tetap terlihat karena tidak terkena kabut dan dijepit ke ukuran piksel minimal.

**Belum diverifikasi.** Kode ini ditulis tanpa bisa membuka halaman di peramban, jadi belum pernah dilihat. Tes otomatis hanya mencakup data dan hitungan murni (`hotel-sky-data.test.js`); shader dan scene belum diuji. Hal yang paling perlu dilihat langsung: warna senja, kepadatan awan (3 vs 5 oktaf), terang jendela dari 500 m, dan apakah kolam cahaya tampak terlalu terang di aspal.

**Risiko.** (1) Biaya: shader awan 5 oktaf dua kali per piksel sepanjang langit atas; `?q=low` menurunkannya. (2) 76.000 titik jendela mengikuti tapak lantai, sementara cangkang kaca di `hotel-world.js` masih kotak lurus tanpa meruncing (commit `79c25a7` di branch `fitur/hotel-menara-kristal` memperbaikinya dan belum digabung), jadi di lantai atas jendela tampak melayang di dalam kotak kaca sampai cangkang itu masuk.

**Temuan di luar cakupan** (tidak diubah di sini). Helipad (`z = 448`) dan antena (`z = 430`) di `hotel-world.js` masih memakai koordinat menara lama; pusat menara sekarang `z = 507`, jadi keduanya berada di luar atap. Lampu suar dan helipad modul ini mengikuti letak aslinya, sehingga ikut pindah begitu `hotel-world.js` diperbaiki. Bagian roadmap di `HOTEL_RENCANA.md` yang menyebut jalan raya belum terpasang juga sudah usang.

**Prioritas berikutnya.** 1) Lihat hasilnya di peramban pada `?sky=sunset` dan `?sky=night`, lalu setel kecerahan. 2) Gabungkan commit cangkang kristal. 3) Pindahkan helipad dan antena ke `TOWER_CENTER`. 4) Lampu parkir bergaya arsitektur bila parkir didesain ulang (tiang di modul ini sementara).
