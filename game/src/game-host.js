// Kontrak GameHost: cara sebuah permainan dibuka, dijalankan, dan ditutup dari dunia villa.
// Modul ini murni logika (tanpa THREE dan tanpa DOM sendiri) supaya mudah diuji. Elemen layar (container)
// hanya diteruskan ke permainan. Dokumen untuk pembuat permainan: docs/horor/GAMEHOST.md
//
// Alur:  tamu dekat terminal  ->  host.open(id, me)  ->  loader permainan di-import (malas)  ->  game.mount(ctx)
//        ->  host.close()  ->  game.destroy()  ->  gerak/kamera villa dipulihkan.
//
// Hanya satu permainan terbuka dalam satu waktu. Permainan dimuat dengan import() dinamis supaya halaman
// villa tidak membawa kode permainan bagi tamu yang tidak masuk ruang game.

export const REASONS = Object.freeze({
  unknown: 'Permainan itu tidak dikenal.',
  soon: 'Permainan ini segera hadir.',
  busy: 'Selesaikan permainan yang sedang berjalan dulu.',
  'wrong-room': 'Masuk ke ruangan permainan ini dulu.',
  closed: 'Ruang game sedang ditutup oleh pemilik acara.',
  'no-loader': 'Permainan ini belum terpasang.',
  'load-failed': 'Permainan gagal dimuat. Coba lagi.',
  'mount-failed': 'Permainan gagal dimulai. Coba lagi.',
});

export const STATUS = Object.freeze({ IDLE: 'idle', LOADING: 'loading', PLAYING: 'playing' });

/**
 * @typedef {object} GameContext  Diberikan ke game.mount(ctx).
 * @property {string} gameId
 * @property {HTMLElement|null} container  Elemen kosong milik host; permainan menggambar di sini.
 * @property {{id:string,name:string}} player  Pemain lokal.
 * @property {object} net  Jaringan villa (net.room = LiveKit Room bila ada, net.players = pemain lain).
 * @property {object} services  Titipan host (mis. quality, skor). Tidak ada kunci wajib.
 * @property {(result?: object) => void} exit  Dipanggil permainan bila selesai atau pemain keluar.
 * @property {(message: string) => void} notice  Tampilkan pesan singkat ke pemain.
 *
 * @typedef {object} GameInstance  Dikembalikan mount(ctx).
 * @property {() => void} destroy  WAJIB. Lepas semua listener, timer, kanvas, dan sambungan data.
 * @property {() => void} [pause]  Opsional: tab disembunyikan / pemain membuka menu.
 * @property {() => void} [resume]
 *
 * @typedef {object} GameModule  Ekspor default (atau named `game`) dari modul permainan.
 * @property {(ctx: GameContext) => GameInstance | Promise<GameInstance>} mount
 */

const fail = (reason) => ({ ok: false, reason });

/**
 * @param {object} opts
 * @param {Record<string,{label:string,room:string,status:'ready'|'soon',scary?:boolean}>} opts.catalog  mis. GAMES
 * @param {Record<string,() => Promise<{default?:GameModule,game?:GameModule}>>} opts.loaders  import() malas per permainan
 * @param {(gameId:string, me:object) => boolean} [opts.inRoom]  Apakah pemain berada di ruangan permainan itu?
 * @param {() => boolean} [opts.isOpenForPlay]  Apakah ruang game sedang dibuka pemilik acara? (default selalu)
 * @param {() => HTMLElement|null} [opts.makeContainer]  Pembuat elemen layar (default null: tanpa DOM, untuk uji)
 * @param {(el:HTMLElement|null) => void} [opts.releaseContainer]
 * @param {object} [opts.net]
 * @param {object} [opts.services]
 * @param {(s:{status:string,gameId:string|null}) => void} [opts.onState]  Dipakai villa untuk mengunci gerak/kamera.
 * @param {(message:string) => void} [opts.onNotice]
 */
