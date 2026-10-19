# Pemberitahuan Pihak Ketiga (Bahan Game Horor)

Kode di bawah `game/src/horor/vendor/` dan beberapa file `game/src/horor/horor-*.js` berasal dari repo open source berlisensi MIT.
Lisensi MIT mewajibkan pemberitahuan hak cipta dan teks izin di bawah ini ikut disertakan.

## 1. rishipr/der-koloss-ce  (kode DIPAKAI)

- Sumber: https://github.com/rishipr/der-koloss-ce
- File yang dibawa: `js/collision.js` (blob c563f971af704e7bcdc2b21d1fc7305f2eddd3f0), `js/navmesh.js` (blob f10ce3d433e27c33a479aa8fc63c8e0c4f2b6e4d)
- Tujuan: tabrakan lingkaran-vs-kotak 2D dan navigasi musuh (A* di grid berlapis)

```
MIT License

Copyright (c) 2026 Vesper Tech, Inc.

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

Catatan dari NOTICE.md repo tersebut: lisensi MIT hanya mencakup kode sumber, BUKAN isi folder `assets/`.
File `assets/audio/beauty-of-annihilation.mp3` adalah milik Activision/Treyarch dan TIDAK boleh dipakai.
Nama dan karakter Call of Duty / Der Riese adalah merek dagang Activision/Treyarch.

## 2. webdevcody/survive-the-night-fps  (referensi, belum ada kode disalin)

- Sumber: https://github.com/webdevcody/survive-the-night-fps
- MIT, Copyright (c) 2026 Web Dev Cody

## 3. bridge-mind/claude-opus-5.5-zombies-game  (referensi, belum ada kode disalin)

- Sumber: https://github.com/bridge-mind/claude-opus-5.5-zombies-game
- MIT, Copyright (c) 2026 BridgeMind

## 4. justinw916-sketch/claude-zombies  (referensi, belum ada kode disalin)

- Sumber: https://github.com/justinw916-sketch/claude-zombies
- MIT, Copyright (c) 2026 Claude\Zombies contributors

Teks lisensi MIT untuk repo 2 sampai 4 identik dengan teks di atas (hanya baris hak ciptanya berbeda).
Jika kode dari repo-repo tersebut disalin, tambahkan teks lengkapnya di sini pada saat yang sama.

## 5. KantLex/yoru-no-gakko  (kode DIPAKAI, diport)

- Sumber: https://github.com/KantLex/yoru-no-gakko
- Bagian yang diport (diubah jadi modul ES, perabot sekolah dan teks Jepang dibuang):
  - `src/01-core.js` -> `game/src/horor/horor-core.js` (clamp, angDiff, pushOut, mergeMeshes, mat)
  - `src/03-textures.js` -> `game/src/horor/horor-core.js` (canvasTex, speckle, worldUV)
  - `src/05a-builder.js` -> `game/src/horor/horor-room.js` (kelas Room: dinding, pintu, gerbang, lampu, kamera tetap)
  - `src/02-audio.js` -> `game/src/horor/horor-audio.js` (mesin suara WebAudio: bus, reverb per ruangan, drone ambience, langkah, pintu, kena/tembak; semua disintesis, tanpa berkas audio)
- Tujuan: pembangun ruangan, kamera tetap, dan dasar kontrol/AI game survival horror
- Tidak dibawa: suara heroine di `audio/voice/` (dibuat dengan ElevenLabs, tunduk pada ketentuan ElevenLabs, bukan MIT), file string Mandarin/Jepang, cerita dan karakter yokai

```
MIT License

Copyright (c) 2026 KantLex

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

## Repo yang TIDAK boleh disalin kodenya (tanpa file lisensi)

- torunum/rabbit-city dan emilsvfx/dead-fog: mirip Resident Evil, tetapi tidak punya file lisensi untuk kodenya. Tanpa lisensi, hak ciptanya tetap pada pembuatnya. Hanya boleh jadi referensi ide; jangan salin kode atau aset.
