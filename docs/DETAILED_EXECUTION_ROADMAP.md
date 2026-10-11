# ORBIT — Detailed Execution Roadmap

> Dokumen turunan dari [master blueprint](../README.md). Dokumen ini merinci urutan eksekusi Fase 0–14; bukan spesifikasi modul lengkap, backlog siap sprint, jadwal bertanggal, atau bukti bahwa fitur telah dibuat.

## Status dan batas dokumen

- Ruang lingkup dokumen ini: subfase, tugas utama, keluaran, dependensi, dan gate untuk setiap fase.
- Deliverable Module-by-Module Roadmap, System Dependency Map, Milestone & Release Plan, Implementation Backlog, serta Documentation & Quality Gates tetap menjadi dokumen lanjutan dan tidak diduplikasi di sini.
- Tidak ada estimasi kalender atau biaya nominal. Keduanya memerlukan hasil audit, target perangkat, pilihan engine/provider, kapasitas tim, dan asumsi penggunaan.
- Roadmap ini disusun sebelum proyek game dimulai. Setelah itu, atas instruksi pengguna, Fase 2 dimulai sebagai subproyek terpisah di `game/`; status terkini dicatat di bawah.

### Snapshot repository yang diketahui

Pemeriksaan baca-saja pada 2026-10-11 menemukan:

- Remote `origin` mengarah ke `https://github.com/isriatulbahroni-hub/nikora`; branch `main` dapat diakses dan berada pada commit awal `1ba64b5`.
- Pada commit remote tersebut hanya `README.md` yang dilacak. Worktree lokal mempunyai README yang berubah serta `index.html`, `style.css`, `script.js`, dan `favicon.svg` yang belum dilacak.
- File lokal membentuk landing page statis. Tidak ditemukan proyek atau konfigurasi engine game, manifest dependensi/build, test suite, atau workflow CI.
- Preview statis memberi HTTP 200 untuk halaman dan aset; `node --check script.js` lulus. Ini memverifikasi halaman statis, bukan game atau gameplay.

Snapshot ini bukan audit lengkap. Fase 1 wajib memperbarui bukti dari repository, branch, dan sumber proyek yang benar sebelum keputusan implementasi dibuat. Jika proyek game berada di repository lain, pemilik harus memberikan lokasinya dan aksesnya harus diverifikasi. Jika tidak ditemukan, keputusan untuk memulai proyek game baru memerlukan persetujuan eksplisit setelah audit.

### Pembaruan status setelah snapshot

Atas instruksi pengguna, proyek offline pertama kini berada di `game/` dan memakai Three.js untuk render serta Rapier untuk physics. Ini adalah bootstrap prototipe browser/PC yang terpisah dari landing page, bukan bukti bahwa pilihan engine final untuk seluruh platform telah disetujui.

- 5 unit test gameplay lulus; production build lulus; audit dependency melaporkan 0 kerentanan.
- Rapier ESM/WASM dan satu langkah simulasi capsule telah lolos smoke test di Node.
- Playwright desktop/mobile belum lulus: Chromium tidak dapat diluncurkan karena container tidak memiliki `libatk-1.0.so.0`.
- Gate Fase 1 belum dinyatakan lulus dan gate Fase 2 belum lulus. Belum ada multiplayer, server game, akun, atau sinkronisasi online di prototipe ini.

### Pembaruan status Fase 3 (awal)

- `server/` berisi server WebSocket otoritatif (satu ruang, hingga 50 pemain) dengan 12 tes lulus: sinkronisasi dua klien, input tidak valid, anti speed-hack, payload besar, rate limit, ruang penuh.
- `game/src/net-client.js` adalah klien jaringan, dan `game/src/multiplayer-view.js` menampilkan pemain lain di scene (aktif lewat `?server=`). Keduanya dites terhadap server di Node (14 tes game lulus), tetapi belum diuji di browser sungguhan.
- Belum ada: reconnect, simulasi latency/packet loss, akun, uji browser. Gate Fase 2 dan Fase 3 belum lulus.

### Aturan gate

