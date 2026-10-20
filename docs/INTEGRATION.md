# Penyatuan Undangan ↔ Dunia

Dokumen ini adalah kontrak antara dua pekerjaan yang berjalan paralel. Tujuannya: pembuat undangan membagikan link, tamu melihat undangan, lalu melewati **gerbang** dan masuk ke **dunia acara** yang terasa satu produk.

## Pembagian kepemilikan
| Area | Isi | Pemilik |
|---|---|---|
| `invitation/` | Adegan undangan (amplop, surat, RSVP, galeri, …), pembuat undangan, tema | pekerjaan undangan |
| `game/` | Dunia 3D (villa, royal, aula, masjid, hotel), avatar, suara, gerbang | pekerjaan dunia |
| kontrak di bawah | tautan, field data, tema | disepakati bersama, ubah dengan hati-hati |

## Alur
`link undangan` → adegan undangan (amplop, isi, RSVP) → tamu menekan **Hadir / Masuk ke dunia** → `link dunia` → **gerbang** (tema sama dengan undangan) → avatar → dunia.

## Kontrak 1: link dunia
`<WORLD_URL>/<halaman>?e=<slug>&to=<nama tamu>`
- `e` = `invitations.slug` (huruf kecil, angka, tanda minus, 3-40 karakter). Menentukan **ruang bersama**: tamu satu undangan bertemu satu sama lain (`evt-<slug>-<dunia>` di LiveKit). Tanpa `e`, tamu masuk ruang umum dan tidak ada gerbang. Dunia membaca `e` dan `to` lewat `game/src/event-context.js` (`parseEventParams`).
- `to` = nama tamu (maks 24 karakter di dunia), dipakai untuk sapaan dan nama avatar.
- Dibuat oleh `invitation/src/engine/world-link.js` (`worldUrl(view)`). Adegan mana pun (RSVP, hari acara, penutup) cukup memanggil fungsi ini.
- `<halaman>` ditentukan lokasi acara (Kontrak 2). Aula tidak punya nama halaman: tautannya ke akar situs (`/?e=<slug>`).
- Mode demo (slug `demo`) tidak membawa `e`, jadi masuk ke ruang umum.

## Kontrak 2: lokasi acara
`invitations.extra.world` = id lokasi. Lokasi yang terdaftar sekarang:

| id | Halaman | Nama ruang LiveKit (tanpa acara) |
|---|---|---|
| `villa` | `villa.html` | `nikora-villa` |
| `royal` | `royal.html` | `nikora-royal` |
| `hall` | `/` (aula) | `orbit-hall` |
| `masjid` | `masjid.html` | `nikora-masjid` |

Bawaan bila `extra.world` kosong: pernikahan → `villa`, selain itu → `hall`. Id yang tidak dikenal jatuh ke `villa` di sisi undangan (`worldPage`) dan ke aula di sisi token (`roomFor`).

**Menambah lokasi baru** harus mengubah empat tempat sekaligus, kalau tidak lokasinya tidak tersambung:
1. `invitation/src/engine/world-link.js`: `WORLDS`, `WORLD_LABELS`, `WORLD_PAGES` (menu "Dunia 3D" di Studio memakai daftar ini).
2. `game/src/venues.js`: `VENUES` (label dan halaman).
3. `game/src/token-issuer.js`: `ROOMS`.
4. Satu halaman dunia di `game/` yang memanggil jaringan LiveKit dan membaca `?e=`.

