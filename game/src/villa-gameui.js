// Antarmuka ruang game di dunia villa: terminal terdekat, tombol aksi, layar permainan (overlay), dan GameHost.
// Dibuat sekali oleh villa-main.js; semua logika buka/tutup ada di game-host.js.
import { createGameHost } from './game-host.js';
import { GAME_LOADERS } from './game-registry.js';
import { mobaServicesFromSearch } from './moba/url.js';
import { GAMES, nearestTerminal } from './villa-gamewing.js';
import { buildGameWingDecor } from './villa-gamewing-world.js';
import { roomAt } from './villa-layout.js';

const STYLE = `
.vg{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:#05060d;color:#fff;font-family:system-ui,sans-serif}
.vg[hidden]{display:none}
.vg-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:max(10px,env(safe-area-inset-top)) 14px 10px;background:#0b0c16;border-bottom:1px solid #23253a}
.vg-title{font-size:15px;letter-spacing:.02em}
.vg-exit{min-height:44px;min-width:88px;padding:0 16px;border:0;border-radius:10px;background:#e23b3b;color:#fff;font-size:15px;font-weight:600}
.vg-screen{position:relative;flex:1;min-height:0;overflow:hidden}
.vg-loading{position:absolute;inset:0;display:grid;place-items:center;font-size:15px;color:#9aa3c7;pointer-events:none}
.vg-loading[hidden]{display:none}
`;

function ensureStyle(doc) {
  if (doc.getElementById('vg-style')) return;
  const s = doc.createElement('style');
  s.id = 'vg-style';
  s.textContent = STYLE;
  doc.head.appendChild(s);
}

/**
 * @param {object} o
 * @param {object|null} o.scene  Scene THREE untuk dekor sayap (null = tanpa dekor, untuk uji)
 * @param {(m:string)=>void} o.toast
 * @param {() => object|null} o.getNet  jaringan villa saat ini (bisa berubah setelah tersambung)
 */
export function createVillaGames({
  scene = null,
  toast = () => {},
  getNet = () => null,
  services = {},
  doc = document,
  decor = buildGameWingDecor,
  loaders = GAME_LOADERS,
  catalog = GAMES,
  isOpenForPlay = () => true,
} = {}) {
  ensureStyle(doc);
  const shell = doc.createElement('div');
  shell.className = 'vg';
  shell.hidden = true;
  shell.innerHTML = '<div class="vg-bar"><strong class="vg-title"></strong><button type="button" class="vg-exit" aria-label="Keluar dari permainan">Keluar</button></div><div class="vg-screen"></div><div class="vg-loading">Memuat…</div>';
  doc.body.appendChild(shell);
  const titleEl = shell.querySelector('.vg-title');
  const screenEl = shell.querySelector('.vg-screen');
  const loadingEl = shell.querySelector('.vg-loading');
  const exitBtn = shell.querySelector('.vg-exit');

  // jaringan baru ada setelah tersambung; permainan membaca properti lewat proxy ini
  const net = new Proxy({}, { get: (_, key) => getNet()?.[key] });
  const inRoom = (id, me) => roomAt(me.x, me.z, me.level ?? 0).id === catalog[id]?.room;

  const host = createGameHost({
    catalog,
    loaders,
    inRoom,
    isOpenForPlay,
    net,
    // opsi MOBA dari alamat halaman (?moba=KODE, ?mobamode=tab); `services` dari pemanggil menimpanya
    services: { ...mobaServicesFromSearch(doc.defaultView?.location?.search ?? ''), ...services },
    onNotice: toast,
    makeContainer: () => {
      screenEl.replaceChildren();
      return screenEl;
    },
    releaseContainer: () => screenEl.replaceChildren(),
    onState: ({ status, gameId }) => {
      const idle = status === 'idle';
      shell.hidden = idle;
      loadingEl.hidden = status !== 'loading';
      titleEl.textContent = gameId ? (catalog[gameId]?.label ?? '') : '';
      doc.documentElement.classList.toggle('vg-open', !idle);
    },
  });

  exitBtn.addEventListener('click', () => host.close('manual'));
  const onKey = (e) => {
    if (e.key === 'Escape' && host.locksInput) host.close('manual');
  };
  doc.addEventListener('keydown', onKey);

  const decorHandle = scene && decor ? decor(scene, { catalog }) : null;

  /** Terminal yang bisa dipakai dari posisi `me`, lengkap dengan teks tombol; atau null. */
  function nearTerminal(me) {
    const t = nearestTerminal(me);
    if (!t) return null;
    const entry = catalog[t.game];
    if (!entry) return null;
    const text = entry.status === 'ready' ? `🎮 Main ${entry.label}` : `🎮 ${entry.label} · segera hadir`;
    return { ...t, label: text, status: entry.status };
  }

  return {
    host,
    nearTerminal,
    /** Tekan tombol aksi di terminal. Mengembalikan promise hasil host.open. */
    open(terminal, me) {
      return host.open(terminal.game, { id: getNet()?.id, x: me.x, z: me.z, level: me.level ?? 0 });
    },
    close: (reason) => host.close(reason),
    tick: (me) => host.tick(me),
    /** Pesan peringatan saat memasuki ruangan `placeId` (ruang seram), atau null. */
    entered(placeId) {
      const g = Object.values(catalog).find((c) => c.room === placeId);
      return g?.scary ? 'Ruangan seram. Kurang cocok untuk anak kecil.' : null;
    },
    get locksInput() {
      return host.locksInput;
    },
    /** Villa tidak perlu menggambar saat permainan menutupi layar (hemat baterai dan GPU). */
    get covering() {
      return host.playing;
    },
    state: () => ({ status: host.status, gameId: host.gameId }),
    dispose() {
      host.close('dispose');
      doc.removeEventListener('keydown', onKey);
      decorHandle?.dispose();
      shell.remove();
    },
  };
}
