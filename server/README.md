# ORBIT Multiplayer Server (Fase 3, vertical slice awal)

Server WebSocket otoritatif untuk satu ruang virtual. Klien hanya mengirim **arah gerak**; posisi dihitung server.

## Jalankan

```bash
cd server
npm install
npm start        # PORT=8080 secara default
npm test
```

## Protokol (JSON)

Klien ke server:
- `{ t: 'join', name }` — masuk ruang (wajib dalam 5 detik)
- `{ t: 'input', x, z, rot, seq, sit? }` — arah gerak (-1..1), rotasi, nomor urut naik; `sit` = id kursi (0..35) untuk duduk atau `null` untuk berdiri (divalidasi: harus dekat dan kursi kosong)
- `{ t: 'chat', text }` — pesan obrolan untuk semua pemain (maks 160 karakter, jeda minimal 0,8 detik)
- `{ t: 'ping', ts }`

Server ke klien:
- `{ t: 'welcome', id, players }`
- `{ t: 'state', tick, players }` — snapshot 20 Hz; tiap pemain punya `sit` (id kursi atau null)
- `{ t: 'chat', id, name, text, ts }` — pesan obrolan (dibersihkan server)
- `{ t: 'left', id }`
- `{ t: 'pong', ts }`, `{ t: 'error', reason }`

## Perlindungan yang sudah ada
Input di-clamp dan dinormalisasi (anti speed-hack), seq lama ditolak, posisi dibatasi arena, payload maks 1024 byte, rate limit 60 pesan/detik, timeout join dan idle, batas 50 pemain per ruang.

## Belum ada (batas jujur)
Belum ada autentikasi/akun, reconnect, simulasi latency/packet loss, zona/interest management, voice, dan **belum terhubung ke `game/src/main.js`** (NetClient ada di `game/src/net-client.js` dan sudah dites terhadap server, tapi belum dipakai render/UI). Tidak ada uji browser; gate Fase 3 belum lulus.

## Suara proximity (LiveKit) — opsional

Server hanya menerbitkan token; audio lewat LiveKit (SFU WebRTC). Atur variabel lingkungan di host server (Railway, dll.):

- `LIVEKIT_URL` (mis. `wss://proyek-anda.livekit.cloud`)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Tanpa ketiganya, tombol 🎙 tidak muncul dan game berjalan seperti biasa. Volume diatur klien menurut jarak (penuh ≤ 2,5 m, hening ≥ 12 m).
Catatan: pembatasan oleh klien belum menjamin privasi; ruang privat/meja membutuhkan pembatasan langganan di sisi server LiveKit (belum dikerjakan).

## Interaksi berpasangan

Pesan `greet` (`handshake`, `highfive` butuh persetujuan lewat `greet-reply`; `wave`, `bow` langsung). Server memvalidasi jarak ≤ 2,2 m, tidak duduk, lalu menghadapkan kedua pemain; aksi selesai otomatis setelah 2,6 detik.
