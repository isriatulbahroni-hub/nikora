# GameHost: kontrak untuk pembuat permainan

Bacalah ini sebelum membuat permainan baru (Mansion Horor, Bulu Tangkis, dst.).
Kode kontrak: `game/src/game-host.js`. Pemuat: `game/src/game-registry.js`.

## Yang harus diekspor permainan

Satu modul di folder sendiri (`game/src/horor/index.js`, `game/src/badminton/index.js`) dengan ekspor default:

```js
export default {
  async mount(ctx) {
    // gambar ke ctx.container, pasang listener, buka koneksi data
    return {
      destroy() { /* WAJIB: lepas SEMUA listener, timer, requestAnimationFrame, kanvas, WebGL context */ },
      pause() {},  // opsional
      resume() {}, // opsional
    };
  },
};
```

`ctx` berisi:

| Kunci | Isi |
|---|---|
| `gameId` | `'horror'`, `'badminton'`, ... (sama dengan kunci di `GAMES`) |
| `container` | elemen kosong milik host; gambar di sini saja |
| `player` | `{ id, name }` pemain lokal |
| `net` | jaringan villa. `net.room` = LiveKit Room (bila ada), `net.players` = pemain lain |
| `services` | titipan host (mis. `quality`); tidak ada kunci wajib |
| `exit(result)` | panggil saat permainan selesai atau pemain menekan keluar |
| `notice(msg)` | pesan singkat ke pemain |

## Aturan

1. **Jangan sentuh** `villa-world.js`, `villa-main.js`, `villa-layout.js`, `villa-gamewing.js`. Itu milik tugas integrasi.
2. Permainan **tidak mengimpor** villa-main atau Three.js milik villa. Impor `three` sendiri bila perlu (Vite membagi kodenya).
3. Pesan data multiplayer memakai topik LiveKit sendiri, awalan `game-<id>` (contoh `game-badminton`), supaya tidak bentrok dengan `orbit-room` dan topik lain.
4. `destroy()` harus idempoten dan tidak boleh melempar galat. Host menelan galat, tetapi kebocoran listener tetap merusak villa.
5. Tanpa darah realistis dan tanpa nama/aset berhak cipta pihak lain (Capcom, Activision). Aset hanya CC0 atau buatan sendiri.
6. Kode dari repo lain boleh bila berlisensi MIT, dan wajib dicatat di `docs/horor/THIRD_PARTY_NOTICES.md` bersama hak ciptanya.
7. Layar harus nyaman di HP (sentuh), kontrol layar jangan menutup tombol Keluar.

## Siklus hidup

`open(id, me)`: cek status, ruang dibuka, pemain di ruangannya, loader ada. Lalu `import()` malas, `mount(ctx)`, status `playing`.
`close()` dipanggil: tombol Keluar, `ctx.exit()`, pemain keluar ruangan, atau ruang ditutup pemilik acara. Semuanya berujung ke `destroy()`.
Selama status bukan `idle`, villa mengunci gerak avatar dan kamera (`host.locksInput`).

## Mendaftarkan permainan

1. Entri sudah ada di `GAMES` (`villa-gamewing.js`) dengan `status: 'soon'`. Pengubah status ke `'ready'` dilakukan tugas integrasi setelah permainan lulus uji.
2. Tambahkan satu baris di `game-registry.js` setelah modulnya ada.
3. Uji dengan `createGameHost` seperti di `game-host.test.js` (loader palsu, tanpa DOM).

## Pembagian file (agar tidak saling menimpa)

| Tugas | Hanya boleh mengubah |
|---|---|
| Integrasi villa | `villa-world.js`, `villa-main.js`, `villa-layout.js`, `villa-gamewing.js`, `game-host.js` |
| Mansion Horor | `game/src/horor/*` (kecuali `vendor/`, hanya baca) |
| Bulu Tangkis | `game/src/badminton/*` |
| Kontrol acara + skor | `server/`, `supabase/`, `game/src/game-scores*.js` |
| Venue lain + QA | `royal-*.js`, `index`/aula, test, `docs/` |

Alat GitHub menulis ulang seluruh file, jadi dua Claude yang mengedit file yang sama akan saling menimpa. Satu file = satu pemilik.
