# ORBIT World: dunia 3D untuk acara NIKORA

Dunia sosial 3D di browser (three.js + Vite): masuk dengan nama, berjalan dengan avatar, duduk, berbicara dengan suara dekat, dan berkumpul di tempat acara. ORBIT adalah dunia sosial, bukan game tarung (arena duel pada prototipe awal sudah digantikan).

Folder ini adalah sisi **dunia** dari alur undangan → dunia. Gambaran seluruh repositori dan peta keterhubungannya ada di [README utama](../README.md); kontrak tautan, tema, dan mode acara ada di [`../docs/INTEGRATION.md`](../docs/INTEGRATION.md).

## Persyaratan

- Node.js 20+ (CI memakai 22) dan npm
- Browser dengan WebGL 2

## Jalankan

```bash
npm ci --prefix ../server   # beberapa tes game mengimpor paket 'ws' dari server/
npm install
npm run dev
```

## Halaman dunia

| Halaman | Dunia | Keterangan |
|---|---|---|
| `/` (`index.html`) | Aula Resepsi | Duduk di meja, tepuk tangan, joget, panggung MC. Lokasi bawaan acara non-pernikahan. |
| `/villa.html` | NIKORA Wedding Villa | Lokasi bawaan pernikahan. Aula pernikahan 180 kursi, kolam, taman, restoran, spa, suite, koridor 8 kamar tamu, parkiran, lift villa. |
| `/royal.html` | The Royal Wedding · Istana Cinta | Lokasi acara yang bisa dipilih di Studio. |
| `/masjid.html` | Masjid Agung NIKORA | Lokasi acara yang bisa dipilih di Studio; catatan di [`../docs/masjid-agung.md`](../docs/masjid-agung.md). |
| `/hotel.html` | NIKORA Grand Hotel (15 lantai) | Halaman **mandiri satu pemain** dengan lift dan menu Jelajah. Belum menjadi lokasi acara dan belum multiplayer; penyambungan ke villa ada di PR terbuka. |
| `/editor.html` | Editor avatar dan dunia | |
| `/admin.html`, `/dashboard.html` | Pembuat tautan peran, dasbor admin | Lihat bagian di bawah. |

Tautan dunia dari undangan berbentuk `<halaman>?e=<slug>&to=<nama tamu>`. `e` menentukan ruang bersama, `to` menjadi nama avatar. Tanpa `e`, pemain masuk ke ruang umum tanpa gerbang. Menambah lokasi baru: satu entri di `src/venues.js`, satu ruang di `ROOMS` pada `src/token-issuer.js`, satu halaman dunia, dan satu entri di `invitation/src/engine/world-link.js`.

## Kontrol

- `WASD` / panah: berjalan (di HP: joystick)
- `E` atau tombol aksi: duduk di kursi kosong terdekat, tidur di tempat tidur, naik lift atau mobil, berdiri
- `Space` atau tombol TEPUK: tepuk tangan (aula)
- `R` atau ikon rumah: kembali ke pintu masuk
- `M`: peta mini (villa) atau suara (aula); `C`: ganti kamera; `V`: suara dekat di villa; `Enter` atau 💬: obrolan

Kamera villa mengorbit pemain: seret untuk memutar dan memiringkan, scroll atau cubit untuk zoom (4–70 m), putar dua jari untuk memutar. Dinding yang menghalangi diturunkan otomatis. Tombol 🎥 berganti Normal, Dekat, dan Atas.

## Villa

Denah ada sebagai data di `src/villa-layout.js` (ruangan, pintu, properti); logika tabrakannya dipakai bersama klien dan server. Pemain berjalan masuk ke semua ruangan lewat pintu; dinding, kolam, dan perabot menghalangi. Pagar keliling padat dengan gerbang selatan terbuka, di luar ada jalan tanah, semak, dan 240 pohon; pengaman jarak server ±600 m dari pusat.

Aksi: tombol emas di kanan bawah muncul di dekat kursi aula, kursi restoran, sofa lobi, atau tempat tidur (Duduk / Tidur / Berdiri). Pemain lain melihat posisi duduk dan berbaringmu.

## Suara dan peran

- **Suara dekat (aula dan villa):** hanya tamu dekat yang terdengar (penuh sampai 1,5 m, hening di 6 m), paling banyak 4 pembicara terdekat sekaligus. Di villa, dua orang di ruangan berbeda tidak saling dengar walau dekat. MC dan pembicara panggung terdengar penuh di mana pun. Memakai LiveKit; tombol 🎙 untuk mikrofon.
- **Panggung MC:** tombol 🎤 membuka panel (Jadi MC, angkat tangan, naikkan pembicara).
- **Peran pemilik acara dan MC (dikunci server):** secara bawaan siapa pun bisa menjadi MC. Untuk membatasinya:
  1. Di Vercel (Settings → Environment Variables) tambahkan `EVENT_ROLE_SECRET` berisi teks acak minimal 16 karakter (jangan dibagikan), lalu Redeploy.
  2. Cara termudah (HP): buka `/admin.html`, tempel rahasia induk, isi slug acara (kosongkan untuk ruang umum), lalu ketuk Buat tautan; tersedia tombol Salin dan Kirim WhatsApp. Alternatif baris perintah: `EVENT_ROLE_SECRET=<rahasia> node tools/role-key.mjs <slug-acara> owner` (atau `mc`; pakai `-` untuk ruang umum).
  3. Kirim tautan itu secara **privat** ke pemilik atau MC. Kunci disimpan untuk sesi tab dan langsung dihapus dari alamat.

  Server memeriksa kunci dan menaruh peran di token LiveKit (bertanda tangan, tidak bisa dipalsukan). Pemilik dan MC terverifikasi selalu terdengar di seluruh dunia dan hanya mereka yang bisa membuka panggung. Kunci acara A tidak berlaku di acara B. Peran hanya berlaku pada transport LiveKit (produksi), bukan server WebSocket lokal.

