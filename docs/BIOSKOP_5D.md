# Bioskop 5D (hotel lantai 3)

Rencana pemilik (29 Oktober 2026): bioskop virtual yang terasa nyata. Penonton tahu mereka ada di bioskop, tetapi gabungan efek (suara, getaran, angin, kursi miring, kabut air, air naik) membuat adegan terasa jauh lebih hidup. Fokus virtual, bukan perangkat fisik.

## Lokasi

`Mini Cinema` (id `cinema`) di lantai 3 "Gaya Hidup & Keluarga", sayap barat (`hotel-layout.js`, `PUBLIC_PROGRAM[3].w`): sekitar 70 x 62 m, layar di dinding barat, menempel di inti lift. Langit-langit 3,9 m, jadi air maksimum `WATER_MAX` = 1,6 m. Ruang yang sama juga muncul sebagai "Sky · Mini Cinema" di Sky Lobby bergilir (lantai 100, 250, ...): denah kursinya ikut berubah, tetapi efek 5D (`cinema-5d-fx.js`) hanya dipasang di lantai 3.

## Cara kerja

| Berkas | Isi |
|---|---|
| `game/src/cinema-5d-data.js` | Data murni + matematika (diuji): adegan, saluran efek, jadwal tayang, mode kenyamanan, denah kursi. |
| `game/src/cinema-5d-fx.js` | Menerjemahkan nilai adegan menjadi pengalaman: kanvas miring dan berguncang, air naik, percikan, gelap, kilatan, kursi hantu, papan info, getaran HP. |
| `game/src/cinema-5d-sound.js` | Suara sintetis WebAudio: gemuruh, angin, bisikan dari belakang (HRTF), sentakan kilatan, teredam saat tenggelam. |
| `game/src/hotel-furnish.js` (`GEN.cinema`) | Memakai `cinemaSeatPlan`: layar 24 m, 4 blok kursi dengan lorong, 20 baris, foyer di belakang. |
| `game/src/hotel-main.js` | Memasang `createHotelCinema` (try/catch, mati sendiri bila galat) dan melangkahkannya tiap frame. |

**Adegan** = daftar cue per saluran: "pada detik t, saluran ch bergerak ke nilai `to` selama `dur` detik". Saluran: `rumble`, `wind`, `shake`, `tilt`, `mist`, `water`, `dim`, `flash`, `whisper`, `chair`. Cue boleh merambat dari layar ke belakang (`wave`, m/s): kursi depan merasakannya lebih dulu.

**Adegan yang ada:** Tsunami (52 dtk), Hantu (60), Gempa Bumi (40), Badai Petir (48).

**Jadwal serentak tanpa jaringan:** satu slot 90 detik berdasarkan jam epoch (`showAt`), adegan bergilir (tsunami, hantu, gempa, badai). Semua tamu yang jamnya benar melihat adegan dan detik yang sama. Di antara tayangan ada jeda minimal 30 detik dengan hitung mundur di papan info.

**Menambah adegan:** tambah objek adegan di `cinema-5d-data.js`, daftarkan di `SCENES` dan `SHOW_ORDER`. Tes otomatis memeriksa cue tidak tumpang tindih, nilai dalam rentang, gelombang selesai sebelum adegan berakhir, kilatan tidak lebih dari 3 kali per detik, dan semua saluran kembali nol di akhir.

## Kenyamanan dan keselamatan

- Kemiringan, guncangan, percikan, dan kilatan bisa dikurangi atau dimatikan: tombol di papan info (Penuh / Lembut / Tenang, disimpan di `localStorage`), atau `?nyaman=gentle|calm`. "Kurangi gerakan" dari sistem selalu memakai Tenang dan tombolnya dikunci.
- Mode Tenang tanpa kilatan sama sekali; di mode lain kilatan dibatasi maksimal 3 kali per detik (divalidasi di tes).
- `?getar=0` mematikan getaran HP, `?suara=0` suara, `?bioskop=0` seluruh bioskop 5D.
- Efek mati selama lorong perjalanan dan saat di dalam mobil.

## Status

Sudah dikerjakan dan diuji (tes logika dan tes dengan DOM palsu; seluruh tes game hijau, build lolos):

- [x] Mesin adegan, 4 adegan, jadwal tayang, mode kenyamanan.
- [x] Denah kursi baru (sekitar 960 kursi, sebelumnya sekitar 3.500 kursi datar) dengan foyer. Kursi tetap bisa diduduki lewat `hotel-seating.js`.
- [x] Pemutar adegan dan papan info; sinkron antar-tamu lewat jam epoch (bukan LiveKit).
- [x] Tampilan: air naik, percikan, gelap, kilatan, kamera miring dan guncang, kursi hantu.
- [x] Suara dan getaran HP.

**Belum diverifikasi manusia (hanya bisa dinilai di perangkat nyata):** tampilan 3D di HP/desktop, suara WebAudio, getaran, kenyamanan gerakan, performa HP lemah, dan tes e2e Playwright belum dijalankan. Perlu dicoba langsung sebelum dianggap selesai.

**Batasan yang disengaja:**

- Kursi tidak bertingkat (lantai datar); langit-langit 3,9 m membatasi tinggi air.
- Kemiringan dan guncangan dilakukan pada kanvas (CSS), bukan pada kamera 3D, supaya tidak menyentuh kode kamera hotel. Avatar dan dunia ikut miring bersama layar.
- Air hanya bidang tembus pandang yang naik; pemain tidak melambat atau mengapung, dan tidak ada barang terapung.
- "Kursi hantu" hanya satu kursi yang bergeser dan berputar; bisikan memakai posisi tetap di belakang pendengar. Kursi itu bukan perabot biasa, jadi tidak bisa diduduki.
- Belum ada pemutaran klip film: efek berjalan sebagai "adegan" tersendiri. Film komersial berhak cipta; gunakan klip buatan sendiri atau berlisensi, lalu tulis cue efeknya per film.
- Belum ada sinkron per-ruang lewat server: jam perangkat yang meleset membuat tayangan bergeser beberapa detik.

## Catatan sumber

Konsep jadwal efek berbasis waktu, pola gelombang, dan grid posisi terinspirasi README `NathanielCustom/Afferent-Cinema` (bioskop 4D fisik berbasis Raspberry Pi). Repo itu tanpa lisensi yang terlihat, jadi tidak ada kode yang disalin; semuanya ditulis ulang sendiri. Kilatan dan getaran memakai pola yang sama dengan `hotel-lagoon-4d.js` (percikan layar dan denyut getaran), dipakai ulang lewat impor, bukan disalin.
