# Aset avatar manusia — sumber, lisensi, dan cara membangun ulang

## Sumber saat ini (placeholder untuk prototipe)
| Aset | Asal | Catatan |
|---|---|---|
| `game/public/models/michelle.glb` | `examples/models/gltf/Michelle.glb` di repo three.js (model Mixamo) | dikecilkan: poligon ~45%, tekstur WebP 1024px, tanpa animasi |
| `game/public/anims/library.json` | klip `Idle`, `Walk`, `Run` dari `Soldier.glb` dan `SambaDance` dari `Michelle.glb` (repo three.js, asal Mixamo) | di-retarget ke bentuk netral; jari dibuang |

**Peringatan lisensi:** kedua berkas berasal dari Mixamo (Adobe). Sebelum rilis komersial, baca ketentuan Mixamo terbaru
dan pastikan men-deploy aset tersebut di dalam aplikasi diperbolehkan. Untuk produk final sebaiknya diganti dengan model
dan animasi yang lisensinya jelas (buatan sendiri, dipesan ke seniman 3D, atau aset berlisensi komersial).
Jangan memakai desain karakter milik pihak lain (misalnya hero game lain) sebagai avatar.

## Menambah karakter manusia
1. Siapkan model berkerangka Mixamo (nama tulang `mixamorig:*`, pose-T). Karakter dari Mixamo atau Blender dengan rig yang sama cocok.
2. Taruh GLB di folder sumber, lalu tambahkan langkahnya di `tools/build-human-assets.mjs` (optimasi) atau salin hasil optimasi ke `game/public/models/`.
3. Daftarkan di dua tempat yang urutannya harus sama: `CHARACTERS` di `game/src/avatar-config.js` dan `HUMAN_MODELS` di `game/src/avatar-human.js`.
4. Semua animasi di `library.json` otomatis berlaku untuk karakter baru (retarget lewat pose-T), termasuk joget.

## Membangun ulang pustaka animasi
```
cd tools && npm install
node build-human-assets.mjs <folder-sumber-berisi Michelle.glb dan Soldier.glb> ../game/public
```

## Menambah animasi (misalnya joget lain)
Tambahkan klip Mixamo ke dokumen sumber lalu tambahkan namanya di daftar `extractClips` pada skrip. Klip akan masuk ke `library.json`;
beri pemetaan aksinya di `CLIP_FOR_ACT` pada `game/src/avatar-human.js`.

## Keterbatasan yang diketahui
- Gandengan tangan (dua avatar saling menggenggam) belum ada; butuh pose berpasangan dan penempatan tangan.
- Pakaian, rambut, dan warna kulit model manusia belum bisa diubah pemain; hanya pilihan karakter.
- Pose duduk dan aksi tangan (lambai, tepuk, salaman, hormat) dibuat prosedural dan perlu disetel secara visual per model.
