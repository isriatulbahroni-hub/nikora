# ORBIT — Laporan Audit Fase 1

> Status: **draft untuk review pemilik**. Gate Fase 1 belum disetujui. Dokumen ini hanya mencatat apa yang diverifikasi; tidak menyatakan gate lulus.

## 1.1 Inventaris repository
- Remote: `https://github.com/isriatulbahroni-hub/nikora`, branch `main` (satu-satunya).
- Commit saat audit: `4b27e84` (`feat(game): add offline 3D prototype`) di atas `1ba64b5` (`Initial commit`).
- File terlacak: `README.md` (blueprint), `docs/DETAILED_EXECUTION_ROADMAP.md`, dan `game/`.
- Tidak ada: `.github/` (CI), lisensi, tag, submodule, landing page statis (`index.html` di root tidak ada; snapshot roadmap menyebut file itu hanya ada di worktree lokal lain dan tidak terlacak).

## 1.2 Toolchain dan baseline build (Node v22.22.2, Linux x64)
| Perintah (di `game/`) | Hasil |
|---|---|
| `npm ci` | berhasil, lockfile tidak berubah |
| `npm test` | 5 tes lulus, 0 gagal |
| `npm run build` | berhasil (3,24 dtk); bundle JS 2.890 kB (gzip 1.014 kB), CSS 6,5 kB |
| `npm run test:e2e` | **tidak dapat dijalankan**: unduhan Chromium Playwright diblokir di lingkungan audit (tidak ada browser terpasang) |

Catatan: README game menyebut Node 20+; baseline ini diverifikasi di Node 22, bukan 20 atau 24.
Peringatan build: chunk > 500 kB (Rapier WASM tertanam di bundle).

Dependency: `three ^0.177.0`, `@dimforge/rapier3d-compat ^0.17.3`, `vite ^6.3.5`, `@playwright/test ^1.64.0`. Lockfile ada.

## 1.3 Matriks status fitur (berdasarkan pembacaan kode, belum dijalankan di browser)
| Fitur | Status | Bukti |
|---|---|---|
| Aturan murni (damage, cooldown, hasil, batas arena) | Berfungsi (unit test) | `game-rules.js`, 5 tes |
| Gerakan, kamera, collision (Rapier), serangan, bot lokal | Ada di kode; **belum diverifikasi runtime** | `main.js` |
| HUD health, kondisi menang/kalah, restart | Ada di kode; belum diverifikasi runtime | `main.js` |
| Kontrol sentuh (D-pad, tombol Hit) | Ada di kode; belum diverifikasi | `main.js` |
| Tes E2E desktop dan mobile | Ditulis (2 skenario), belum pernah lulus | `e2e/arena.spec.js` |
| Animasi karakter | Belum ada pada audit ini (hanya dicek lewat pencarian kode, perlu konfirmasi visual) | `main.js` |
| Multiplayer, akun, server, persistensi, CI | Belum ada | — |

## 1.4 Arsitektur aktual (as-built)
- Satu entry: `index.html` memuat `src/main.js` (501 baris, monolitik: scene, fisika, input, loop, HUD).
- `game-rules.js` adalah satu-satunya modul logika murni dan sudah terpisah dari render/jaringan (sesuai prinsip Fase 2.2).
- Tidak ada jaringan, backend, penyimpanan, atau autentikasi.
- Simulasi memakai fixed step 1/60 dengan accumulator.

## Utang teknis dan risiko (urut prioritas)
1. **Tinggi:** E2E belum pernah lulus; perilaku runtime (gerak, combat, restart) belum terbukti. Blokir gate Fase 2.
2. **Tinggi:** Tidak ada CI; build dan tes hanya dijalankan manual.
3. **Sedang:** `main.js` 501 baris tanpa pemisahan modul; logika bot, combat, dan input tercampur dengan render sehingga sulit diuji.
4. **Sedang:** Bundle 2,9 MB; belum diukur waktu muat atau FPS pada perangkat target (Android belum ditetapkan).
5. **Sedang:** Cakupan unit test hanya `game-rules.js`; tes kondisi tepi Fase 2.3 (input berulang, reset berulang, urutan aksi tidak valid) belum ada.
6. **Rendah:** Tidak ada lisensi, standar kontribusi, atau workflow branch/review tercatat.
7. **Rendah:** Versi Node yang divalidasi tidak konsisten antara README (24) dan audit ini (22).

## Tindak lanjut yang dibutuhkan
- Jalankan `npm run test:e2e` di mesin yang bisa mengunduh Chromium (`npx playwright install --with-deps chromium`) lalu lampirkan hasilnya.
- Keputusan pemilik: target perangkat Android, dan apakah Three.js + Rapier disetujui sebagai pilihan engine prototipe.
- Pemilik menyetujui atau menolak gate Fase 1 setelah poin di atas.