1. Fase berjalan berurutan. Pekerjaan dokumentasi yang tidak mengubah sistem boleh disiapkan lebih awal, tetapi tidak menggantikan gate.
2. Gate hanya berstatus lulus jika keluarannya tersedia, bukti pengujian dapat diperiksa, risiko terbuka dicatat, dan pemilik yang ditunjuk menyetujui hasilnya.
3. Gate gagal atau tertahan menghentikan pekerjaan yang bergantung padanya. Catat alasan, pemilik tindak lanjut, dan bukti yang diperlukan untuk membuka kembali fase.
4. Perubahan berisiko pada autentikasi, transaksi, multiplayer, data pengguna, atau keamanan memerlukan pemeriksaan khusus dan rencana rollback.
5. Hasil sebuah fase harus dapat direproduksi dari branch dan commit yang dicatat; jangan menyamakan mockup, placeholder, atau dokumentasi dengan implementasi.

## Fase 0 — Product Discovery

**Tujuan:** menetapkan produk dan prototipe pertama yang benar-benar akan dibangun.

### 0.1 — Keputusan produk dan pengguna awal
- Tegaskan visi, prinsip yang tidak dapat ditawar, non-goal, dan masalah pengguna yang ingin diselesaikan.
- Bandingkan kebutuhan pemain, kreator, dan penyelenggara acara; pilih segmen awal dan persona yang akan diuji.
- Petakan alternatif dan kompetitor berdasarkan pekerjaan pengguna, bukan sekadar daftar nama.
- **Keluaran:** keputusan produk, segmen awal, persona, non-goal, serta ringkasan riset dan asumsi.

### 0.2 — Pengalaman awal dan platform
- Petakan perjalanan dari pengunjung/tamu sampai aktivitas inti pertama; tentukan titik autentikasi dan batas guest access.
- Putuskan prioritas browser/PC dan target perangkat Android berdasarkan perangkat nyata serta keterbatasan performa.
- Periksa hak penggunaan aset, musik, font, dan media yang akan dipakai dalam prototipe.
- **Keluaran:** peta perjalanan, matriks platform/perangkat, dan daftar aset berlisensi atau yang perlu diganti.

### 0.3 — Ruang lingkup, keberhasilan, dan risiko
- Pilih satu pengalaman end-to-end untuk prototipe pertama; kategorikan fitur wajib, penting, dan futuristik.
- Tentukan hipotesis dan indikator keberhasilan yang bisa diamati; pisahkan metrik produk dari metrik teknis.
- Identifikasi pendorong biaya awal seperti perangkat target, multiplayer, bandwidth, storage, voice, dan tooling; catat asumsi tanpa mengarang angka.
- **Keluaran:** ruang lingkup MVP, acceptance criteria tingkat produk, indikator awal, daftar risiko/asumsi, dan estimasi kasar dengan dasar yang dinyatakan.

### 0.4 — Review dan persetujuan PRD
- Gabungkan hasil di atas menjadi PRD yang merujuk blueprint, tidak menyalin ulang seluruhnya.
- Tinjau konflik, istilah ambigu, dependensi, aksesibilitas, privasi, dan batas prototipe.
- **Keluaran:** PRD versi bernomor, daftar keputusan, dan daftar pertanyaan yang belum terjawab.
- **Gate Fase 0:** PRD disetujui oleh pemilik produk; target pengguna, pengalaman prototipe, batas MVP, platform target, dan acceptance criteria tidak menyisakan ambiguitas besar.

## Fase 1 — Audit Proyek dan Technical Foundation

**Tujuan:** menetapkan baseline faktual sebelum mengulang pekerjaan atau memilih arsitektur final.

### 1.1 — Inventaris repository dan sumber proyek
- Catat URL remote, branch aktif, status worktree, commit, tag, submodule, lisensi, dan file tracked/untracked.
- Cari semua aplikasi, proyek game, engine, asset source, tools, dan konfigurasi di repository yang diberikan.
- Jika game ada di repository lain, catat remote, branch, commit, kepemilikan, dan izin aksesnya.
- **Keluaran:** inventaris repository dan matriks lokasi proyek.

### 1.2 — Toolchain, dependency, dan build baseline
- Identifikasi versi engine, SDK, compiler, runtime, dependency, lockfile, variabel lingkungan yang diperlukan, dan dukungan platform.
- Jalankan instalasi/build bersih dengan instruksi yang dapat diulang; jangan mengubah lockfile atau menaikkan versi tanpa mencatat dampaknya.
- Jalankan semua test/lint/static checks yang memang tersedia dan simpan hasil, command, lingkungan, serta commit.
- **Keluaran:** laporan versi, dependency inventory, instruksi build bersih, log build/test, dan daftar prasyarat yang hilang.