**Belum terdaftar:** `hotel.html` (NIKORA Grand Hotel, 15 lantai) masih halaman mandiri satu pemain tanpa jaringan, jadi sengaja belum ada di daftar di atas; memilihnya di Studio akan mengirim tamu ke tempat tanpa ruang bersama. Hotel dan lift-nya sedang disambungkan ke dunia villa lewat PR terbuka (#65, #67). Bila hotel kelak menjadi lokasi sendiri, ikuti empat langkah di atas.

## Kontrak 3: data publik yang dibaca dunia
Dari `invitations` (anon key, dibatasi RLS, hanya undangan aktif): `slug, groom, bride, event_type, event_date, theme, extra.title, extra.tz` (juga `extra.mode`, lihat Kontrak 6). Dunia tidak menulis apa pun ke tabel ini.

## Kontrak 4: tema
Gerbang memakai palet dan huruf tema undangan yang sama. Salinannya di `game/src/event-themes.js` **dihasilkan** dari `invitation/src/themes/index.js`:
`node game/scripts/sync-event-themes.mjs`. Tes `game/src/gate.test.js` gagal bila salinan ini tertinggal, jadi tema baru wajib disinkronkan.

## Variabel lingkungan
- Proyek dunia (nikora-ten): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Opsional: `EVENT_ROLE_SECRET`, `MODERATION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (hanya server).
- Proyek undangan: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORLD_URL` (bila kosong, tautan dunia memakai `https://nikora-ten.vercel.app`).

## Studio pembuat undangan (`invitation/studio.html`)
Login/daftar (Supabase Auth), buat undangan (`invitations` + 12 baris `invitation_scenes` bawaan), daftar tamu dengan link personal `?slug=<slug>&to=<nama>` (salin / WhatsApp / QR), ringkasan RSVP, dan hadiah. Form buat undangan punya pilihan **Dunia 3D** (mengisi `extra.world`). Kode: `invitation/src/studio/`. Semua akses lewat anon key + sesi pengguna, dijaga RLS yang sudah ada; tidak ada service key di browser. Akun Studio dibuat oleh admin (tidak ada pendaftaran sendiri di halaman masuk).

Adegan tamu `rsvp`, `bukutamu`, `hadiah` ada di `invitation/src/scenes/guest.js`. Buku tamu = kolom `wish` pada `rsvps` (hanya nama + ucapan yang dibaca publik). Adegan `hadiah` otomatis dilewati bila tidak ada hadiah aktif.

## Catatan untuk pekerjaan undangan
Tombol "Masuk ke dunia" saat ini ada di kartu akhir `scene-engine.js` (memakai `worldUrl` dan `enterLabel`). Ia belum dipindahkan ke adegan RSVP/hari acara; bila dipindahkan, panggil `worldUrl` yang sama dan hapus tombol dari kartu akhir.

## Kontrak 5: Layar Tancap (aula dan villa)
Satu layar besar per dunia (`game/src/screen/`). Dunia baru cukup memanggil `createScreen({ scene, spec })`, lalu `attach(session)` dan `tick(ms)`.
- **Mati secara bawaan** (`screen-config.js`): menyala per acara lewat `?layar=1`; halaman yang punya TV sebagai bagian dunianya (villa) menyalakannya sendiri lewat `data-layar-bawaan="on"`. `?layar=0` mematikan.
- **Operator:** siapa pun bisa menjadi operator bila belum ada (seperti MC). Hanya pesan operator yang dipakai penerima. Penegakan ada di klien, belum tahan klien yang dimodifikasi.
- **Sumber:** link YouTube/TikTok (panel video resmi di tiap perangkat, YouTube disinkronkan dengan operator), video dari perangkat operator dan siaran kamera langsung (track LiveKit `ScreenShare`/`ScreenShareAudio`, tampil di layar 3D). Video tidak pernah diunduh atau disalin ulang.
- **Pesan jaringan:** `t:'sc'` dengan `k` = claim, release, load, play, pause, seek, stop, sync (lihat `screen-state.js`).
- **API server:** `api/video-meta.js` hanya mengikuti link pendek TikTok (domain TikTok saja).
- **Batas:** video dari perangkat tidak bisa disiarkan dari iPhone (tanpa `captureStream`); TikTok tidak disinkronkan antar-tamu.

## Kontrak 6: Mode acara (suara)
`invitations.extra.mode` = `umum` | `kajian` | `pesta` (opsional). Bila kosong, dipilih dari `event_type`: tazkirah/tarannum → `kajian`, karaoke/komunitas → `pesta`, selain itu `umum` (`game/src/event-mode.js`).
- Jamaah **tidak dibisukan** di mode apa pun: obrolan dekat tetap jalan. Saat panggung (ustaz/MC/penanya yang dinaikkan MC) berbicara, obrolan jamaah dikecilkan: `umum` 30%, `kajian` 20%, `pesta` tidak dikecilkan.
- Pembicara panggung memakai mic berkualitas tinggi (preset musik 64 kbps, tanpa DTX, RED).
- Siapa yang sah menjadi pemilik/MC ditentukan server lewat token bertanda tangan (kunci per acara); penanya naik panggung hanya lewat MC (angkat tangan di Party Room).
