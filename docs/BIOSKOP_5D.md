# Bioskop 5D (hotel lantai 3)

Rencana pemilik (29 Oktober 2026): bioskop virtual yang terasa nyata. Penonton tahu mereka ada di bioskop, tetapi gabungan efek (suara, getaran, angin, kursi miring, kabut air, air naik) membuat adegan terasa jauh lebih hidup. Fokus virtual, bukan perangkat fisik.

## Lokasi

`Mini Cinema` (id `cinema`) di lantai 3 "Gaya Hidup & Keluarga", sayap barat (`hotel-layout.js`, `PUBLIC_PROGRAM[3].w`): sekitar 70 x 62 m, layar di dinding barat, menempel di inti lift. Ruang yang sama juga muncul sebagai "Sky · Mini Cinema" di Sky Lobby bergilir (lantai 100, 250, ...). Langit-langit hanya 3,9 m, jadi air maksimum `WATER_MAX` = 1,6 m.

## Roadmap dan status

Tanda: `[x]` sudah ada di `main`, `[ ]` belum dikerjakan.

- [x] Mesin adegan murni data + matematika `game/src/cinema-5d-data.js` (dengan tes): cue per saluran (rumble, wind, shake, tilt, mist, water), gelombang dari layar ke belakang per kursi, mode kenyamanan, guncangan kamera, denyut getaran HP. Adegan demo `tsunami` (52 detik).
- [ ] Penata ulang ruang bioskop di `hotel-furnish.js` (`GEN.cinema`): sekarang kursi berderet datar dan terlalu banyak (puluhan baris), perlu bertingkat dengan jumlah wajar.
- [ ] Pemutar adegan (jam adegan, tombol mulai, sinkron antar-tamu lewat LiveKit).
- [ ] Tampilan: air naik di lantai, kabut/percikan di layar (pakai ulang gaya `hotel-lagoon-4d.js` dan `glass-rain.js`), kamera miring dan guncang.
- [ ] Suara: gemuruh spasial dari arah layar, suara teredam saat tenggelam.
- [ ] Getaran HP (`haptics.js`) lewat `rumbleBeat`.
- [ ] Adegan lain (film hantu: lampu padam, bisikan spasial, kursi kosong bergerak).
- [ ] Tampilan 3D belum dinilai pemilik; CI hanya menguji logika.

## Catatan

- Kenyamanan: kemiringan, guncangan, dan percikan bisa dikurangi (`?nyaman=gentle`) atau dimatikan (`?nyaman=calm`); "kurangi gerakan" dari perangkat otomatis memakai `calm`. Efek ini harus selalu bisa dimatikan karena sebagian orang mudah pusing.
- Konsep jadwal efek berbasis waktu, pola gelombang, dan grid posisi terinspirasi README `NathanielCustom/Afferent-Cinema` (bioskop 4D fisik berbasis Raspberry Pi). Repo itu tanpa lisensi yang terlihat, jadi tidak ada kode yang disalin; semuanya ditulis ulang sendiri.
- Film komersial berhak cipta: gunakan klip buatan sendiri atau berlisensi, lalu tulis cue efeknya per film.
