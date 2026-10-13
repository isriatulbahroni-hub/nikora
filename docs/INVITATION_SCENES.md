# Isi Undangan: adegan dan tema

Semua teks dari editor (`invitation_scenes.config`) dan `invitations.extra` disaring di `invitation/src/engine/content.js` (teks bersih, panjang dibatasi, tautan hanya `https`). Adegan tidak pernah memakai `innerHTML`. Bila editor tidak mengisi apa pun, dipakai teks bawaan per jenis acara.

## Adegan (urutan bawaan: amplop, surat, cover, kisah, detail, galeri, ..., penutup)
| kind | File | Isi | Dilewati bila |
|---|---|---|---|
| `surat` | `scenes/surat.js` | salam, sapaan tamu, paragraf, tuan rumah, tanda tangan | tidak pernah |
| `cover` | `scenes/cover.js` | nama, tanggal, hitung mundur hidup, pemandangan 3 lapis (parallax) | tidak pernah |
| `kisah` | `scenes/kisah.js` | kartu cerita geser mendatar | `items` kosong |
| `detail` | `scenes/detail.js` | kartu acara, tombol peta, simpan ke kalender (.ics), busana, catatan | tidak ada acara (tanpa `events` dan tanpa `event_date`) |
| `galeri` | `scenes/galeri.js` | karusel 3D, geser, zoom | `images` kosong |
| `hari_acara` | `scenes/hari.js` | status hidup (segera/berlangsung/selesai), susunan acara, siaran langsung, pintu ke dunia 3D | di luar jendela 24 jam sebelum sampai 6 jam sesudah acara (kecuali `always: true`) |
| `penutup` | `scenes/penutup.js` | ucapan terima kasih, doa, tanda tangan | tidak pernah |
| `arsip` | `scenes/arsip.js` | foto pilihan, ucapan tamu, tautan ke dunia kenangan | acara belum lewat 6 jam sesudah selesai (kecuali `always: true`) |

Adegan kosong menandai diri `skipped` dan dilewati mesin tanpa transisi.

## Config per adegan (semua opsional)
Semua adegan menerima `tokens` (warna, sama dengan amplop), `eyebrow`, `title`, `cta`.
- `surat`: `greeting`, `paragraphs[]` (maks 5), `hosts`, `close`, `signature`, `toPrefix`. Placeholder: `{nama}`, `{tanggal}`.
- `cover`: `tagline`, `countdown` (`false` mematikan hitung mundur).
- `kisah`: `items[]` maks 8, tiap item `{ when, title, text }`.
- `detail`: `events[]` maks 6, tiap acara `{ label, start (ISO), time, venue, address, mapUrl (https), note, duration (menit) }`, `dressCode`, `notes[]`. Tanpa `events`, dipakai `invitations.event_date` + `extra.venue {name, address, mapUrl}`.
- `galeri`: `images[]` maks 12, tiap foto `{ src (https), alt, caption }`. `placeholder: true` memakai kotak warna tema (untuk demo).
- `hari_acara`: `rundown[]` maks 10 `{ time, title, start (ISO, untuk penanda "sekarang") }`, `streamUrl` (https), `always`.
- `arsip`: `body`, `messages[]` maks 6 `{ name, text }`, `images[]` (jika kosong memakai foto galeri), `always`.
- `penutup`: `body`, `sign`, `signature`, `hosts`.

`invitations.extra` yang kini dibaca: `title`, `tz`, `world`, `hosts`, `dressCode`, `venue`, `events`.

## Tema
Satu objek di `THEMES` (`themes/index.js`). Field baru `scenery` memilih pemandangan cover: `lumbung`, `masjid`, `taman`, `istana`, `pulau`, `bukit`, `kota`, `balon`, `panggung` (resep di `engine/scenery.js`, diwarnai token tema). Setiap jenis acara punya tema bawaan di `DEFAULT_THEME`.

Tema baru: `khitanan-ksatria`, `khitanan-langit`, `tazkirah-teduh`, `tazkirah-nur`, `ulang_tahun-balon`, `ulang_tahun-pahlawan`, `tarannum-nada`, `karaoke-panggung`, `komunitas-kota`.
Setelah mengubah tema jalankan `node game/scripts/sync-event-themes.mjs` (kontrak 4 di INTEGRATION.md).

## Mencoba
`cd invitation && npm run dev`, lalu buka `/?tema=<id tema>`; pemilih tema di bawah layar memuat semua tema dengan data contoh lengkap (`engine/demo.js`).

## Terasa hidup
- **Teks 3D** (`engine/text3d.js`): judul dipecah per huruf, terbang masuk dengan kedalaman, melayang pelan, dan ketebalan (extrude) bergeser mengikuti kemiringan layar. `aria-label` memuat teks utuh. Teks lebih dari 64 huruf tidak dipecah.
- **Kemiringan**: `--px/--py` (-1..1) dari jari/kursor atau sensor gerak ponsel (iOS meminta izin pada sentuhan pertama). Dipakai pemandangan (parallax), teks, lembar surat, dan kartu.
- **Tokoh kecil** (`engine/avatars.js`): pengantin/anak/qari/penyanyi berdiri di cover (berkedip, bergoyang, melambai); tamu kecil berjalan di dasar adegan lain, satu membawa papan nama tamu.
- **Langit hidup**: awan dan burung melintas, jendela gedung berkelip.
- Mode ringan (`?ringan=1`) dan `prefers-reduced-motion` mematikan animasi, tokoh jalan, dan sensor.

## Studio: Isi undangan
Di detail undangan, tombol "Isi undangan" membuka editor per adegan (`studio/editor.js`). Disimpan ke `invitation_scenes.config` lewat PATCH (RLS: hanya pemilik). Foto galeri diunggah dari ponsel: dikecilkan di peramban (maks 1600 px, JPEG, EXIF/GPS hilang) lalu masuk bucket publik `media` di folder `<user id>/galeri/<slug>/`. Waktu acara diisi di zona waktu undangan (`extra.tz`) dan disimpan sebagai ISO UTC.

## Pratinjau langsung di Studio
Editor "Isi undangan" menampilkan undangan asli di dalam bingkai (`/?slug=...&preview=1&frame=1`). Di ponsel ada tombol Edit | Pratinjau; di layar lebar dua kolom berdampingan. Tiap ketikan (jeda 450 ms) dikirim ke bingkai lewat `postMessage` dan undangan diputar ulang mulai dari adegan yang sedang diedit. Adegan yang masih kosong menampilkan catatan, bukan melompat ke adegan lain.

Keamanan (`src/preview-frame.js`): bingkai hanya menerima pesan dari `window.parent` dengan asal (origin) yang sama; jenis adegan harus dikenal, config berupa objek dan maks 24 KB. Teks tetap disaring `content.js` saat dirender. Halaman tamu biasa (tanpa `frame=1`) tidak mendengarkan pesan apa pun.

## Keluar dari Studio
Bilah atas Studio (setelah masuk) punya tombol **Keluar** di semua layar. Alurnya (`studio/exit.js`): tanya dulu bila ada isian belum tersimpan, hapus sesi di perangkat lalu cabut di server (`/auth/v1/logout`), lalu:
- bila `VITE_EXIT_URL` (https) diisi, pindah ke alamat itu (meninggalkan situs);
- bila kosong, tampil layar "Kamu sudah keluar" dan halaman mencoba menutup tab (peramban hanya mengizinkan itu untuk tab yang dibuka lewat skrip).
Menutup tab atau pindah situs saat ada isian belum tersimpan memunculkan peringatan peramban.
