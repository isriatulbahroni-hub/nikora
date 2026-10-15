# ORBIT World — Aula Resepsi (Prototipe 1)

Aula virtual 3D di browser: masuk dengan nama, berjalan di aula resepsi, duduk di meja, dan bertepuk tangan. Ini menggantikan prototipe arena duel sebelumnya; ORBIT adalah dunia sosial, bukan game tarung.

## Persyaratan

- Node.js 20+ dan npm
- Browser dengan WebGL 2

## Jalankan

```bash
cd game
npm install
npm run dev
```

## Kontrol

- `WASD` / panah: berjalan (di HP: joystick)
- `E` atau tombol DUDUK: duduk di kursi kosong terdekat / berdiri
- `Space` atau tombol TEPUK: tepuk tangan
- `R` atau ikon rumah: kembali ke pintu masuk, `M`: suara

## NIKORA Wedding Villa (`/villa.html`)

Dunia jelajah berdasarkan desain NIKORA Wedding Villa: aula pernikahan dengan pelaminan dan 180 kursi, kolam dengan jembatan, taman air mancur, restoran & kafe, dapur, spa, main suite, bridal room, lobby, koridor dengan 8 kamar tamu, dan parkiran. Pemain berjalan masuk ke semua ruangan lewat pintu; dinding, kolam, dan perabot menghalangi jalan. Kontrol: WASD/panah (atau joystick di layar sentuh), scroll untuk zoom. Ada minimap dan label lokasi.

Denah ada sebagai data di `src/villa-layout.js` (ruangan, pintu, properti) sehingga mudah ditambah atau diubah; logika tabrakannya dipakai bersama oleh klien dan server. Dinding sisi selatan pemain direndahkan otomatis supaya isi ruangan tetap terlihat.

Aksi: tombol emas di kanan bawah muncul di dekat kursi aula, kursi restoran, sofa lobi, atau tempat tidur (Duduk / Tidur / Berdiri; tombol E di keyboard). Bergerak = berdiri otomatis. Pemain lain melihat posisi duduk dan berbaringmu. Suara dekat memakai LiveKit seperti di aula (tombol 🎙, tombol V); volume mengikuti jarak. Peta tersembunyi secara bawaan; tombol 🗺 atau tombol M menampilkannya.

Kamera mengorbit pemain: seret (mouse/satu jari) untuk memutar 360° dan memiringkan (dari hampir sejajar tanah sampai pandangan dari atas), scroll atau cubit dua jari untuk zoom (4–70 m), putar dua jari untuk memutar. Tombol 🎥 (tombol C) berganti antara Normal, Dekat, dan Atas. Joystick dan WASD bergerak relatif terhadap arah kamera. Dinding yang menghalangi di sisi kamera diturunkan otomatis.

Aturan suara (aula dan vila): hanya tamu yang dekat yang terdengar (penuh sampai 1,5 m, hening di 6 m), paling banyak 4 pembicara terdekat sekaligus, dan di vila dua orang di ruangan berbeda tidak saling dengar walau dekat. MC dan pembicara panggung dikecualikan: terdengar penuh di mana pun. Tombol 🎤 membuka panel Panggung MC (Jadi MC, angkat tangan, naikkan pembicara); pemilik acara bisa dinaikkan MC sebagai pembicara. ### Peran pemilik acara dan MC (dikunci server)

Secara bawaan (tanpa pengaturan di bawah) siapa pun bisa menjadi MC. Untuk membatasinya:

1. Di Vercel (Settings → Environment Variables) tambahkan `EVENT_ROLE_SECRET` berisi teks acak minimal 16 karakter (rahasia ini tidak boleh dibagikan), lalu Redeploy.
2. **Cara termudah (HP):** buka `https://<situs>/admin.html`, tempel rahasia induk, isi slug acara (kosongkan untuk ruang umum/uji coba), lalu ketuk Buat tautan. Halaman itu menghitung di browser (tanpa kirim apa pun ke jaringan) dan memberi tautan pemilik dan MC beserta tombol Salin dan Kirim WhatsApp. Alternatif lewat baris perintah: buat kunci per acara di komputermu: `EVENT_ROLE_SECRET=<rahasia yang sama> node tools/role-key.mjs <slug-acara> owner` (atau `mc`). Slug sama dengan `?e=` di tautan undangan; pakai `-` untuk ruang umum. Skrip ini mencetak tautan siap pakai, mis. `https://situs.vercel.app/villa.html?e=slug&key=owner-...`.
3. Kirim tautan itu secara **privat** ke pemilik acara atau MC (jangan ke undangan umum). Kunci disimpan untuk sesi tab dan langsung dihapus dari alamat.