### 1.3 — Verifikasi perilaku aktual
- Jalankan aplikasi pada target yang tersedia; bedakan fitur berfungsi, parsial, mockup, placeholder, rusak, dan belum ada.
- Reproduksi crash, error console, masalah input, performa, penyimpanan, dan batas perangkat; sertakan langkah reproduksi.
- Periksa apakah klaim halaman/README cocok dengan perilaku yang benar-benar dapat diamati.
- **Keluaran:** feature-status matrix dan issue list dengan severity, bukti, dampak, serta reproduksi.

### 1.4 — Arsitektur aktual dan tata kerja
- Gambar batas modul, aliran data, entry point, persistensi, API, autentikasi, serta dependency aktual; jangan menggambar target sebagai kondisi sekarang.
- Susun utang teknis, standar kode awal, workflow branch/review, cara menjalankan, dan cara menguji.
- Prioritaskan masalah berdasarkan keamanan, blokir build, kehilangan data, regresi, risiko biaya, dan penghambat fase berikutnya.
- **Keluaran:** audit report, diagram as-built, daftar utang teknis, baseline, standar kontribusi awal, dan risk register terurut.
- **Gate Fase 1:** sumber proyek telah dipastikan; build/test baseline dapat direproduksi atau blocker terukur; fitur nyata dibedakan dari placeholder; masalah awal memiliki prioritas dan pemilik. Jangan melewati gate ini dengan menganggap landing page sebagai game.

## Fase 2 — Prototipe Game Offline

**Tujuan:** membuktikan gameplay dasar menyenangkan dan stabil secara lokal, tanpa server multiplayer.

### 2.1 — Kerangka playable dan kontrol
- Berdasarkan audit, pertahankan atau siapkan entry point game yang disetujui; konfirmasi engine dan target build sebelum implementasi.
- Implementasikan input keyboard, kontrol mobile bila menjadi target, gerakan karakter, kamera, dan pengaturan input.
- **Keluaran:** build lokal yang dapat dimainkan dengan kontrol terdokumentasi dan tes gerakan/kamera.

### 2.2 — Aturan dan interaksi lokal
- Tambahkan collision, health/damage, combat, cooldown yang relevan, animasi dasar, objek interaktif, dan NPC/bot sederhana.
- Pisahkan aturan/gameplay logic dari transport jaringan agar dapat digunakan konsisten pada mode lokal dan online.
- **Keluaran:** simulasi pertandingan lokal dengan aturan yang dapat diuji tanpa koneksi.

### 2.3 — Siklus pertandingan dan feedback
- Implementasikan kondisi menang/kalah, reset pertandingan, HUD, serta logging kesalahan yang membantu reproduksi.
- Uji kondisi tepi: input berulang, batas arena, target hilang, health minimum/maksimum, reset berulang, dan urutan aksi tidak valid.
- **Keluaran:** skenario gameplay lengkap dan tes otomatis/manual dengan hasil yang tercatat.

### 2.4 — Stabilitas platform prototipe
- Build bersih pada platform target yang telah dipilih; ukur frame rate, waktu muat, dan memori pada perangkat representatif.
- Kumpulkan umpan balik terstruktur untuk menilai apakah pengalaman inti menyenangkan, bukan hanya berfungsi.
- **Keluaran:** build bernomor, hasil test, isu runtime, dan evaluasi gameplay.
- **Gate Fase 2:** gameplay inti berjalan stabil; hasil pertandingan/reset konsisten; tes gerakan dan combat lulus; masalah runtime utama diketahui dan ditangani; build platform target dapat diulang. Tidak membuktikan keamanan atau sinkronisasi online.

## Fase 3 — Vertical Slice Multiplayer

**Tujuan:** membuktikan satu skenario online kecil dari dua klien hingga hasil server yang disahkan.

### 3.1 — Kontrak dan server sesi minimum
- Definisikan pesan, versi protokol, input yang diterima, state server, batas ukuran/frekuensi, timeout, dan model otoritas.
- Implementasikan server sesi minimum dengan validasi input dan logging sesi; pisahkan transport dari aturan gameplay bersama.
- **Keluaran:** protokol berversi, server sesi, dan tes kontrak/validasi.

