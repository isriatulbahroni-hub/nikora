# Aturan kerja untuk Claude (dan siapa pun) di repo ini

Repo ini dikerjakan banyak sesi Claude secara bergantian. Aturan ini ada supaya riwayat dan cabang tetap rapi dan tidak saling menimpa.

## Sebelum mulai
1. `git fetch --prune`, lalu cek status: `git branch -r --no-merged origin/main` dan daftar PR terbuka. Jangan mulai dari ingatan.
2. Cek dulu apakah pekerjaan yang diminta **sudah pernah masuk `main`** (cari di `git log origin/main`, PR yang sudah digabung, dan `docs/STATUS-CABANG.md`). Jangan mengerjakan ulang.
3. Jangan lanjut memakai cabang yang PR-nya sudah digabung. Buat cabang baru dari `origin/main` terbaru.

## Cabang dan PR
- **Satu cabang = satu fitur/perbaikan**, satu PR. Nama: `fitur/...`, `fix/...`, `docs/...`, `test/...`.
- Cabang selalu dibuat dari `origin/main` terbaru, dan diperbarui dari `main` sebelum PR dibuka supaya konflik selesai di cabang, bukan di `main`.
- **Jangan push langsung ke `main`.** Semua lewat PR. Jangan force-push ke cabang milik sesi lain.
- Jangan membuat cabang baru bila sudah ada cabang/PR terbuka untuk topik yang sama; lanjutkan yang ada.
- Setelah PR digabung, **hapus cabangnya**. Jangan menumpuk cabang lama.

## Commit dan push
- Kumpulkan commit secara lokal, **push sekali di akhir sesi kerja**, bukan setiap perbaikan kecil.
- **Jangan push atau gabung tanpa persetujuan pemilik repo**, kecuali pemilik menyuruh langsung.
- Sebelum push: cek status cabang dan PR-nya (sudah digabung ke `main` atau belum). Jangan push ke cabang yang sudah digabung.
- Satu perubahan yang saling terhubung harus lengkap dalam satu push: semua file baru yang di-`import` (modul, tes, data) ikut ter-commit. Cek dengan `git status` dan jalankan tes sebelum push, supaya tidak perlu commit `fix(ci)` susulan.
- Pesan commit singkat dan jelas: `feat(area): ...`, `fix(area): ...`, `test(area): ...`, `docs: ...`.

## Tes
- Jalankan `npm test --prefix game` (dan `server`/`invitation` bila disentuh) sebelum push. CI harus hijau sebelum PR digabung.
- Jangan menggabungkan PR yang CI-nya merah atau tesnya belum dijalankan.

## Hal yang tidak boleh
- Jangan menyimpan token, kunci API, atau sandi di repo, di pesan commit, atau di berkas catatan.
- Jangan menghapus cabang yang belum tergabung ke `main` tanpa persetujuan pemilik.
- Jangan membungkus ulang dan membagikan seluruh proyek untuk perubahan kecil; laporkan hanya apa yang berubah.

## Melapor
- Bahasa: Indonesia.
- Laporkan singkat: apa yang berubah, file apa, hasil tes, dan apa yang belum dikerjakan.
- Catat status cabang yang masih terbuka di `docs/STATUS-CABANG.md` setiap kali ada yang digabung atau ditutup.