## Multiplayer

**Produksi: Vercel + LiveKit, tanpa server sendiri.** Posisi, aksi, obrolan, salaman, dan suara lewat satu ruang LiveKit per dunia (per acara menjadi `evt-<slug>-<dunia>`). Fungsi serverless `api/token.js` hanya menerbitkan token.

1. Buat proyek di cloud.livekit.io, salin URL, API key, dan API secret.
2. Di Vercel isi `LIVEKIT_URL` (`wss://...livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; pastikan **Root Directory** = `game`; Redeploy.
3. Buka situs di dua perangkat: indikator kiri atas menyala hijau dan 🎙 muncul.

Tanpa variabel itu game tetap berjalan offline. Tanpa server otoritatif, tiap klien memegang posisinya sendiri (cocok untuk ruang sosial, bukan kompetitif).

**Lokal / server WebSocket opsional:** `cd ../server && npm install && npm start`, lalu buka `http://localhost:5173/?server=ws://localhost:8080` (villa: `WORLD=villa npm start` dan `/villa.html?server=ws://localhost:8080&name=Ron`). Server memvalidasi posisi dan status duduk. Untuk hosting server di layanan proses-hidup (mis. Railway): pakai root repo, build `cd server && npm install`, start `node server/src/index.js`, dan isi `VITE_SERVER_URL` (`wss://...`) di build Vercel.

## Layar acara (video di dinding)

Mati secara bawaan di aula dan acara lain supaya tidak mengganggu orang yang menonton acara langsung atau film. Tuan rumah menyalakannya per acara dengan `?layar=1` (contoh: `/?e=slug&layar=1`); `?layar=0` mematikannya. Villa memiliki TV sebagai bagian dunianya dan menyalakannya sendiri. Tanpa parameter di halaman yang mati, tidak ada papan, tombol, pengendali, maupun lapisan CSS3D. Lihat `src/screen/screen-config.js`. Pada acara dengan layar menyala, siapa pun bisa menjadi operator lebih dulu; pembatasan khusus tuan rumah belum ada.

## Antarmuka, aura, dan cermin gerak

- **Dock bawah:** obrolan, mikrofon, gerakan (joget, tepuk), menu ≡ (suara, panggung, avatar, pintu masuk, layar bila aktif). Titik merah di ≡ muncul bila MC punya tamu yang mengangkat tangan.
- **Aura:** cincin dan percikan cahaya di sekitar avatar; warna mengikuti bagian hari di perangkat pemain (fajar, siang, senja, malam), dibagikan ke pemain lain. Tanpa lokasi atau data pribadi. Bisa disembunyikan lewat ≡ → Aura. Lihat `src/avatar-aura.js`.
- **Cermin Gerak (opsional, hanya HP):** menu 😀 → Cermin gerak. Miring kiri = membungkuk, kanan = melambai, sangat jauh = berputar (`deviceorientation`, gestur ditahan sekitar 0,3 detik). Pemetaan layar landscape belum diuji di perangkat nyata. Lihat `src/motion-mirror.js`.

## Dasbor admin (`/dashboard.html`)

Monitoring dan pengelolaan untuk pemilik platform: ringkasan, acara dan undangan, dunia 3D, pengguna online, admin dan peran, pembuat tautan pemilik/MC, pengaturan. Masuk dengan rahasia induk (`EVENT_ROLE_SECRET`); rahasia tidak dikirim, browser menghitung tanda tangan HMAC berumur 5 menit yang diverifikasi di `GET /api/admin/stats`. Tanpa `EVENT_ROLE_SECRET` endpoint tertutup (503).

Data nyata, tanpa angka karangan: pengguna online dan ruang aktif dari LiveKit; daftar undangan dari tabel `invitations` Supabase (`SUPABASE_URL` + `SUPABASE_ANON_KEY`; pasang `SUPABASE_SERVICE_ROLE_KEY`, khusus server, untuk melihat juga draf dan undangan nonaktif); grafik "Acara dibuat" dari `created_at`; Status Sistem (API, Database, Realtime) dengan batas waktu 4 detik per bagian. `/dashboard.html?demo=1` menampilkan data contoh. Tautan Studio dan Undangan dapat diganti lewat `VITE_STUDIO_URL` dan `VITE_INVITATION_URL`.

Belum tersedia: menu Template & Aset, Pembayaran, Laporan (ditandai "Segera"); autentikasi dua langkah.

## Pengecekan

```bash
npm test
npm run build
npm run test:e2e
```

CI menjalankan ketiganya pada setiap PR (lihat `../.github/workflows/ci.yml`).

## Batas jujur

- Satu ruang dibatasi 50 pemain; belum ada mode penonton untuk ratusan orang.
- Tepuk tangan belum disinkronkan ke pemain lain.
- Pemain lokal masih diprediksi di klien; belum ada rekonsiliasi penuh dengan server.
- Tes E2E berjalan di CI (Chromium), tetapi tampilan 3D dan kinerja di HP belum diverifikasi secara visual dan manual.
- Hotel 15 lantai masih halaman satu pemain; lift villa, mobil, dan hotel di dalam villa masih dalam PR terbuka dan belum diuji di peta.
- Belum ada: akun pengguna, dunia yang bisa dibangun tamu, dan chat teks di villa (periksa kodenya sebelum mengandalkan catatan ini).