### 3.2 — Alur dua klien dan sinkronisasi
- Hubungkan minimal dua klien pada satu skenario; sinkronkan posisi dan interaksi melalui state/hasil server.
- Tentukan tick/snapshot dan interpolasi yang sesuai dari pengukuran; tambahkan prediction/reconciliation hanya bila dibutuhkan dan dapat diuji.
- Tangani reconnect, timeout, pemain keluar, serta kondisi server berhenti.
- **Keluaran:** alur multiplayer lokal/jarak jauh yang terdokumentasi dan log diagnostik.

### 3.3 — Pengujian jaringan dan otoritas
- Simulasikan latency dan packet loss; uji disconnect, input tidak valid, paket terlambat/berulang, dan server mati.
- Bandingkan hasil pada klien; pastikan kemenangan, damage, reward, dan state bernilai tidak dipercaya dari klien.
- **Keluaran:** laporan skenario jaringan, defect, dan bukti hasil server-authoritative.
- **Gate Fase 3:** dua atau lebih klien menyelesaikan skenario secara konsisten; server menentukan hasil penting; reconnect/failure tidak merusak sesi lain; isu kritis terbuka ditutup atau disetujui secara eksplisit.

## Fase 4 — Akun dan Identitas

**Tujuan:** pengguna dapat masuk kembali dengan identitas yang sama dan data terlindungi.

### 4.1 — Model identitas dan autentikasi
- Finalisasi kebutuhan autentikasi, pemulihan akun, sesi, perangkat, profil, nama tampilan, dan privasi.
- Implementasikan registrasi/login/logout serta lifecycle sesi; pilih mekanisme berdasarkan threat model dan target platform.
- **Keluaran:** kontrak identitas/API dan alur autentikasi yang dapat diuji.

### 4.2 — Otorisasi dan abuse controls
- Tambahkan validasi input/otorisasi server, kontrol akses data milik pengguna, proteksi brute force, dan audit keamanan.
- Uji akses lintas pengguna, sesi dicabut/kedaluwarsa, pemulihan akun, dan tindakan tanpa izin.
- **Keluaran:** matriks role/ownership dan bukti pengujian otorisasi.
- **Gate Fase 4:** alur akun berfungsi; akses tidak sah ditolak; kepemilikan data, sesi, dan pengujian otorisasi lulus.

## Fase 5 — Dunia Sosial Minimum

**Tujuan:** pengguna dapat menggunakan satu hub bersama dan bersosialisasi dengan aman.

### 5.1 — Hub dan lifecycle sesi dunia
- Bangun satu hub virtual, spawn, masuk/keluar, pergerakan bersama, interaksi dasar, dan daftar pemain.
- Tentukan kapasitas awal, instancing, dan batas data yang terlihat tiap pemain.
- **Keluaran:** world session minimum dan skenario load awal.

### 5.2 — Fitur sosial minimum
- Tambahkan teman awal, undangan ruang, chat teks, presence yang diperlukan, dan pengaturan privasi.
- Implementasikan block/report serta batas komunikasi sesuai izin.
- **Keluaran:** alur sosial dua pengguna beserta kontrol privasi/moderasi.

### 5.3 — Konsistensi dan kapasitas awal
- Uji pengguna masuk/keluar, reconnect, spam, kapasitas awal, dan isolasi sesi antar pengguna.
- **Keluaran:** laporan kapasitas dan defect lintas sesi.
- **Gate Fase 5:** pengguna dapat masuk, bergerak, berinteraksi, berkomunikasi, serta keluar tanpa merusak sesi pengguna lain; privasi dan block/report bekerja.

## Fase 6 — Voice dan Realtime Communication

**Tujuan:** menghadirkan komunikasi suara yang stabil, dapat dimoderasi, dan privat.

### 6.1 — Pilihan transport suara dan signaling
- Tetapkan kebutuhan kualitas, region, biaya, privasi, dan kapasitas; evaluasi SFU/provider sebelum memilih.
- Rancang signaling, lifecycle room/channel, izin mikrofon, dan penyimpanan konfigurasi tanpa menaruh rahasia provider di client.
- **Keluaran:** keputusan teknologi dengan alasan, diagram signaling, serta model biaya/asumsi.

