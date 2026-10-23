# Pemberitahuan pihak ketiga

## beautiful-water (VictorZakharov)

Sumber: https://github.com/VictorZakharov/beautiful-water

`game/src/pool-water.js` memakai ulang dan menyederhanakan ide serta potongan shader dari proyek ini
(pantulan lewat `Reflector`, tekstur derau deterministik, riak mikro, Fresnel, dan pantulan matahari GGX).
Bagian laut (gelombang Gerstner, buih, kilau, awan, langit prosedural, jalur WebGPU) sengaja tidak dibawa.

Lisensi asli:

```
MIT License

Copyright (c) 2026 beautiful-water contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## LibreCorsa (KhazP) dan ICEsim (Agent00PED) — referensi ide

- LibreCorsa: https://github.com/KhazP/librecorsa (MIT). `game/src/tyre-model.js` terinspirasi model ban bersuhu proyek ini; kode ditulis ulang dan disederhanakan, tidak disalin.
- ICEsim: https://github.com/Agent00PED/ice-simulator (README menyatakan MIT; repo tidak menyertakan berkas LICENSE). Dipakai sebagai acuan lapisan suara mesin/ban; belum ada kode yang disalin.

## Model mobil GLB (pedrosoandre/carros) — opsional, aktif dengan `?glb=1`

Sumber: https://github.com/pedrosoandre/carros (kode katalog MIT; model 3D milik pembuatnya masing-masing, diunduh dari Sketchfab dengan lisensi CC BY 4.0 atau CC BY-SA 4.0).

`game/src/glb-car-catalog.js` dan `game/src/glb-car-view.js` memakai model GLB dari katalog itu sebagai tampilan luar mobil mewah bila diaktifkan. Berkas GLB tidak disimpan di repo: `node scripts/copy-car-models.mjs <folder carros>` menyalinnya ke `game/public/cars/` beserta `credits.json` (pembuat, tautan karya asli, lisensi tiap model).

- CC BY 4.0 mewajibkan atribusi pembuat, tautan ke lisensi, dan keterangan bila model diubah. Model dari katalog sudah dikompres (weld, simplify, prune, meshopt) dan di nikora juga diskalakan, diputar, dan dipindah saat dimuat. Tampilkan isi `credits.json` di halaman publik sebelum fitur ini dibuka untuk umum.
- Model CC BY-SA (`porsche-911-carrera`, `porsche-959`, `porsche-mission`) sengaja tidak dipakai; ini dijaga oleh `glb-car-catalog.test.js`.
- Nama dan bentuk mobil nyata dimiliki pabrikannya masing-masing; model hanya dipakai untuk menampilkan kendaraan.