export function createGameHost({
  catalog,
  loaders = {},
  inRoom = () => true,
  isOpenForPlay = () => true,
  makeContainer = () => null,
  releaseContainer = () => {},
  net = null,
  services = {},
  onState = () => {},
  onNotice = () => {},
}) {
  let status = STATUS.IDLE;
  let gameId = null;
  let instance = null;
  let container = null;
  let ticket = 0; // membatalkan open() yang tertunda bila close() dipanggil saat memuat

  const setState = (s, id) => {
    status = s;
    gameId = id;
    onState({ status, gameId });
  };
  const say = (reason) => onNotice(REASONS[reason] ?? 'Tidak bisa dilakukan sekarang.');

  /** Pemeriksaan murni tanpa efek samping: boleh dibuka sekarang? */
  function canOpen(id, me) {
    const entry = catalog[id];
    if (!entry) return fail('unknown');
    if (status !== STATUS.IDLE) return fail('busy');
    if (entry.status !== 'ready') return fail('soon');
    if (!isOpenForPlay()) return fail('closed');
    if (!inRoom(id, me)) return fail('wrong-room');
    if (!loaders[id]) return fail('no-loader');
    return { ok: true };
  }

  async function open(id, me) {
    const check = canOpen(id, me);
    if (!check.ok) {
      say(check.reason);
      return check;
    }
    const mine = ++ticket;
    setState(STATUS.LOADING, id);
    let mod;
    try {
      mod = await loaders[id]();
    } catch {
      if (mine === ticket) setState(STATUS.IDLE, null);
      say('load-failed');
      return fail('load-failed');
    }
    if (mine !== ticket) return fail('cancelled'); // ditutup selagi memuat
    const game = mod?.default ?? mod?.game;
    if (!game || typeof game.mount !== 'function') {
      setState(STATUS.IDLE, null);
      say('mount-failed');
      return fail('mount-failed');
    }
    container = makeContainer();
    const ctx = {
      gameId: id,
      container,
      player: { id: me?.id ?? net?.id ?? 'local', name: me?.name ?? 'Tamu' },
      net,
      services,
      exit: (result) => close('exit', result),
      notice: onNotice,
    };
    try {
      instance = await game.mount(ctx);
    } catch {
      instance = null;
      releaseContainer(container);
      container = null;
      if (mine === ticket) setState(STATUS.IDLE, null);
      say('mount-failed');
      return fail('mount-failed');
    }
    if (mine !== ticket) {
      // ditutup selagi mount berjalan: bersihkan hasilnya
      safeDestroy(instance);
      instance = null;
      releaseContainer(container);
      container = null;
      return fail('cancelled');
    }
    setState(STATUS.PLAYING, id);
    return { ok: true, gameId: id };
  }

  function safeDestroy(inst) {
    try {
      inst?.destroy?.();
    } catch {
      /* permainan yang rusak tidak boleh menahan villa */
    }
  }

  /** Tutup permainan (atau batalkan yang sedang dimuat). Aman dipanggil kapan saja. */
  function close(reason = 'manual', result = null) {
    if (status === STATUS.IDLE) return { ok: true, already: true };
    ticket++;
    const id = gameId;
    safeDestroy(instance);
    instance = null;
    if (container !== null) releaseContainer(container);
    container = null;
    setState(STATUS.IDLE, null);
    return { ok: true, gameId: id, reason, result };
  }

  /** Dipanggil tiap frame/tick oleh villa: menutup permainan bila pemain keluar ruangan atau ruang ditutup. */
  function tick(me) {
    if (status === STATUS.IDLE) return;
    if (!isOpenForPlay()) {
      say('closed');
      close('closed');
    } else if (!inRoom(gameId, me)) {
      close('left-room');
    }
  }

  return {
    canOpen,
    open,
    close,
    tick,
    pause: () => instance?.pause?.(),
    resume: () => instance?.resume?.(),
    get status() {
      return status;
    },
    get gameId() {
      return gameId;
    },
    get playing() {
      return status === STATUS.PLAYING;
    },
    /** Villa mengunci gerak, kamera, dan tombol bila true. */
    get locksInput() {
      return status !== STATUS.IDLE;
    },
  };
}
