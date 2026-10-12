# Penyatuan Undangan ↔ Dunia

Dokumen ini adalah kontrak antara dua pekerjaan yang berjalan paralel. Tujuannya: pembuat undangan membagikan link, tamu melihat undangan, lalu melewati **gerbang** dan masuk ke **dunia acara** yang terasa satu produk.

## Pembagian kepemilikan
| Area | Isi | Pemilik |
|---|---|---|
| `invitation/` | Adegan undangan (amplop, surat, RSVP, galeri, …), pembuat undangan, tema | pekerjaan undangan |
| `game/` | Dunia 3D (villa, aula, lokasi lain), avatar, suara, gerbang | pekerjaan dunia |
| kontrak di bawah | tautan, field data, tema | disepakati bersama, ubah dengan hati-hati |

## Alur
`link undangan` → adegan undangan (amplop, isi, RSVP) → tamu menekan **Hadir / Masuk ke dunia** → `link dunia` → **gerbang** (tema sama dengan undangan) → avatar → dunia.

## Kontrak 1: link dunia
`<WORLD_URL>/<halaman>?e=<slug>&to=<nama tamu>`
- `e` = `invitations.slug` (huruf kecil, angka, tanda minus, 3-40 karakter). Menentukan **ruang bersama**: tamu satu undangan bertemu satu sama lain (`evt-<slug>-<dunia>` di LiveKit). Tanpa `e`, tamu masuk ruang umum dan tidak ada gerbang.
- `to` = nama tamu (maks 24 karakter di dunia), dipakai untuk sapaan dan nama avatar.
- Dibuat oleh `invitation/src/engine/world-link.js` (`worldUrl(view)`). Adegan mana pun (RSVP, hari acara, penutup) cukup memanggil fungsi ini.

## Kontrak 2: lokasi acara
`invitations.extra.world` = id lokasi di `game/src/venues.js` (`villa`, `hall`). Bawaan: pernikahan → `villa`, selain itu → `hall`. Lokasi baru (hotel, taman, …) = satu entri `venues.js` + satu halaman dunia + satu id di `WORLDS` pada `world-link.js`.

## Kontrak 3: data publik yang dibaca dunia
Dari `invitations` (anon key, dibatasi RLS, hanya undangan aktif): `slug, groom, bride, event_type, event_date, theme, extra.title, extra.tz`. Dunia tidak menulis apa pun ke tabel ini.

## Kontrak 4: tema
Gerbang memakai palet dan huruf tema undangan yang sama. Salinannya di `game/src/event-themes.js` **dihasilkan** dari `invitation/src/themes/index.js`:
`node game/scripts/sync-event-themes.mjs`. Tes `game/src/gate.test.js` gagal bila salinan ini tertinggal, jadi tema baru wajib disinkronkan.

## Variabel lingkungan
- Proyek dunia (nikora-ten): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Proyek undangan: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORLD_URL`.

## Studio pembuat undangan (`invitation/studio.html`)
Login/daftar (Supabase Auth), buat undangan (`invitations` + 12 baris `invitation_scenes` bawaan), daftar tamu dengan link personal `?slug=<slug>&to=<nama>` (salin / WhatsApp), ringkasan RSVP, dan hadiah. Kode: `invitation/src/studio/`. Semua akses lewat anon key + sesi pengguna, dijaga RLS yang sudah ada; tidak ada service key di browser.

Adegan tamu `rsvp`, `bukutamu`, `hadiah` ada di `invitation/src/scenes/guest.js`. Buku tamu = kolom `wish` pada `rsvps` (hanya nama + ucapan yang dibaca publik). Adegan `hadiah` otomatis dilewati bila tidak ada hadiah aktif.

## Catatan untuk pekerjaan undangan
Kartu akhir di `scene-engine.js` kini punya tombol "Masuk ke dunia" sebagai jembatan sementara. Saat adegan RSVP/hari acara selesai, pindahkan tombol itu ke sana (pakai `worldUrl`) dan hapus dari kartu akhir.
