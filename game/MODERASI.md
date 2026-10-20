# Moderasi obrolan ("CCTV")

Filter kata kasar (Indonesia/Melayu) dengan 3 peringatan; pelanggaran ke-4 mengeluarkan tamu dari ruang dan memblokirnya dari acara itu.

## Cara kerja
1. `POST /api/token` menerima `deviceId` (acak, dibuat browser) dan, bila `MODERATION_SECRET` dipasang, menolak perangkat yang diblokir di acara itu (`reason: 'banned'`) serta menerbitkan `modToken` (bertanda tangan, berisi id, ruang, acara, HMAC perangkat).
2. `LiveKitNet` memasang `attachModeration` (`src/moderated-net.js`) otomatis di browser, jadi semua dunia (villa, royal, masjid, aula) ikut tanpa mengubah file main. Di Node (tes) tidak terpasang, kecuali opsi `moderation` diisi. Pesan bersih terkirim seperti biasa; pesan kasar tidak dikirim, dilaporkan ke `POST /api/moderate`.
3. Server menilai ulang teks, menambah strike (fungsi SQL `moderation_strike`, atomik), membalas `warn` (1-3), lalu `ban` (ke-4) dan memanggil `RoomServiceClient.removeParticipant`.

## Pasang
- Jalankan migrasi `supabase/migrations/20261020000000_moderasi_tamu.sql`.
- Variabel lingkungan (server, jangan beri awalan VITE_): `MODERATION_SECRET` (min. 16 karakter), `SUPABASE_SERVICE_ROLE_KEY`, opsional `MODERATION_LEVEL=ketat` (menambah kata ringan). Tanpa `MODERATION_SECRET` semua ini mati dan perilaku lama tidak berubah (pesan tetap terkirim).
- Matikan di satu dunia: `new LiveKitNet({ ..., moderation: false })`.

## Batasan yang jujur
- Obrolan berjalan antar-klien lewat data channel LiveKit. Klien yang dimodifikasi bisa melewati filter di browser. Penegakan penuh butuh pesan lewat server (atau agen LiveKit di server).
- Ban berdasarkan id perangkat (localStorage): menghapus data browser membuatnya baru. Ini menahan tamu biasa, bukan penyerang yang gigih.
- Suara belum dimoderasi (butuh speech-to-text terpisah).
- Buka blokir: lihat komentar di akhir berkas migrasi.