### 6.2 — Pengalaman suara dan kontrol
- Implementasikan join/leave, audio jarak, channel grup, mute/block, volume, izin perangkat, dan reconnect.
- Tangani pergantian/perangkat audio hilang dan status izin yang berubah.
- **Keluaran:** alur audio dengan kontrol privasi yang terlihat dan dapat dites.

### 6.3 — Kualitas, moderasi, dan jaringan buruk
- Ukur kualitas suara; uji jitter, packet loss, perpindahan perangkat, mute/block, serta akses tanpa izin.
- **Keluaran:** hasil pengujian kualitas, privasi audio, dan prosedur moderasi.
- **Gate Fase 6:** voice stabil pada skenario target; kontrol privasi benar-benar berlaku; kualitas, kegagalan, dan biaya terukur.

## Fase 7 — MOBA dan Game Mode Pertama

**Tujuan:** membangun permainan kompetitif dengan identitas dan aturan yang tervalidasi server.

### 7.1 — Desain mode dan konten kompetitif
- Tetapkan rulebook, map, tim, karakter, skill/cooldown, kondisi start/end, statistik, dan sasaran keseimbangan.
- Uji prototipe aturan dan map sebelum mengembangkan banyak karakter/konten.
- **Keluaran:** game design specification, aset minimum berlisensi, dan rencana balance test.

### 7.2 — Match lifecycle server-authoritative
- Implementasikan lobi, matchmaking, tim, start/end match, server-side health/damage/cooldown, reconnect, dan penanganan pemain keluar.
- Simpan hasil/statistik dan keluarkan reward hanya dari hasil yang divalidasi server.
- **Keluaran:** alur match online dan catatan hasil yang dapat diaudit.

### 7.3 — Fairness, anti-cheat, dan skala pertandingan
- Tambahkan pelaporan dan anti-cheat awal; uji manipulasi input/state, fairness, eksploitasi, kapasitas pertandingan, dan keseimbangan.
- **Keluaran:** laporan fairness/capacity, daftar eksploitasi, mitigasi, serta aturan respons.
- **Gate Fase 7:** pertandingan dapat diselesaikan online; hasil ditentukan server; eksploitasi kritis yang diketahui ditangani atau dibatasi secara terdokumentasi.

## Fase 8 — Livestream dan Dunia Acara

**Tujuan:** satu acara dapat dibuat, dibagikan, dihadiri, disiarkan, dan ditutup dengan aman.

### 8.1 — Lifecycle acara dan akses
- Implementasikan event, host/guest, undangan, RSVP, hak akses, ruang acara, dan status lifecycle.
- Tentukan akses penonton, privasi media, hak siar, rekaman, dan kebijakan arsip.
- **Keluaran:** spesifikasi lifecycle serta alur event yang dapat diuji tanpa streaming.

### 8.2 — Pengalaman live
- Tambahkan panggung, integrasi livestream, mode penonton, sinkronisasi audio/video, reaksi, subtitle, galeri, dan buku tamu sesuai izin.
- **Keluaran:** satu skenario acara live end-to-end dengan moderasi.

### 8.3 — Kapasitas dan kegagalan streaming
- Uji kapasitas penonton, kegagalan provider, reconnect, audio/video terlambat, hak siar, rekaman, dan moderasi live.
- **Keluaran:** laporan kegagalan, prosedur penghentian aman, dan bukti pemulihan.
- **Gate Fase 8:** satu acara lengkap dapat dibuat, dibagikan, dihadiri, disiarkan, dimoderasi, dan ditutup dengan aman.

## Fase 9 — Creator Studio

**Tujuan:** kreator membuat, menyimpan, menguji, dan menerbitkan dunia tanpa akses internal yang tidak diizinkan.

### 9.1 — Proyek, template, dan editor dasar
- Rancang format project dan lifecycle simpan/buka; sediakan template dunia, placement/transform objek, undo/redo, preview, dan batas ukuran.
- **Keluaran:** editor dasar dengan project yang dapat dibuka kembali.

### 9.2 — Aset, izin, dan kolaborasi
- Implementasikan pengelolaan aset, lisensi, hak/role, kolaborator terbatas, validasi performa, dan versioning.
- **Keluaran:** matriks izin creator dan hasil uji batas resource.

