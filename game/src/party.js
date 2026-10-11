// Party Room: panggung dengan MC, pembicara, dan antrean angkat tangan.
// Logika murni (tanpa jaringan/DOM) supaya mudah diuji. Catatan keamanan: transport LiveKit tidak punya server
// otoritatif, jadi aturan "hanya MC yang boleh menaikkan pembicara" ditegakkan di tiap klien (cukup untuk prototipe,
// belum tahan terhadap klien yang dimodifikasi).
export const PARTY = Object.freeze({ maxSpeakers: 4, maxHands: 20, syncMs: 3000 });

export const emptyParty = () => ({ host: null, speakers: [], hands: [] });

const uniq = (list) => [...new Set(list)];

/** Buang peserta yang sudah keluar. MC keluar => panggung ditutup. */
export function prune(state, present) {
  if (state.host && !present.has(state.host)) return emptyParty();
  return {
    host: state.host,
    speakers: state.speakers.filter((id) => present.has(id)),
    hands: state.hands.filter((id) => present.has(id)),
  };
}

export const speakerIds = (state) => new Set(state.host ? [state.host, ...state.speakers] : []);
export const roleOf = (state, id) => (state.host === id ? 'host' : state.speakers.includes(id) ? 'speaker' : 'listener');

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length < 80;

/** Terapkan satu pesan dari `from`. Pesan tidak sah diabaikan (state dikembalikan apa adanya). */
export function applyMessage(state, from, msg, present) {
  if (!isId(from) || !msg || typeof msg !== 'object' || !present.has(from)) return state;
  switch (msg.k) {
    case 'host':
      // Klaim bersamaan: id lebih kecil menang (deterministik di semua klien).
      if (!state.host || from < state.host) return { host: from, speakers: [], hands: [] };
      return state;
    case 'raise':
      if (!state.host || roleOf(state, from) !== 'listener' || state.hands.includes(from)) return state;
      if (state.hands.length >= PARTY.maxHands) return state;
      return { ...state, hands: [...state.hands, from] };
    case 'lower':
      return { ...state, hands: state.hands.filter((id) => id !== from) };
    case 'grant':
      if (from !== state.host || !isId(msg.to) || !present.has(msg.to) || msg.to === state.host) return state;
      if (state.speakers.includes(msg.to) || state.speakers.length >= PARTY.maxSpeakers) return state;
      return { ...state, speakers: [...state.speakers, msg.to], hands: state.hands.filter((id) => id !== msg.to) };
    case 'revoke': {
      const target = isId(msg.to) ? msg.to : from;
      if (target !== from && from !== state.host) return state; // hanya MC yang menurunkan orang lain
      return { ...state, speakers: state.speakers.filter((id) => id !== target) };
    }
    case 'close':
      return from === state.host ? emptyParty() : state;
    case 'sync':
      if (from !== state.host && state.host && from > state.host) return state;
      if (!isId(from)) return state;
      return prune(
        {
          host: from,
          speakers: uniq(Array.isArray(msg.sp) ? msg.sp.filter(isId) : []).slice(0, PARTY.maxSpeakers),
          hands: uniq(Array.isArray(msg.h) ? msg.h.filter(isId) : []).slice(0, PARTY.maxHands),
        },
        present,
      );
    default:
      return state;
  }
}

/** Pengendali: memegang state, mengirim lewat net.sendParty, menerima lewat net.on('party'). */
export function createPartyController({ net, onChange = () => {}, now = () => Date.now() }) {
  let state = emptyParty();
  let lastSync = 0;
  const selfId = () => net.id;
  const present = () => new Set(net.players.map((p) => p.id));
  const set = (next) => {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    onChange(state);
  };
  const act = (msg) => {
    set(applyMessage(state, selfId(), msg, present()));
    net.sendParty?.(msg);
  };

  net.on('party', ({ from, msg }) => set(applyMessage(state, from, msg, present())));
  net.on('left', () => set(prune(state, present())));

  return {
    get state() { return state; },
    get role() { return roleOf(state, selfId()); },
    get handRaised() { return state.hands.includes(selfId()); },
    claimHost: () => act({ k: 'host' }),
    raiseHand: () => act({ k: 'raise' }),
    lowerHand: () => act({ k: 'lower' }),
    grant: (to) => act({ k: 'grant', to }),
    revoke: (to) => act({ k: 'revoke', to }),
    close: () => act({ k: 'close' }),
    /** Panggil berkala: MC menyiarkan state agar tamu yang baru masuk ikut tahu. */
    tick() {
      set(prune(state, present()));
      if (state.host === selfId() && now() - lastSync >= PARTY.syncMs) {
        lastSync = now();
        net.sendParty?.({ k: 'sync', sp: state.speakers, h: state.hands });
      }
    },
  };
}
