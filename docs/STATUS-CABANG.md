# Status cabang repo nikora

Diperbarui: 29 Okt 2026. Dibuat saat perapian cabang: 122 cabang yang sudah 100% masuk `main` dihapus (158 menjadi 35 cabang). Daftar di bawah adalah yang **belum** tergabung. Cek ulang dengan `git branch -r --no-merged origin/main` sebelum bertindak; berkas ini bisa tertinggal.

Kolom *Merge ke main*: hasil uji merge virtual (`git merge-tree`) pada tanggal di atas. Bersih = tidak ada konflik, Konflik = perlu diselesaikan manual.

## A. PR masih terbuka
| Cabang | PR | Merge ke main | Catatan |
|---|---|---|---|
| `fitur/jalan-lebar-putar-balik` | #122 | Konflik | mobil: gigi tanpa syarat, perjalanan tanpa batas waktu, Bugatti sesuai data pabrik |
| `fix/avatar-duduk-klip-asli` | #95 | Konflik | avatar duduk memakai klip Mixamo asli |
| `feat/parkir-mewah` | #136 | Konflik | PR #132 sudah digabung; 3 dari 5 commit sisa sudah ada di main |

## B. PR-nya sudah digabung, tetapi ada commit sisa yang dipush sesudahnya
Isi utama sudah di `main`; hanya commit sesudah merge yang belum masuk. Perlu dicek satu per satu apakah masih relevan atau sudah tergantikan.
| Cabang | PR digabung | Merge ke main |
|---|---|---|
| `fitur/hotel-menara-kristal` | #76 | Konflik |
| `fitur/hotel-sekitar-menara` | #94, #96 | Konflik |
| `fitur/kamera-multi-mode` | #98 | Konflik |
| `fitur/pintu-atap-lampu` | #119 | Konflik |
| `fitur/satu-dunia-hotel-perjalanan` | #105, #110 | Konflik |
| `fix-duduk-tidur` | #35 | Konflik (1 dari 2 commit sudah ada) |
| `fix/mobil-landscape-setir` | #102 | Konflik |
| `hotel/denah-parametrik` | #78 | Bersih |
| `tambah-karakter-jaket` | #69 | Konflik (2 dari 3 commit sudah ada) |
| `fitur/hotel-15-lantai` | #44, #56 (#66 ditutup) | Konflik |

## C. Tanpa PR, pekerjaan belum masuk
| Cabang | Isi | Merge ke main |
|---|---|---|
| `fitur/hotel-dunia-3d` | halaman dunia hotel 15 lantai (9 commit) | Konflik |
| `fitur/hotel-menara-acuan` | menara ramping berfaset sesuai gambar acuan (7 commit) | Konflik |
| `fitur/kartu-checkin-game` | kartu check-in kamar butuh kartu admin (8 commit) | Konflik |
| `fitur/akun-staf-admin` | akun staf, login, formulir akun | Bersih |
| `fitur/duduk-tidur-hotel` | duduk dan tidur per perabot hotel | Bersih |
| `fitur/masjid-agung` | Masjid Agung: renderer, halaman, kontrol | Konflik |
| `fitur/mobil-glb-carros` | model GLB mobil mewah (opsional, `?glb=1`) | Konflik |
| `fitur/mobil-vila-izin-admin` | mobil di parkir villa, izin admin | Konflik |
| `feat/bulu-tangkis-manusia` | bulu tangkis manusia lawan manusia | Konflik |
| `perbaikan-pukulan-tahan` | tombol Pukul bisa ditahan | Bersih |
| `feat/isi-undangan` | isi undangan: adegan, 9 tema | Konflik |
| `feat/kartu-bank` | kartu bank bergaya mewah | Konflik |
| `fitur/horor-game` | logika horor: pintu, denah Rumah Tua | Konflik |
| `docs/perbarui-readme` | perbarui README | Konflik |
| `perbaikan/ci-merah-main` | perbaikan tes (palem lapangan, aksesori avatar) | Konflik |
| `perbaiki/tes-spotpose` | perbaikan tes spotPose | Konflik |

## D. PR ditutup tanpa digabung
| Cabang | PR | Merge ke main |
|---|---|---|
| `fitur/checkin-kartu-admin` | #55 | Bersih |
| `fitur/hotel-villa-gabung` | #67 | Bersih |
| `fitur/lift-e2e` | #63 | Bersih |

## E. Lain-lain
- `fitur/karyawan-di-jalan`: cabang baru tanpa PR, mungkin sedang dikerjakan sesi lain. Jangan dihapus.
- `fix/moba-origin-roney-biz-id`: isinya sudah ada di `main` (perubahan sudah terpasang), aman ditutup.

## Aturan
Lihat `CLAUDE.md`. Setiap kali cabang digabung atau ditutup, perbarui berkas ini.
