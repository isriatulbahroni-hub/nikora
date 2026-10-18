# Menambah hero Mansion Horor

Hero adalah model Mixamo (GLB). Pemain memilih salah satu lewat pemilih hero.

## Langkah

1. Siapkan GLB dengan klip bernama persis: `Idle`, `CrouchWalk`, `Run`, `WalkTurnLeft`, `HitReaction`, `Die`.
   Klip `Walk` opsional. Klip yang tidak ada akan dicarikan pengganti (`Run` diperlambat, atau `Idle`).
2. Unggah ke `game/public/models/horor/`, misalnya `kirana-merah.glb`.
3. Selesai. Saat dev/build, `scripts/gen-hero-manifest.mjs` membuat `models/horor/heroes.json` otomatis.
   Nama tampilan diambil dari nama berkas: `kirana-merah.glb` menjadi "Kirana Merah".

`hero.glb` adalah hero bawaan dan selalu tampil pertama. Berkas selain `.glb` diabaikan.

## Cek setelah deploy

Buka `/models/horor/heroes.json` di situs. Isinya harus memuat semua hero yang diunggah. Kalau hanya `hero`,
berarti build tidak menjalankan `npm run build` (skrip `prebuild` tidak jalan). Periksa Build Command di Vercel.

## Memakai di kode game

```js
import { loadHeroList, heroPath } from './horor-heroes.js';
import { createHeroPicker } from './horor-hero-picker.js';
import { createHero } from './horor-hero.js';

const list = await loadHeroList({ base: import.meta.env.BASE_URL });
const picker = createHeroPicker({ container, list, storage: localStorage, onPick: (hero) => { /* ganti hero */ } });
const hero = await createHero(heroPath(picker.hero));
```

## Avatar profil utama (seperti Michelle)

Daftar karakter ada di `game/src/avatar-roster.js`. Unggah GLB ke `game/public/models/`, lalu tambahkan satu baris di sana.
Tambah hanya di akhir dan jangan ubah urutan, karena urutan menjadi nomor karakter di jaringan dan di penyimpanan pemain.
