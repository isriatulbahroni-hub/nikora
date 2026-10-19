// Transport multiplayer tanpa server sendiri: posisi, aksi, chat, dan salaman lewat data channel LiveKit
// (satu ruang yang sama dengan suara). API-nya sama dengan NetClient supaya main.js dan multiplayer-view.js tidak berubah.
// Konsekuensi: tidak ada server otoritatif (tiap klien memegang posisinya sendiri), cukup untuk ruang sosial.
import { sanitizeConfig } from './avatar-config.js';
import { attachModeration } from './moderated-net.js';

const TOPIC = 'orbit';
const STATE_INTERVAL_MS = 100;
const NEAR_RANGE = 20; // m: yang dalam jarak ini menerima posisi kita 10x/dtk, yang lebih jauh 2x/dtk (hemat data untuk ruang ramai)
const FAR_INTERVAL_MS = 500;
const MOVE_EPS = 0.02; // perubahan posisi/arah di bawah ini dianggap diam (cukup heartbeat 1x/dtk)
const REJOIN_DELAYS_MS = [500, 1500, 3000, 6000, 10000, 15000, 15000];
const HEARTBEAT_MS = 1000;
const GREET_RANGE = 2.6; // sedikit longgar dari 2,2 m di UI karena latensi
const GREET_TTL_MS = 8000;
const GREET_DURATION_MS = 2600;
const KINDS = ['handshake', 'highfive', 'wave', 'bow'];
const DANCE_MS = 45_000;
const GESTURE_MS = 1800;
const GESTURES = ['wave', 'bow', 'spin']; // gestur solo dari Cermin Gerak
const REMOTE_ACTS = [...KINDS, 'dance', 'spin'];
const POSE_NAME = /^[a-z_]{1,16}$/; // nama gerakan duduk/shalat di masjid (mis. "bersila", "sujud"); hanya huruf kecil dan garis bawah
const enc = new TextEncoder();
const dec = new TextDecoder();

const normAngle = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/** Pesan yang bisa ditindaklanjuti untuk kegagalan kredensial (tidak membocorkan nilai rahasia). */
export function describeCredFailure(cred) {
  if (cred?.reason === 'event') return 'undangan tidak ditemukan';
  if (cred?.reason === 'config' && Array.isArray(cred.missing) && cred.missing.length) {
    return `server belum dikonfigurasi, kurang: ${cred.missing.filter((m) => /^LIVEKIT_[A-Z_]+$/.test(m)).join(', ')}`;
  }
  return 'env LiveKit belum terbaca';
}

const ROLES = ['owner', 'mc'];

/** Peran dari metadata peserta (diisi server saat menerbitkan token). Selain 'owner'/'mc' dianggap tamu. */
export function roleOf(participant) {
  try {
    const role = JSON.parse(participant?.metadata || 'null')?.role;
    return ROLES.includes(role) ? role : 'guest';
  } catch {
    return 'guest';
  }
}

