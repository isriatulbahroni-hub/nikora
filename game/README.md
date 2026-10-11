# ORBIT Offline Arena Prototype

An isolated, local-only 3D gameplay prototype. It is separate from the ORBIT landing page and has no multiplayer, account, or backend integration.

## Requirements

- Node.js 20 or newer (validated with Node.js 24)
- npm
- A browser with WebGL 2 support

## Run locally

```bash
cd game
npm install
npm run dev
```

Open the local URL printed by Vite. The prototype needs no game server or network connection after dependencies are installed.

## Controls

- `WASD` or arrow keys: move
- `Space`: attack
- `R` or the restart button: reset the match
- On narrow screens, use the on-screen directional pad and Hit button

Defeat the bot before your health reaches zero. The bot approaches and attacks locally; outcomes are not server-authoritative.

## Multiplayer (opsional)

Jalankan server (`cd server && npm install && npm start`), lalu buka game dengan `?server=`:

```
http://localhost:5173/?server=ws://localhost:8080
```

Pemain lain tampil sebagai avatar berwarna dengan nama. Tanpa `?server=`, game tetap offline. Jika server tidak terjangkau, game lanjut offline. Batasan: pemain lokal masih disimulasikan di klien (belum ada rekonsiliasi dengan server), jadi ini baru sinkronisasi tampilan; belum diuji di browser sungguhan.

## Checks

```bash
npm test
npm run build
npm run test:e2e
```

Current verification: 5 unit tests pass, production build succeeds, dependency audit reports zero advisories, and a Rapier capsule smoke test passes. Playwright browser tests are present but could not launch Chromium in the current container because `libatk-1.0.so.0` is missing. Install Playwright's Linux browser dependencies in the container, then rerun `npm run test:e2e` before treating the Fase 2 gate as passed.

## Implementation boundary

This is an offline mechanics prototype for one arena and one bot. It does not validate multiplayer security, synchronization, accounts, persistence, rewards, or production performance.
