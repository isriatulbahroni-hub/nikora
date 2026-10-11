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
- `{ t: 'input', x, z, rot, seq }` — arah gerak (-1..1), rotasi, nomor urut naik
- `{ t: 'ping', ts }`

Server ke klien:
- `{ t: 'welcome', id, players }`
- `{ t: 'state', tick, players }` — snapshot 20 Hz
- `{ t: 'left', id }`
- `{ t: 'pong', ts }`, `{ t: 'error', reason }`

## Perlindungan yang sudah ada
Input di-clamp dan dinormalisasi (anti speed-hack), seq lama ditolak, posisi dibatasi arena, payload maks 512 byte, rate limit 60 pesan/detik, timeout join dan idle, batas 50 pemain per ruang.

## Belum ada (batas jujur)
Belum ada autentikasi/akun, reconnect, simulasi latency/packet loss, zona/interest management, voice, dan **belum terhubung ke `game/src/main.js`** (NetClient ada di `game/src/net-client.js` dan sudah dites terhadap server, tapi belum dipakai render/UI). Tidak ada uji browser; gate Fase 3 belum lulus.