Hasilnya: server memeriksa kunci dan menaruh peran di token LiveKit (bertanda tangan, tidak bisa dipalsukan pengguna). Pemilik acara dan MC terverifikasi **selalu terdengar di seluruh vila**, hanya mereka yang bisa membuka panggung (Jadi MC) dan menaikkan pembicara. Tamu lain tetap hanya terdengar jika berdekatan. Kunci acara A tidak berlaku di acara B. Peran hanya berlaku pada transport LiveKit (produksi), bukan server WebSocket lokal.

### Dunia terbuka

Pemain tidak terkurung: pagar keliling vila padat tetapi gerbang selatan terbuka, dan di luar ada jalan tanah, semak, dan 240 pohon (batang pohon menghalangi). Hanya ada pengaman jarak server ±600 m dari pusat. Dinding bangunan, kolam, dan perabot tetap menghalangi. Bukit latar dan langit mengikuti pemain agar selalu di cakrawala.

Belum ada: lantai 2 dan tangga, atap, interior detail (furnitur lengkap, tekstur), chat teks di vila.

Dengan multiplayer: jalankan server `WORLD=villa npm start` (di folder `server`), lalu buka `/villa.html?server=ws://localhost:8080&name=Ron`.

## Multiplayer (opsional)

Jalankan server (`cd server && npm install && npm start`), lalu buka `http://localhost:5173/?server=ws://localhost:8080`. Posisi dan status duduk divalidasi server; pemain lain terlihat bergerak dan duduk. Tanpa `?server=`, aula berjalan offline dengan tamu simulasi.

## Obrolan dan banyak penonton

Obrolan (`Enter` atau tombol 💬) memakai server WebSocket di `server/`. Vercel tidak bisa menjalankan server ini, jadi host `server/` di layanan yang mendukung proses Node yang terus hidup (mis. Railway), lalu isi variabel build Vercel `VITE_SERVER_URL` dengan alamatnya (`wss://...`). Tanpa itu, aula berjalan offline dan pesan hanya terlihat oleh pengirim.

Catatan Railway: server mengimpor `game/src`, jadi pakai root repo (bukan folder `server`), build `cd server && npm install`, start `node server/src/index.js`.

## Pengecekan

```bash
npm test
npm run build
npm run test:e2e
```

## Batas jujur

- Satu ruang dibatasi 50 pemain; belum ada mode penonton untuk ratusan orang.
- Belum ada suara (spatial voice), siaran langsung, akun, atau dunia yang bisa dibangun. Layar di panggung hanya placeholder.
- Tepuk tangan hanya terlihat oleh pemain sendiri (belum disinkronkan ke pemain lain).
- Pemain lokal masih diprediksi di klien; belum ada rekonsiliasi penuh dengan server.
- Tes E2E (`e2e/hall.spec.js`) ditulis tetapi belum pernah dijalankan di browser sungguhan; tampilan belum diverifikasi secara visual.

## Multiplayer + suara hanya dengan Vercel + LiveKit (tanpa server sendiri)

Posisi, aksi, chat, salaman, dan suara semuanya lewat satu ruang LiveKit (`orbit-hall`). Fungsi serverless `api/token.js` hanya menerbitkan token.

