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
| `penutup` | `scenes/penutup.js` | ucapan terima kasih, doa, tanda tangan | tidak pernah |

Adegan kosong menandai diri `skipped` dan dilewati mesin tanpa transisi.

## Config per adegan (semua opsional)
Semua adegan menerima `tokens` (warna, sama dengan amplop), `eyebrow`, `title`, `cta`.
- `surat`: `greeting`, `paragraphs[]` (maks 5), `hosts`, `close`, `signature`, `toPrefix`. Placeholder: `{nama}`, `{tanggal}`.
- `cover`: `tagline`, `countdown` (`false` mematikan hitung mundur).
- `kisah`: `items[]` maks 8, tiap item `{ when, title, text }`.
- `detail`: `events[]` maks 6, tiap acara `{ label, start (ISO), time, venue, address, mapUrl (https), note, duration (menit) }`, `dressCode`, `notes[]`. Tanpa `events`, dipakai `invitations.event_date` + `extra.venue {name, address, mapUrl}`.
- `galeri`: `images[]` maks 12, tiap foto `{ src (https), alt, caption }`. `placeholder: true` memakai kotak warna tema (untuk demo).
- `penutup`: `body`, `sign`, `signature`, `hosts`.

`invitations.extra` yang kini dibaca: `title`, `tz`, `world`, `hosts`, `dressCode`, `venue`, `events`.

## Tema
Satu objek di `THEMES` (`themes/index.js`). Field baru `scenery` memilih pemandangan cover: `lumbung`, `masjid`, `taman`, `istana`, `pulau`, `bukit`, `kota`, `balon`, `panggung` (resep di `engine/scenery.js`, diwarnai token tema). Setiap jenis acara punya tema bawaan di `DEFAULT_THEME`.

Tema baru: `khitanan-ksatria`, `khitanan-langit`, `tazkirah-teduh`, `tazkirah-nur`, `ulang_tahun-balon`, `ulang_tahun-pahlawan`, `tarannum-nada`, `karaoke-panggung`, `komunitas-kota`.
Setelah mengubah tema jalankan `node game/scripts/sync-event-themes.mjs` (kontrak 4 di INTEGRATION.md).

## Mencoba
`cd invitation && npm run dev`, lalu buka `/?tema=<id tema>`; pemilih tema di bawah layar memuat semua tema dengan data contoh lengkap (`engine/demo.js`).
