# Fase 10 — AI World Studio (status)

Diperbarui: 15 Okt 2026. Cabang: `feat/fase10-ai-world-studio`.

## Kebijakan penggunaan AI (10.1)

- **Boleh:** membuat DRAF proyek dunia (`orbit.world`) dari deskripsi teks. Draf masuk editor, kreator mengubahnya, lalu alur ajukan → tinjau Fase 9 tetap berlaku.
- **Dilarang:** menerbitkan/mengajukan tanpa tindakan kreator; mengubah izin, peran, saldo, atau data pengguna; memakai objek di luar katalog; menyimpan deskripsi pengguna di log.
- **Keluaran model = data tidak tepercaya.** `draftFromModel` membentuk ulang (kolom asing dan jenis di luar katalog dibuang, posisi dijepit ke area, batas objek/beban ditegakkan) lalu hasil WAJIB lolos `validateProject`. Server dan klien sama-sama memeriksa.
- Model tidak diberi alat (tanpa tool use), hanya menghasilkan JSON.

## Komponen

| Berkas | Peran |
| --- | --- |
| `src/ai-world.js` | Kebijakan, prompt berversi (`world-draft/1`), pembersih deskripsi, ekstraksi JSON, `draftFromModel`, pembatas laju |
| `src/ai-world-server.js` | Penangan: autentikasi sesi Supabase → batas laju → panggil Anthropic → validasi → draf |
| `api/ai-world.js` | Pembungkus fungsi serverless Vercel (`POST /api/ai-world`) |
| `src/ai-world-client.js` | Pekerjaan klien: status, percobaan ulang (maks. 2), pembatalan |
| `src/editor-ai-ui.js` | Panel "✨ AI" di Studio Dunia: ringkasan, Terapkan, Kembalikan sebelumnya |

## Pengaturan (Vercel → Environment Variables)

- `ANTHROPIC_API_KEY` (wajib, hanya server). Tanpa ini fitur mati dengan pesan "tidak aktif".
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` (atau `VITE_*` yang sudah ada) dipakai untuk memastikan pemanggil sudah masuk akun.
- Opsional: `AI_WORLD_MODEL` (bawaan `claude-haiku-5-5`), `AI_WORLD_PER_HOUR` (bawaan 5 per pengguna), `AI_WORLD_DAILY_CAP` (bawaan 100 global), `AI_WORLD_DISABLED=1` (saklar mati).
- `npm run dev` (Vite) tidak menyajikan `/api/*`; uji end-to-end memakai `vercel dev` atau hasil deploy.

## Belum selesai / batasan yang diketahui

- **Belum diuji dengan AI sungguhan.** Semua tes memakai `fetch` tiruan; belum ada satu pun panggilan nyata ke Anthropic dan belum dijalankan di Vercel. Kualitas tata letak dari model belum dinilai.
- **Batas laju hanya dalam memori per instance serverless** (hilang saat instance berganti, tidak dibagi antar instance). Itu menahan penyalahgunaan kasar, bukan kuota biaya yang tahan restart. Kuota permanen butuh tabel di Supabase (belum dibuat).
- Belum ada riwayat/jejak pekerjaan AI di database dan belum ada antrean sungguhan (pekerjaan berjalan sinkron dalam satu permintaan, `maxDuration` 60 dtk).
- Menerapkan draf memakai `editor.load` sehingga riwayat urungkan dikosongkan; tersedia "Kembalikan sebelumnya" untuk satu langkah.
- Biaya per permintaan belum diukur; hanya jumlah token yang dicatat di log server (tanpa deskripsi dan tanpa ID pengguna).
- Belum ada E2E Playwright untuk panel AI; yang ada tes unit dan tes DOM (jsdom).
- Gate persetujuan Fase 10 belum diberikan.