export class LiveKitNet {
  // moderation: pasang moderasi obrolan (lihat moderated-net.js). Bawaan: aktif hanya di browser (ada `window`),
  // sehingga tes di Node tidak berubah. Tanpa MODERATION_SECRET di server, moderasi tidak melakukan apa pun.
  constructor({ LiveKit, now = () => Date.now(), tokenUrl = '/api/token', fetchImpl, world, event, key, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), moderation = typeof window !== 'undefined' } = {}) {
    this.key = key || undefined; // kunci pemilik/MC (diperiksa server); tamu biasa tidak punya
    this.role = 'guest';
    this.restricted = false; // true bila server mewajibkan peran untuk membuka panggung
    this.sleep = sleep;
    this.status = 'idle'; // idle | online | reconnecting | offline
    this.closing = false;
    this.rejoining = false;
    this.snapshot = null;
    this.lastFarSent = 0;
    this.event = event ?? null; // slug acara dari undangan
    this.world = world; // 'villa' memakai kanal terpisah dari aula
    this.LiveKit = LiveKit;
    this.now = now;
    this.tokenUrl = tokenUrl;
    // Bungkus agar `fetch` tidak dipanggil dengan this=LiveKitNet (browser melempar "Illegal invocation").
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.room = null;
    this.id = null;
    this.handlers = { welcome: [], state: [], left: [], chat: [], close: [], error: [], 'greet-req': [], 'greet-declined': [], voice: [], party: [], screen: [], 'screen-track': [], status: [], rejoined: [] };
    this.self = { id: null, name: 'Tamu', x: 0, z: 9.4, y: 0, rot: 0, sit: null, act: null, with: null, until: 0, av: null, au: null };
    this.remotes = new Map();
    this.screenTracks = new Map(); // id peserta -> { video, audio } untuk Layar Tancap
    this.pending = new Map(); // id pengirim -> { kind, expires, pos }
    this.outgoing = new Map(); // id tujuan -> posisi kita saat mengajak
    this.lastSent = 0;
    this.lastChatAt = 0;
    this.timer = null;
    if (moderation) attachModeration(this, typeof moderation === 'object' ? moderation : {});
  }

  /** Boleh menjadi MC? Mode terbuka: semua; mode terbatas: hanya pemilik/MC yang terverifikasi. */
  canHost(id) {
    if (!this.restricted) return true;
    const role = id === this.id ? this.role : this.remotes.get(id)?.role;
    return ROLES.includes(role);
  }

  get players() {
    return [this.self, ...this.remotes.values()];
  }

  on(event, fn) {
    this.handlers[event].push(fn);
    return this;
  }

  #emit(event, payload) {
    for (const fn of this.handlers[event]) fn(payload);
  }

  async #fetchCred(name) {
    const res = await this.fetch(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, world: this.world, event: this.event, key: this.key }) });
    if (!res.ok) throw new Error(`api/token HTTP ${res.status}`);
    const cred = await res.json();
    if (!cred.enabled) throw new Error(describeCredFailure(cred));
    return cred;
  }

  #setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.#emit('status', { status });
  }

  async connect(_url, name = 'Tamu') {
    const cred = await this.#fetchCred(name);
    const LiveKit = this.LiveKit ?? (await import('livekit-client'));
    const { Room, RoomEvent } = LiveKit;
    const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.room = room;
    this.id = cred.id;
    this.role = ROLES.includes(cred.role) ? cred.role : 'guest';
    this.restricted = Boolean(cred.restricted);
    this.self.role = this.role;
    this.self.id = cred.id;
    this.self.name = name;
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== TOPIC || !participant) return;
      this.#onData(participant, payload);
    });
    room.on(RoomEvent.ParticipantConnected, (p) => {
      // Beri tahu pendatang baru posisi kita segera (tanpa menunggu heartbeat).
      this.#publishState({ to: [p.identity], reliable: true });
    });
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      const source = pub?.source ?? track.source;
      const key = this.#trackKey(track, source);
      const isScreen = source === 'screen_share' || source === 'screen_share_audio' || (source === 'camera' && track.kind === 'video');
      if (!key || !isScreen) return;
      const entry = this.screenTracks.get(participant.identity) ?? {};
      entry[key] = track;
      this.screenTracks.set(participant.identity, entry);
      this.#emit('screen-track', { id: participant.identity });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      const entry = this.screenTracks.get(participant.identity);
      const key = this.#trackKey(track, pub?.source ?? track.source);
      if (!entry || !key || entry[key] !== track) return;
      delete entry[key];
      if (!entry.video && !entry.audio) this.screenTracks.delete(participant.identity);
      this.#emit('screen-track', { id: participant.identity });
    });
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      if (this.screenTracks.delete(p.identity)) this.#emit('screen-track', { id: p.identity });
      if (this.remotes.delete(p.identity)) this.#emit('left', { id: p.identity });
    });
    // Putus sesaat: LiveKit memulihkan sendiri. Putus total: kita masuk lagi dengan token baru (lihat #rejoin).
    room.on(RoomEvent.Reconnecting, () => this.#setStatus('reconnecting'));
    room.on(RoomEvent.Reconnected, () => { this.#setStatus('online'); this.#publishState({ reliable: true }); });
    room.on(RoomEvent.Disconnected, () => {
      if (this.closing) this.#emit('close', {});
      else this.#rejoin();
    });
    // Tab kembali aktif atau internet kembali: pastikan tersambung dan posisi kita terkirim.
    if (typeof document !== 'undefined') {
      this._onVisible = () => this.#resume();
      document.addEventListener('visibilitychange', this._onVisible);
      globalThis.addEventListener?.('online', this._onVisible);
    }
    await room.connect(cred.url, cred.token);
    this.#setStatus('online');
    for (const p of room.remoteParticipants.values()) this.remotes.set(p.identity, this.#blank(p));
    this.timer = setInterval(() => this.#tick(), 100);
    this.timer.unref?.();
    this.#publishState({ reliable: true });
    const welcome = { t: 'welcome', id: this.id, players: this.players };
    this.#emit('welcome', welcome);
    return welcome;
  }

  #resume() {
    if (this.closing || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    if (this.room?.state === 'disconnected') this.#rejoin();
    else this.#publishState({ reliable: true });
  }

  /** Masuk lagi ke ruang yang sama setelah putus total, dengan jeda yang makin panjang. Identitas baru; peserta lain dimuat ulang. */
  async #rejoin() {
    if (this.rejoining || this.closing) return;
    this.rejoining = true;
    this.#setStatus('reconnecting');
    for (const delay of REJOIN_DELAYS_MS) {
      await this.sleep(delay);
      if (this.closing) break;
      try {
        const cred = await this.#fetchCred(this.self.name);
        await this.room.connect(cred.url, cred.token);
        this.id = cred.id;
        this.self.id = cred.id;
        this.role = ROLES.includes(cred.role) ? cred.role : 'guest'; // kunci pemilik/MC tetap dipakai saat masuk ulang
        this.restricted = Boolean(cred.restricted);
        this.self.role = this.role;
        this.self.act = null; // interaksi berpasangan sebelum putus dibatalkan
        this.self.with = null;
        this.remotes.clear();
        this.screenTracks.clear();
        this.pending.clear();
        this.outgoing.clear();
        for (const p of this.room.remoteParticipants.values()) this.remotes.set(p.identity, this.#blank(p));
        this.snapshot = null;
        this.#publishState({ reliable: true });
        this.rejoining = false;
        this.#setStatus('online');
        this.#emit('rejoined', { id: this.id });
        this.#emit('state', { t: 'state', players: this.players });
        return;
      } catch (error) {
        if (/belum dikonfigurasi|tidak ditemukan/.test(String(error?.message))) break; // tidak akan berhasil dengan mengulang
      }
    }
    this.rejoining = false;
    this.#setStatus('offline');
    this.#emit('close', {});
  }

  #blank(p) {
    return { id: p.identity, name: p.name || 'Tamu', x: 0, z: 9.4, y: 0, rot: 0, sit: null, act: null, with: null, av: null, role: roleOf(p) };
  }

  #onData(participant, payload) {
    let m;
    try {
      m = JSON.parse(dec.decode(payload));
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const id = participant.identity;
    if (m.t === 's') {
      const prev = this.remotes.get(id) ?? this.#blank(participant);
      const kind = REMOTE_ACTS.includes(m.a) ? m.a : null;
      const next = {
        ...prev,
        name: participant.name || prev.name,
        x: num(m.x, prev.x),
        z: num(m.z, prev.z),
        y: num(m.y, prev.y ?? 0),
        rot: num(m.r, prev.rot),
        sit: Number.isInteger(m.i) ? m.i : null,
        act: kind,
        with: typeof m.w === 'string' ? m.w : null,
        av: Array.isArray(m.v) ? sanitizeConfig(m.v) : prev.av,
        au: Number.isInteger(m.u) && m.u >= 0 && m.u < 4 ? m.u : prev.au, // bagian hari pengirim untuk aura
        role: roleOf(participant), // dari metadata token (ditandatangani server), bukan dari isi pesan
      };
      // Gerakan duduk/shalat (masjid): hanya ada bila pengirim sedang melakukannya; pesan tanpa "q" berarti berdiri biasa.
      if (typeof m.q === 'string' && POSE_NAME.test(m.q)) next.pose = m.q;
      else delete next.pose;
      this.remotes.set(id, next);
      // Dua orang di kursi yang sama: id lebih besar mengalah.
      if (this.self.sit !== null && Number.isInteger(m.i) && m.i === this.self.sit && id < this.id) this.self.sit = null;
      this.#emit('state', { t: 'state', players: this.players });
    } else if (m.t === 'c') {
      const text = typeof m.x === 'string' ? m.x.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 160) : '';
      if (text) this.#emit('chat', { t: 'chat', id, name: participant.name || 'Tamu', text, ts: this.now() });
    } else if (m.t === 'g') {
      this.#onGreet(participant, m);
    } else if (m.t === 'p') {
      this.#emit('party', { from: id, msg: m });
    } else if (m.t === 'sc') {
      this.#emit('screen', { from: id, msg: m });
    }
  }

  #onGreet(participant, m) {
    const id = participant.identity;
    const r = this.remotes.get(id);
    const t = this.now();
    if (m.k === 'req') {
      if (!KINDS.includes(m.kind) || !r) return;
      const near = Math.hypot(r.x - this.self.x, r.z - this.self.z) <= GREET_RANGE;
      if (!near || this.self.sit !== null || this.self.act) return;
      this.pending.set(id, { kind: m.kind, expires: t + GREET_TTL_MS, pos: { x: num(m.x, r.x), z: num(m.z, r.z) } });
      this.#emit('greet-req', { t: 'greet-req', from: id, name: participant.name || 'Tamu', kind: m.kind });
    } else if (m.k === 'ok') {
      const mine = this.outgoing.get(id);
      this.outgoing.delete(id);
      if (!mine) return;
      const kind = KINDS.includes(m.kind) ? m.kind : 'handshake';
      this.#startPair(id, kind, mine, { x: num(m.x, r?.x), z: num(m.z, r?.z) });
    } else if (m.k === 'no') {
      this.#emit('greet-declined', { t: 'greet-declined', by: id });
    }
  }

  /** Hadapkan diri ke pasangan dan rapikan jarak 0,9 m (rumus sama dengan server otoritatif). */
  // Kedua sisi memakai pasangan posisi yang SAMA (posisi pengaju saat mengajak + posisi penerima saat menjawab),
  // sehingga hasilnya konsisten walau ada latensi.
  #startPair(partnerId, kind, mine, theirs) {
    const s = this.self;
    const dx = theirs.x - mine.x;
    const dz = theirs.z - mine.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ux = dx / dist;
    const uz = dz / dist;
    const mx = (mine.x + theirs.x) / 2;
    const mz = (mine.z + theirs.z) / 2;
    s.x = mx - ux * 0.45;
    s.z = mz - uz * 0.45;
    s.rot = normAngle(Math.atan2(-ux, -uz));
    s.act = kind;
    s.with = partnerId;
    s.until = this.now() + GREET_DURATION_MS;
    this.#publishState({ reliable: true });
  }

  #tick() {
    const t = this.now();
    for (const [id, p] of this.pending) if (p.expires < t) this.pending.delete(id);
    if (this.self.act && this.self.until <= t) {
      this.self.act = null;
      this.self.with = null;
      this.#publishState({ reliable: true });
    } else if (t - this.lastSent >= HEARTBEAT_MS) {
      this.#publishState();
    }
  }

  #send(obj, { to, reliable = false } = {}) {
    if (!this.room) return;
    const opts = { reliable, topic: TOPIC };
    if (to) opts.destinationIdentities = to;
    this.room.localParticipant.publishData(enc.encode(JSON.stringify(obj)), opts).catch(() => {});
  }

  /** Isi pesan state kita (sama untuk heartbeat, gerak dekat, dan gerak jauh). "q" hanya ada saat sedang duduk/shalat di masjid. */
  #statePayload() {
    const s = this.self;
    return { t: 's', x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: +(s.y ?? 0).toFixed(2), r: +s.rot.toFixed(2), i: s.sit, a: s.act, w: s.with, v: s.av, u: s.au, ...(s.pose ? { q: s.pose } : {}) };
  }

  #remember() {
    const s = this.self;
    this.snapshot = { x: s.x, z: s.z, y: s.y ?? 0, r: s.rot, i: s.sit, a: s.act, w: s.with, v: s.av, u: s.au, q: s.pose ?? null };
  }

  #publishState(opts) {
    this.lastSent = this.now();
    this.#remember();
    this.#send(this.#statePayload(), opts);
  }

  #moved() {
    const s = this.self;
    const n = this.snapshot;
    return !n || Math.abs(s.x - n.x) > MOVE_EPS || Math.abs(s.z - n.z) > MOVE_EPS || Math.abs((s.y ?? 0) - n.y) > MOVE_EPS || Math.abs(s.rot - n.r) > MOVE_EPS || s.sit !== n.i || s.act !== n.a || s.with !== n.w || s.av !== n.v || (s.pose ?? null) !== n.q;
  }

  /** Gerak: yang dekat menerima 10x/dtk, yang jauh 2x/dtk. Diam (tidak berubah) tidak mengirim apa pun selain heartbeat. */
  #publishMove() {
    const s = this.self;
    const t = this.now();
    const near = [];
    const far = [];
    for (const r of this.remotes.values()) (Math.hypot(r.x - s.x, r.z - s.z) <= NEAR_RANGE ? near : far).push(r.id);
    const payload = this.#statePayload();
    if (near.length) this.#send(payload, { to: near });
    if (far.length && t - this.lastFarSent >= FAR_INTERVAL_MS) {
      this.lastFarSent = t;
      this.#send(payload, { to: far });
    }
    this.lastSent = t;
    this.#remember();
  }

  /** Dipanggil main.js tiap frame (dibatasi view). pos = posisi lokal; arah (x,z) tidak dipakai karena tiap klien menghitung geraknya sendiri. */
  sendInput(_dx, _dz, rot, sit, pos) {
    const s = this.self;
    if (!s.with && pos) {
      s.x = num(pos.x, s.x);
      s.z = num(pos.z, s.z);
      s.y = num(pos.y, s.y ?? 0);
      s.rot = num(rot, s.rot);
    }
    if (sit !== undefined) s.sit = sit;
    const idle = this.now() - this.lastSent;
    if (idle >= STATE_INTERVAL_MS && this.#moved()) this.#publishMove();
    else if (idle >= HEARTBEAT_MS) this.#publishState(); // diam: cukup 1x/dtk (sekaligus menyelesaikan tabrakan kursi)
  }

  /** Avatar buatan pemain (array wire). Disiarkan segera lalu ikut tiap heartbeat untuk tamu yang baru masuk. */
  setAvatar(wire) {
    this.self.av = Array.isArray(wire) ? wire.slice(0, 6) : null;
    this.#publishState({ reliable: true });
  }

  /** Gerakan duduk bersila/shalat di masjid (nama dari masjid-posture-data.js); null = berdiri. Disiarkan segera dan ikut tiap heartbeat. */
  setPose(name) {
    const q = typeof name === 'string' && POSE_NAME.test(name) ? name : null;
    if ((this.self.pose ?? null) === q) return;
    if (q) this.self.pose = q;
    else delete this.self.pose;
    this.#publishState({ reliable: true });
  }

  /** Pesan Party Room (panggung, angkat tangan). Tanpa server otoritatif: validasi dilakukan tiap penerima. */
  sendParty(msg) {
    this.#send({ ...msg, t: 'p' }, { reliable: true });
  }

  /** Pesan Layar Tancap (operator, putar/jeda, sinkron). Validasi dilakukan tiap penerima. */
  sendScreen(msg) {
    this.#send({ ...msg, t: 'sc' }, { reliable: true });
  }

  /** Track video/audio layar dari peserta lain: dicatat agar controller yang dibuat belakangan tetap menemukannya. */
  #trackKey(track, source) {
    return source === 'screen_share_audio' ? 'audio' : track.kind === 'video' ? 'video' : null;
  }

  /** Siarkan kamera ke layar (operator). */
  async publishCamera(on = true) {
    await this.room?.localParticipant.setCameraEnabled(on);
    return on;
  }

  /** Siarkan MediaStream (mis. video dari HP lewat captureStream) ke layar. Mengembalikan fungsi untuk menghentikan. */
  async publishStream(stream) {
    const LiveKit = this.LiveKit ?? (await import('livekit-client'));
    const published = [];
    for (const track of stream.getTracks()) {
      const source = track.kind === 'video' ? LiveKit.Track.Source.ScreenShare : LiveKit.Track.Source.ScreenShareAudio;
      // Simulcast + batas bitrate: tamu yang jauh/jaringan lemah otomatis menerima lapisan lebih ringan.
      const options = track.kind === 'video' ? { source, simulcast: true, videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 30 } } : { source };
      await this.room.localParticipant.publishTrack(track, options);
      published.push(track);
    }
    return async () => {
      for (const t of published) await this.room?.localParticipant.unpublishTrack(t).catch(() => {});
    };
  }

  sendChat(text) {
    const t = this.now();
    if (typeof text !== 'string' || t - this.lastChatAt < 800) return;
    const clean = text.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 160);
    if (!clean) return;
    this.lastChatAt = t;
    this.#send({ t: 'c', x: clean }, { reliable: true });
    this.#emit('chat', { t: 'chat', id: this.id, name: this.self.name, text: clean, ts: t }); // gema lokal
  }

  /** Bagian hari (0-3) di perangkat pengirim; dipakai semua klien untuk warna aura yang sama. */
  setAura(part) {
    this.self.au = Number.isInteger(part) && part >= 0 && part < 4 ? part : null;
    this.#publishState({ reliable: true });
  }

  /** Gestur solo singkat (melambai, membungkuk, berputar) dari Cermin Gerak. Mengembalikan true bila diterima. */
  setGesture(kind) {
    if (!GESTURES.includes(kind) || this.self.sit !== null || this.self.act) return false;
    this.self.act = kind;
    this.self.with = null;
    this.self.until = this.now() + GESTURE_MS;
    this.#publishState({ reliable: true });
    return true;
  }

  /** Joget solo: terlihat semua orang, berhenti sendiri setelah 45 detik atau saat pemain bergerak/duduk. */
  setDance(on) {
    if (on && this.self.sit === null && !this.self.act) {
      this.self.act = 'dance';
      this.self.with = null;
      this.self.until = this.now() + DANCE_MS;
      this.#publishState({ reliable: true });
    } else if (!on && this.self.act === 'dance') {
      this.self.act = null;
      this.#publishState({ reliable: true });
    }
  }

  sendGreet(to, kind) {
    const r = this.remotes.get(to);
    if (!KINDS.includes(kind) || !r || this.self.sit !== null || this.self.act) return;
    if (Math.hypot(r.x - this.self.x, r.z - this.self.z) > GREET_RANGE) return;
    if (kind === 'wave' || kind === 'bow') {
      this.self.act = kind;
      this.self.with = null;
      this.self.until = this.now() + GREET_DURATION_MS;
      this.#publishState({ reliable: true });
      return;
    }
    const pos = { x: this.self.x, z: this.self.z };
    this.outgoing.set(to, pos);
    this.#send({ t: 'g', k: 'req', kind, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) }, { to: [to], reliable: true });
  }

  replyGreet(from, accept) {
    const p = this.pending.get(from);
    this.pending.delete(from);
    if (!p || p.expires < this.now()) return;
    if (!accept) return this.#send({ t: 'g', k: 'no' }, { to: [from], reliable: true });
    const mine = { x: this.self.x, z: this.self.z };
    this.#send({ t: 'g', k: 'ok', kind: p.kind, x: +mine.x.toFixed(2), z: +mine.z.toFixed(2) }, { to: [from], reliable: true });
    this.#startPair(from, p.kind, mine, p.pos);
  }

  /** Suara memakai Room yang sama: langsung siap (tidak perlu token terpisah). */
  requestVoiceToken() {
    setTimeout(() => this.#emit('voice', { t: 'voice', enabled: true, room: this.room }), 0);
  }

  close() {
    this.closing = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisible);
      globalThis.removeEventListener?.('online', this._onVisible);
    }
    clearInterval(this.timer);
    this.room?.disconnect();
  }
}
