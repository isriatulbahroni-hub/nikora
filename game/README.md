# ORBIT World — Aula Resepsi (Prototipe 1)

Aula virtual 3D di browser: masuk dengan nama, berjalan di aula resepsi, duduk di meja, dan bertepuk tangan. Ini menggantikan prototipe arena duel sebelumnya; ORBIT adalah dunia sosial, bukan game tarung.

## Persyaratan

- Node.js 20+ dan npm
- Browser dengan WebGL 2

## Jalankan

```bash
cd game
npm install
npm run dev
```

## Kontrol

- `WASD` / panah: berjalan (di HP: joystick)
- `E` atau tombol DUDUK: duduk di kursi kosong terdekat / berdiri
- `Space` atau tombol TEPUK: tepuk tangan
- `R` atau ikon rumah: kembali ke pintu masuk, `M`: suara

## Multiplayer (opsional)

Jalankan server (`cd server && npm install && npm start`), lalu buka `http://localhost:5173/?server=ws://localhost:8080`. Posisi dan status duduk divalidasi server; pemain lain terlihat bergerak dan duduk. Tanpa `?server=`, aula berjalan offline dengan tamu simulasi.

## Obrolan dan banyak penonton

Obrolan (`Enter` atau tombol 💬) memakai server WebSocket di `server/`. Vercel tidak bisa menjalankan server ini, jadi host `server/` di layanan yang mendukung proses Node yang terus hidup (mis. Railway), lalu isi variabel build Vercel `VITE_SERVER_URL` dengan alamatnya (`wss://...`). Tanpa itu, aula berjalan offline dan pesan hanya terlihat oleh pengirim.

Catatan Railway: server mengimpor `game/src`, jadi pakai root repo (bukan folder `server`), build `cd server && npm install`, start `node server/src/index.js`.

## Pengecekan

```bash
npm test
npm run build
npm run test:e2e
```

## Batas jujur

- Satu ruang dibatasi 50 pemain; belum ada mode penonton untuk ratusan orang.
- Belum ada suara (spatial voice), siaran langsung, akun, atau dunia yang bisa dibangun. Layar di panggung hanya placeholder.
- Tepuk tangan hanya terlihat oleh pemain sendiri (belum disinkronkan ke pemain lain).
- Pemain lokal masih diprediksi di klien; belum ada rekonsiliasi penuh dengan server.
- Tes E2E (`e2e/hall.spec.js`) ditulis tetapi belum pernah dijalankan di browser sungguhan; tampilan belum diverifikasi secara visual.
