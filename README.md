# NIKORA / ORBIT

Undangan digital yang berujung ke **dunia 3D bersama**: pembuat undangan membagikan satu tautan, tamu membuka undangan (amplop, surat, RSVP, buku tamu, hadiah), lalu masuk ke dunia 3D acara dengan avatar, suara dekat, dan obrolan.

> Dokumen ini menggambarkan kondisi repositori saat ini. Rancangan induk produk (blueprint ORBIT) yang sebelumnya menjadi README tetap tersimpan di riwayat git: [README lama pada commit `8b56b16`](https://github.com/isriatulbahroni-hub/nikora/blob/8b56b1685ba4a1f599325f850aa7b6846d108d75/README.md). Isinya adalah rencana, bukan bukti bahwa fitur sudah jadi.

## Alur pengguna

`Studio` (pembuat undangan membuat undangan + daftar tamu) → tautan personal `?slug=<slug>&to=<nama>` → adegan undangan → tombol **Masuk ke dunia** → `<halaman dunia>?e=<slug>&to=<nama>` → gerbang bertema → avatar → dunia 3D (ruang LiveKit per acara).

## Isi repositori

| Folder | Isi |
|---|---|
| `invitation/` | Aplikasi undangan (Vite). Adegan: amplop, surat, cover, kisah, detail, galeri, RSVP, buku tamu, hadiah, hari acara, penutup, arsip. Tema, Studio pembuat undangan (`studio.html`), pratinjau langsung, data dari Supabase. |
| `game/` | Dunia 3D (three.js, Vite): aula, villa, royal, masjid, hotel; editor avatar; dasbor dan admin; fungsi serverless `api/` (token LiveKit, statistik admin). |
| `server/` | Server WebSocket opsional untuk multiplayer lokal atau tanpa LiveKit. |
| `supabase/` | Skema dan kebijakan basis data (undangan, RSVP, tamu, hadiah). |
| `tools/` | Skrip bantu, mis. pembuat kunci peran pemilik/MC. |
| `docs/` | Kontrak integrasi, daftar adegan undangan, audit, peta jalan, catatan aset dan avatar. |

## Peta keterhubungan undangan ↔ dunia

Satu lokasi acara harus terdaftar di **empat tempat** supaya tersambung dari ujung ke ujung:

1. `invitation/src/engine/world-link.js`: `WORLDS`, `WORLD_LABELS`, `WORLD_PAGES` (menu "Dunia 3D" di Studio dan tautan di akhir undangan).
2. `game/src/venues.js`: nama dan halaman lokasi.
3. `game/src/token-issuer.js`: `ROOMS` (nama ruang LiveKit; per acara menjadi `evt-<slug>-<dunia>`).
4. Satu halaman dunia di `game/`.

| Lokasi | Halaman | Terdaftar di 1–3 | Catatan |
|---|---|---|---|
| Villa (bawaan pernikahan) | `villa.html` | ya | Multiplayer, suara, lift villa |
| The Royal Wedding | `royal.html` | ya | |
| Aula (bawaan acara lain) | `/` (`index.html`) | ya | |
| Masjid Agung NIKORA | `masjid.html` | ya | |
| NIKORA Grand Hotel (15 lantai) | `hotel.html` | **belum** | Halaman mandiri satu pemain, belum multiplayer dan belum bisa dipilih di Studio. Penyambungan ke villa sedang berjalan di PR #65 dan #67. |

Parameter yang dibawa tautan dunia: `e` (slug acara, ruang bersama) dan `to` (nama tamu, maks 24 karakter). Kontrak lengkap, tema bersama, dan mode acara ada di [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## Menjalankan

Butuh Node.js 22 (CI memakai 22; minimal 20) dan browser dengan WebGL 2.

```bash
npm ci --prefix server      # game/ mengimpor paket 'ws' dari server/
cd game && npm install && npm run dev            # dunia 3D
cd invitation && npm install && npm run dev      # undangan + studio
```

Tanpa konfigurasi apa pun dunia berjalan offline dengan tamu simulasi. Detail kontrol, suara, peran MC, dan dasbor admin: [`game/README.md`](game/README.md).

## Variabel lingkungan

| Proyek | Variabel |
|---|---|
| Dunia (`game/`, Root Directory = `game`) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Opsional (dunia) | `EVENT_ROLE_SECRET` (min. 16 karakter; mengunci peran pemilik/MC dan dasbor admin), `MODERATION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (hanya server), `VITE_SERVER_URL`, `VITE_STUDIO_URL`, `VITE_INVITATION_URL` |
| Undangan (`invitation/`) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORLD_URL` |

Jangan pernah memasukkan kunci rahasia ke bundel klien atau ke repositori. Berkas `.env.example` ada di `game/` dan `invitation/`.

## Pengecekan

CI (`.github/workflows/ci.yml`) pada setiap PR dan push ke `main`: tes unit `server`, `game`, `invitation`; build `game` dan `invitation`; lalu E2E Playwright (Chromium) untuk `game`.

```bash
npm test --prefix server && npm test --prefix game && npm test --prefix invitation
npm run build --prefix game && npm run build --prefix invitation
npm run test:e2e --prefix game
```

## Status dan batas jujur

- Kode yang lulus tes otomatis belum berarti sudah diuji di perangkat nyata: tampilan 3D, kinerja HP, dan alur lintas halaman perlu dicoba manual.
- Hotel 15 lantai, lift, dan mobil baru digabung secara kode di PR #67 dan belum dicoba di peta.
- Dasbor admin hanya memakai satu rahasia induk (tanpa 2FA). Menu Template, Pembayaran, dan Laporan belum ada.
- Layar acara (video di dinding) mati secara bawaan kecuali tautan memakai `?layar=1`; villa menyalakannya sendiri.
- Tepuk tangan belum disinkronkan ke pemain lain; satu ruang dibatasi 50 pemain.
- Akun, pembayaran, marketplace, dan fitur lain di blueprint lama belum dibangun.