1. Buat proyek di cloud.livekit.io, lalu salin URL, API key, dan API secret.
2. Di Vercel → Settings → Environment Variables, isi `LIVEKIT_URL` (`wss://...livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Pastikan **Root Directory** proyek = `game`. Redeploy.
3. Buka situs di dua perangkat: indikator di kiri atas menyala hijau dan 🎙 muncul.

Tanpa variabel itu game tetap berjalan offline. Batasan: tanpa server otoritatif, tiap klien memegang posisinya sendiri (cocok untuk ruang sosial, bukan kompetitif). `?server=ws://...` masih bisa memakai `server/` bila suatu saat dibutuhkan.

## Layar acara (video di dinding) — mati secara bawaan
Layar (papan di dinding, tombol 🎬 di menu, sinkron operator, YouTube/TikTok/video/siaran) **tidak aktif** di semua acara,
supaya tidak mengganggu orang yang menonton acara langsung atau film. Kodenya tidak dihapus.
Untuk acara tertentu, tuan rumah menambahkan `?layar=1` pada tautan acara (contoh: `/?acara=slug&layar=1`).
Tanpa parameter itu tidak ada papan, tombol, pengendali, maupun lapisan CSS3D yang dibuat. Lihat `src/screen/screen-config.js`.
Catatan: pada acara yang layarnya menyala, siapa pun bisa menjadi operator lebih dulu; pembatasan hanya untuk tuan rumah belum ada.

## Tata letak antarmuka
Dock bawah: obrolan, mikrofon, gerakan (joget, tepuk), dan menu ≡. Menu ≡ berisi suara, panggung, avatar, pintu masuk,
dan layar (bila diaktifkan). Titik merah di ≡ muncul bila MC punya tamu yang mengangkat tangan.

## Aura dan Cermin Gerak
- **Aura:** cincin dan percikan cahaya di sekitar avatar. Warna mengikuti bagian hari di perangkat pemain (fajar, siang, senja, malam)
  ditambah variasi kecil dari nama. Bagian hari dikirim ke pemain lain supaya semua melihat warna yang sama. Tidak memakai lokasi,
  cuaca, atau data pribadi. Bisa disembunyikan lewat menu ≡ → Aura (preferensi lokal, juga menghemat tenaga). Lihat `src/avatar-aura.js`.
- **Cermin Gerak (opsional, hanya HP):** menu 😀 → Cermin gerak. Miring kiri = membungkuk hormat, miring kanan = melambai,
  miring sangat jauh = berputar. Memakai `deviceorientation` dan meminta izin sensor bila browser mewajibkan. Gestur butuh ditahan
  sekitar 0,3 detik, ada jeda 2,2 detik, dan miring yang ditahan tidak memicu berulang. Tidak aktif saat duduk atau joget.
  Pemetaan layar landscape belum diuji di perangkat nyata. Lihat `src/motion-mirror.js`.


## Dasbor admin (`/dashboard.html`)

Dasbor monitoring dan pengelolaan untuk admin/pemilik platform: ringkasan, acara & undangan, dunia 3D, pengguna online, admin & peran, pembuat tautan pemilik/MC, dan pengaturan. Tampil rapi di desktop (sidebar bisa dilipat) dan HP (menu geser, kartu bertumpuk).

**Masuk:** buka `https://<situs>/dashboard.html` dan tempel rahasia induk (`EVENT_ROLE_SECRET`). Rahasia tidak pernah dikirim: browser menghitung tanda tangan HMAC berumur 5 menit (`Admin <detik>.<tanda tangan>`) yang diverifikasi server di `GET /api/admin/stats`. Rahasia hanya disimpan di tab ini. Tanpa `EVENT_ROLE_SECRET` endpoint tertutup (503).

**Data yang nyata (tanpa angka karangan):**
- Pengguna online, ruang aktif, dan daftar peserta berperan: dari LiveKit (`RoomServiceClient`, memakai `LIVEKIT_*` yang sama dengan suara).
- Total acara dan daftar undangan: dari tabel `invitations` Supabase memakai `SUPABASE_URL` + `SUPABASE_ANON_KEY` (hanya undangan aktif). Pasang `SUPABASE_SERVICE_ROLE_KEY` (khusus server, opsional) untuk melihat juga draf dan undangan nonaktif.
- Grafik "Acara dibuat" 7/30/90 hari dari `created_at`; grafik Live mencatat pengguna online selama dasbor terbuka (riwayat panjang butuh penyimpanan metrik, belum ada).
- Status Sistem: API (waktu respons dari browser), Database, dan Realtime (waktu respons server), plus peringatan yang bisa ditindaklanjuti (variabel belum terbaca, layanan lambat/mati, peran belum dikunci).
- Tiap bagian dikumpulkan terpisah dengan batas waktu 4 detik: satu layanan mati tidak merusak yang lain. Keluaran tidak memuat kunci atau URL layanan.

**Belum tersedia:** menu Template & Aset, Pembayaran, dan Laporan ditandai "Segera" karena tidak ada sumber datanya (penyimpanan aset, penyedia pembayaran, riwayat metrik). Tidak ada autentikasi dua langkah (2FA): akses admin hanya lewat rahasia induk.

**Mode contoh:** `/dashboard.html?demo=1` (atau tombol di halaman masuk) menampilkan data contoh dengan spanduk "DATA CONTOH", untuk meninjau tampilan.

Tautan Studio dan Undangan dapat diganti lewat variabel build `VITE_STUDIO_URL` dan `VITE_INVITATION_URL`.
