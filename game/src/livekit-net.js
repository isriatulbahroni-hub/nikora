// Transport multiplayer tanpa server sendiri: posisi, aksi, chat, dan salaman lewat data channel LiveKit
// (satu ruang yang sama dengan suara). API-nya sama dengan NetClient supaya main.js dan multiplayer-view.js tidak berubah.
// Konsekuensi: tidak ada server otoritatif (tiap klien memegang posisinya sendiri), cukup untuk ruang sosial.
import { sanitizeConfig } from './avatar-config.js';

const TOPIC = 'orbit';
const STATE_INTERVAL_MS = 100;
const HEARTBEAT_MS = 1000;
const GREET_RANGE = 2.6; // sedikit longgar dari 2,2 m di UI karena latensi
const GREET_TTL_MS = 8000;
const GREET_DURATION_MS = 2600;
const KINDS = ['handshake', 'highfive', 'wave', 'bow'];
const enc = new TextEncoder();
const dec = new TextDecoder();

const normAngle = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

export class LiveKitNet {
  constructor({ LiveKit, now = () => Date.now(), tokenUrl = '/api/token', fetchImpl, world } = {}) {
    this.world = world; // 'villa' memakai kanal terpisah dari aula
    this.LiveKit = LiveKit;
    this.now = now;
    this.tokenUrl = tokenUrl;
    // Bungkus agar `fetch` tidak dipanggil dengan this=LiveKitNet (browser melempar "Illegal invocation").
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.room = null;
    this.id = null;
    this.handlers = { welcome: [], state: [], left: [], chat: [], close: [], error: [], 'greet-req': [], 'greet-declined': [], voice: [], party: [] };
    this.self = { id: null, name: 'Tamu', x: 0, z: 9.4, y: 0, rot: 0, sit: null, act: null, with: null, until: 0, av: null };
    this.remotes = new Map();
    this.pending = new Map(); // id pengirim -> { kind, expires, pos }
    this.outgoing = new Map(); // id tujuan -> posisi kita saat mengajak
    this.lastSent = 0;
    this.lastChatAt = 0;
    this.timer = null;
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

  async connect(_url, name = 'Tamu') {
    const res = await this.fetch(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, world: this.world }) });
    if (!res.ok) throw new Error(`api/token HTTP ${res.status}`);
    const cred = await res.json();
    if (!cred.enabled) throw new Error('env LiveKit belum terbaca');
    const LiveKit = this.LiveKit ?? (await import('livekit-client'));
    const { Room, RoomEvent } = LiveKit;
    const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.room = room;
    this.id = cred.id;
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
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      if (this.remotes.delete(p.identity)) this.#emit('left', { id: p.identity });
    });
    room.on(RoomEvent.Disconnected, () => this.#emit('close', {}));
    await room.connect(cred.url, cred.token);
    for (const p of room.remoteParticipants.values()) this.remotes.set(p.identity, this.#blank(p));
    this.timer = setInterval(() => this.#tick(), 100);
    this.timer.unref?.();
    this.#publishState({ reliable: true });
    const welcome = { t: 'welcome', id: this.id, players: this.players };
    this.#emit('welcome', welcome);
    return welcome;
  }

  #blank(p) {
    return { id: p.identity, name: p.name || 'Tamu', x: 0, z: 9.4, y: 0, rot: 0, sit: null, act: null, with: null, av: null };
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
      const kind = KINDS.includes(m.a) ? m.a : null;
      this.remotes.set(id, {
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
      });
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

  #publishState(opts) {
    const s = this.self;
    this.lastSent = this.now();
    this.#send({ t: 's', x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: +(s.y ?? 0).toFixed(2), r: +s.rot.toFixed(2), i: s.sit, a: s.act, w: s.with, v: s.av }, opts);
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
    if (this.now() - this.lastSent >= STATE_INTERVAL_MS) this.#publishState();
  }

  /** Avatar buatan pemain (array wire). Disiarkan segera lalu ikut tiap heartbeat untuk tamu yang baru masuk. */
  setAvatar(wire) {
    this.self.av = Array.isArray(wire) ? wire.slice(0, 5) : null;
    this.#publishState({ reliable: true });
  }

  /** Pesan Party Room (panggung, angkat tangan). Tanpa server otoritatif: validasi dilakukan tiap penerima. */
  sendParty(msg) {
    this.#send({ ...msg, t: 'p' }, { reliable: true });
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
    clearInterval(this.timer);
    this.room?.disconnect();
  }
}