### 9.3 — Validasi, moderasi, dan publikasi
- Tambahkan review/moderasi, publish/unpublish, penarikan konten, serta pemeriksaan akses internal.
- Uji proyek rusak/besar, aset tidak berizin, perubahan versi, dan pemulihan draft.
- **Keluaran:** alur publikasi beserta audit trail.
- **Gate Fase 9:** kreator dapat membuat, menyimpan, menguji, dan menerbitkan dunia; tidak dapat mengakses sistem internal tanpa izin; konten dapat ditarik dan ditinjau.

## Fase 10 — AI World Studio

**Tujuan:** AI mempercepat pembuatan konten sebagai draft yang dapat diedit dan diuji, bukan hasil tepercaya otomatis.

### 10.1 — Kebijakan AI dan biaya
- Tetapkan kasus penggunaan yang diizinkan, batas privasi/data, provider/model, budget/quota, serta kriteria kualitas sebelum integrasi.
- Rancang gateway dan prompt templates berversi dengan observability tanpa mencatat data sensitif yang tidak perlu.
- **Keluaran:** AI use-case policy, evaluasi provider, batas biaya, dan prompt spec.

### 10.2 — Job pipeline dan hasil draft
- Implementasikan job queue, status, retry, generator konsep, rekomendasi aset, bantuan placement/misi, dan penyimpanan versi.
- Tampilkan status/kegagalan; hasil selalu masuk sebagai draft yang dapat diedit.
- **Keluaran:** AI job pipeline dengan audit/provenance.

### 10.3 — Validasi keamanan, aset, dan kualitas
- Validasi struktur/output, hak aset, moderasi, biaya, retry/abuse; uji hasil invalid, prompt injection, dan kegagalan provider.
- **Keluaran:** test/evaluation set, laporan kualitas, dan mekanisme penolakan/pemulihan.
- **Gate Fase 10:** draft dapat diedit dan diuji; output tidak dipercaya atau dipublikasikan otomatis; biaya, privasi, hak aset, dan moderasi terkendali.

## Fase 11 — Marketplace dan Pembayaran

**Tujuan:** memungkinkan transaksi nyata dengan integritas finansial, audit, fraud control, dan rekonsiliasi.

### 11.1 — Katalog, listing, dan lisensi
- Tetapkan kategori, listing kreator, harga, lisensi, persetujuan konten, komisi, refund, sengketa, dan aturan wilayah.
- **Keluaran:** commerce policy, listing contract, dan acceptance criteria.

### 11.2 — Pembayaran dan ledger
- Integrasikan provider di server; verifikasi webhook, idempotensi, ledger append-only/auditable, pembelian, refund, payout/komisi, dan event transaksi.
- Jangan jadikan satu kolom saldo yang bebas diubah sebagai catatan keuangan.
- **Keluaran:** alur transaksi tercatat, audit trail, dan prosedur rekonsiliasi.

### 11.3 — Fault, fraud, dan rekonsiliasi
- Uji gagal/terlambat, webhook berulang/replay, pembayaran berhasil dengan callback terlambat, transaksi ganda, refund, sengketa, dan fraud.
- Bandingkan ledger dengan laporan provider dan buktikan rekonsiliasi dapat dijalankan.
- **Keluaran:** laporan uji transaksi dan bukti rekonsiliasi.
- **Gate Fase 11:** status konsisten; tidak ada pengkreditan ganda pada skenario teruji; audit dan rekonsiliasi provider berhasil; keamanan/legal untuk transaksi nyata disetujui.

## Fase 12 — Scale, Observability, dan Reliability

**Tujuan:** meningkatkan kapasitas hanya berdasarkan pengukuran penggunaan dan target yang disepakati.

### 12.1 — Baseline dan target kapasitas
- Tetapkan skenario beban representatif, kapasitas target, SLI/SLO awal, anggaran biaya per pengguna/sesi, serta asumsi region.
- **Keluaran:** performance plan dan baseline terukur.

### 12.2 — Bottleneck dan optimasi
- Jalankan load/stress test, CPU/memory profiling, bandwidth/database/cache tests, asset loading, interest management, grouping, dan autoscaling bila terbukti perlu.
- **Keluaran:** profiling report, perubahan terukur, dan perbandingan sebelum/sesudah.

