# Avatar manusia bicara (TalkingHead + HeadAudio)

Tujuan: avatar tampak seperti manusia, wajahnya berekspresi, dan mulutnya mengikuti suara asli (mikrofon atau suara tamu lain).

## Cara menyiapkan (sekali)
1. Di GitHub: **Actions → Siapkan aset avatar → Run workflow** pada branch ini (centang avatar dasar). Berkas workflow ada di `docs/avatar-assets.workflow.yml`; salin ke `.github/workflows/avatar-assets.yml` bila belum ada.
2. Workflow menyematkan TalkingHead dan HeadAudio (versi terkunci, MIT), mengambil `mpfb.glb` (CC0), mengompresnya, lalu meng-commit hasilnya ke `game/src/vendor`, `game/public/headaudio`, dan `game/public/avatars`.
3. Jalankan `npm run dev` di `game/`, buka `/talking-test.html`, aktifkan mikrofon, lalu bicara.

## Menambah avatar
- Taruh GLB di `game/avatars-src/` dan push. Workflow mengompresnya otomatis ke `game/public/avatars/`.
- Daftarkan di `game/src/avatar-talking-config.js` lengkap dengan lisensi. Hanya model berlisensi jelas yang boleh didaftarkan; isi `commercialOk` dengan jujur.
- Syarat model: rig kompatibel Mixamo, blendshape ARKit (52) dan viseme Oculus (15). Lihat Appendix A README TalkingHead.

## Memakai di dunia (villa, aula, masjid)
```js
const avatar = await createTalkingAvatar({ scene, camera, avatarId: 'mpfb' });
avatar.armature.position.set(x, 0, z);
await avatar.listen(micStream); // atau trek suara tamu dari LiveKit
// di loop render: avatar.update(deltaDetik * 1000)
```

## Catatan dan risiko
- Belum diuji di perangkat: kompatibilitas three 0.177 (game) dengan TalkingHead yang ditulis untuk 0.180, serta performa di HP kelas menengah.
- Halaman uji belum didaftarkan di `vite.config.js`, jadi tidak ikut build produksi.
- HeadAudio bergantung pada kualitas suara; di tempat bising pergerakan mulut kurang akurat.
- Satu AudioContext dipakai bersama; HeadAudio hanya dibuat untuk avatar yang memanggil `listen`.
- Suara karakter dari teks (TTS) belum disambungkan. Opsi gratis: HeadTTS, jalan di browser.