### 12.3 — Reliability dan pemulihan
- Lengkapi monitoring/alerting, backup, disaster recovery, restore test, dan uji kegagalan dependency eksternal.
- Lakukan capacity planning dan ukur biaya aktual.
- **Keluaran:** runbook, hasil restore/failure test, capacity plan, dan biaya aktual.
- **Gate Fase 12:** kapasitas target diuji; biaya terukur; alert dan prosedur pemulihan terbukti bekerja; risiko dependency memiliki mitigasi.

## Fase 13 — Public Beta

**Tujuan:** menguji produk pada pengguna luar tim internal dengan operasi dan dukungan yang terkendali.

### 13.1 — Kesiapan cohort beta
- Tetapkan cohort/invitation, persetujuan ketentuan, tutorial, dukungan, kanal feedback/bug, moderasi, dan protokol insiden.
- **Keluaran:** beta plan, materi pengguna, support rota, dan release checklist.

### 13.2 — Pengamatan produk dan teknis
- Uji perangkat nyata dan koneksi lintas wilayah; kumpulkan analytics produk, crash/error, retensi, biaya, kepuasan, dan laporan secara proporsional serta sesuai privasi.
- **Keluaran:** dashboard baseline beta dan issue triage.

### 13.3 — Keputusan iterasi
- Prioritaskan perbaikan berdasarkan severity, data, serta umpan balik; uji ulang regresi dan dokumentasikan keputusan.
- **Keluaran:** beta findings, release candidate, dan daftar risiko tersisa.
- **Gate Fase 13:** masalah kritis terselesaikan; operasi terkendali; indikator produk mencapai target yang disepakati dari baseline; persetujuan lanjut tercatat.

## Fase 14 — Peluncuran Publik

**Tujuan:** membuka platform dengan kesiapan legal, keamanan, kapasitas, komunikasi, dan respons operasional.

### 14.1 — Release readiness
- Selesaikan checklist rilis, security/legal/privacy/copyright review, dokumentasi bantuan, sistem laporan, dan approval pemilik sistem.
- **Keluaran:** release evidence pack dan daftar risiko yang disetujui.

### 14.2 — Deployment dan mitigasi
- Verifikasi kapasitas server, batas penggunaan/biaya, monitoring real-time, status page, komunikasi pengguna, rollback, dan prosedur respons insiden.
- Simulasikan rollback atau mitigasi sebelum membuka trafik luas.
- **Keluaran:** deployment plan, runbook on-call, rollback proof, dan status/komunikasi siap pakai.

### 14.3 — Peluncuran bertahap dan pengawasan
- Promosikan release dengan kontrol trafik/feature flag yang tersedia; pantau error, keamanan, transaksi, kapasitas, dan biaya.
- Tutup loop pascapeluncuran: triage, komunikasi, perbaikan, atau rollback.
- **Keluaran:** catatan keputusan launch dan laporan pemantauan awal.
- **Gate Fase 14:** seluruh sistem penting memenuhi kriteria rilis; tim mampu merespons insiden; rollback/mitigasi dan monitoring terbukti tersedia; pemilik bisnis/teknis menyetujui peluncuran.

## Kondisi transisi ke fase berikutnya

Roadmap ini sengaja tidak menetapkan tanggal atau estimasi task sebelum audit dan kapasitas tim diketahui. Prototipe offline sudah dimulai atas instruksi pengguna, tetapi itu tidak berarti audit repository, PRD, target perangkat, atau pilihan engine final telah disetujui. Perbarui audit Fase 1 dan putuskan:

1. Melanjutkan proyek game yang ditemukan dan memperbaiki blocker baseline.
2. Mengakses repository game lain yang teridentifikasi.
3. Jika proyek game yang dimaksud berada di luar repository ini, catat lokasi dan sumber kebenarannya.

Sebelum gate Fase 2 dinyatakan lulus, lengkapi verifikasi browser pada desktop/mobile dan pengujian manual gerakan, kamera, collision, combat, kalah/menang, serta restart. Selesaikan atau catat risiko loading awal bundle 3D. Fase 3 multiplayer tetap tertahan sampai gate Fase 2 disetujui. Semua keluaran selanjutnya diturunkan dari bukti audit dan gate yang tercatat, bukan asumsi dalam blueprint.
