// Jaringan pertandingan bulu tangkis lewat data channel LiveKit (topik sendiri, tanpa mengubah livekit-net.js).
// Tidak ada server otoritatif di mode LiveKit, jadi satu pemain menjadi TUAN RUMAH: dia menjalankan `createDuel`
// (fisika, aturan, skor) dan menyiarkan snapshot. Pemain lawan hanya mengirim perintah (servis/pukul) dan
// posisinya dibaca tuan rumah dari data posisi yang sudah ada, sehingga lawan tidak bisa mengarang jangkauan pukul.
// Penonton menerima snapshot yang sama. Bila tuan rumah keluar/putus, meja ditutup (tanpa pindah tuan rumah).
import { createDuel, createDuelMirror } from './badminton-duel.js';

export const DUEL_TOPIC = 'orbit-bd';
export const HOST_TIMEOUT_MS = 4000;
const RALLY_INTERVAL_MS = 50;
const IDLE_INTERVAL_MS = 250;
const enc = new TextEncoder();
const dec = new TextDecoder();
const clamp1 = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.62);

export function createDuelNet({ room, selfId, frame, getPlayerPos, now = () => Date.now(), random = Math.random, eventName = 'dataReceived', onEvent = () => {} }) {
  const mirror = createDuelMirror();
  let duel = null; // hanya ada di tuan rumah
  let hostId = null; // tuan rumah yang kita ikuti (diri sendiri bila kita tuan rumah)
  let lastBroadcast = 0;

  const send = (obj, { to, reliable = true } = {}) => {
    try {
      const opts = { reliable, topic: DUEL_TOPIC };
      if (to) opts.destinationIdentities = to;
      const p = room.localParticipant.publishData(enc.encode(JSON.stringify(obj)), opts);
      p?.catch?.(() => {});
    } catch {
      /* sambungan putus: akan dipulihkan LiveKit */
    }
  };

  const localPos = (id) => {
    const w = getPlayerPos(id);
    return w && Number.isFinite(w.x) && Number.isFinite(w.z) ? frame.toLocal({ x: w.x, z: w.z }) : null;
  };

  const alive = (id) => id === selfId || !!room.remoteParticipants?.has?.(id);

  const broadcast = (reliable = false) => {
    if (!duel) return;
    lastBroadcast = now();
    const s = duel.snapshot();
    mirror.apply(s, lastBroadcast);
    send({ k: 'st', s }, { reliable });
  };

  const closeTable = (reason) => {
    if (duel) send({ k: 'closed' });
    duel = null;
    hostId = null;
    mirror.reset();
    if (reason) onEvent({ type: 'closed', reason });
  };

  const onData = (payload, participant, _kind, topic) => {
    if (topic !== DUEL_TOPIC) return;
    const sender = participant?.identity;
    if (!sender || sender === selfId) return;
    let msg;
    try {
      msg = JSON.parse(dec.decode(payload));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.k === 'st') {
      if (duel) {
        // Dua orang membuka meja bersamaan: id yang lebih kecil menang, yang lain bergabung ke dia.
        if (sender < selfId && duel.phase === 'lobby' && !duel.ids.b) {
          duel = null;
          mirror.reset();
          hostId = sender;
          mirror.apply(msg.s, now());
          send({ k: 'join' }, { to: [sender] });
        }
        return;
      }
      if (hostId && hostId !== sender && alive(hostId) && mirror.ageMs(now()) < HOST_TIMEOUT_MS) return; // sudah punya tuan rumah
      if (hostId !== sender) {
        mirror.reset(); // nomor snapshot tuan rumah baru mulai dari awal
        hostId = sender;
      }
      mirror.apply(msg.s, now());
      return;
    }
    if (msg.k === 'closed') {
      if (!duel && sender === hostId) {
        hostId = null;
        mirror.reset();
        onEvent({ type: 'closed', reason: 'host-left' });
      }
      return;
    }
    if (msg.k === 'no') {
      if (sender === hostId) onEvent({ type: 'refused', reason: String(msg.r ?? '').slice(0, 24) });
      return;
    }
    if (!duel) return; // perintah di bawah hanya untuk tuan rumah
    if (msg.k === 'join') {
      const res = duel.join(sender);
      if (res.ok) broadcast(true);
      else send({ k: 'no', r: res.reason }, { to: [sender] });
    } else if (msg.k === 'leave') {
      const res = duel.leave(sender);
      if (res.ok) {
        broadcast(true);
        onEvent({ type: 'opponent-left', forfeit: res.forfeit });
      }
    } else if (msg.k === 'sv') {
      if (duel.serve(sender, { power: clamp01(msg.p), aimX: clamp1(msg.ax) }).ok) broadcast(true);
    } else if (msg.k === 'hit') {
      const pos = localPos(sender); // posisi dibaca dari data posisi pemain, bukan dari pesan
      if (pos && duel.hit(sender, pos, { aim: clamp1(msg.ax) }).ok) broadcast(true);
    }
  };

  room.on(eventName, onData);

  return {
    get role() { return duel ? 'host' : mirror.sideOf(selfId) ? 'guest' : 'none'; },
    get side() { return mirror.sideOf(selfId); },
    get snap() { return mirror.snap; },
    get hostId() { return hostId; },
    shuttleAt: (t = now()) => mirror.shuttleAt(t),

    /** Ikut bermain: bergabung ke meja yang ada, atau membuka meja baru (jadi tuan rumah). */
    requestPlay() {
      if (duel || mirror.sideOf(selfId)) return { ok: true, already: true };
      const snap = mirror.snap;
      if (snap && hostId && mirror.ageMs(now()) < HOST_TIMEOUT_MS && alive(hostId)) {
        if (snap.ph === 'over') return { ok: false, reason: 'selesai' };
        if (snap.a && snap.b) return { ok: false, reason: 'penuh' };
        send({ k: 'join' }, { to: [hostId] });
        return { ok: true, pending: true };
      }
      mirror.reset();
      duel = createDuel({ random });
      duel.join(selfId);
      hostId = selfId;
      broadcast(true);
      return { ok: true, host: true };
    },

    leave() {
      if (duel) {
        duel.leave(selfId);
        broadcast(true); // lawan melihat hasil WO sebelum meja ditutup
        closeTable(null);
        return;
      }
      if (hostId && mirror.sideOf(selfId)) send({ k: 'leave' }, { to: [hostId] });
      mirror.reset();
      hostId = null;
    },

    serve({ power = 0.62, aimX = 0 } = {}) {
      if (duel) {
        const res = duel.serve(selfId, { power, aimX });
        if (res.ok) broadcast(true);
        return res;
      }
      if (!hostId || !mirror.sideOf(selfId)) return { ok: false, reason: 'tidak-ikut' };
      send({ k: 'sv', p: power, ax: aimX }, { to: [hostId] });
      return { ok: true, sent: true };
    },

    hit({ aim = 0 } = {}) {
      if (duel) {
        const pos = localPos(selfId);
        if (!pos) return { ok: false, reason: 'posisi-tidak-diketahui' };
        const res = duel.hit(selfId, pos, { aim });
        if (res.ok) broadcast(true);
        return res;
      }
      if (!hostId || !mirror.sideOf(selfId)) return { ok: false, reason: 'tidak-ikut' };
      send({ k: 'hit', ax: aim }, { to: [hostId] });
      return { ok: true, sent: true };
    },

    canServe() {
      if (duel) return duel.canServe(selfId);
      const s = mirror.snap;
      const side = mirror.sideOf(selfId);
      return !!(s && side && s.ph === 'serve' && s.sv === side);
    },

    canHitNow() {
      const pos = localPos(selfId);
      if (!pos) return false;
      if (duel) return duel.canHit(selfId, pos);
      return mirror.canHit(selfId, pos, now());
    },

    /** Panggil tiap frame. Tuan rumah: majukan fisika dan siarkan; yang lain: pantau tuan rumah. */
    tick(dt) {
      const t = now();
      if (duel) {
        const events = duel.tick(dt);
        for (const id of [duel.ids.a, duel.ids.b]) {
          if (id && !alive(id)) {
            const res = duel.leave(id);
            broadcast(true);
            onEvent({ type: 'opponent-left', forfeit: res.forfeit });
          }
        }
        const interval = duel.phase === 'rally' ? RALLY_INTERVAL_MS : IDLE_INTERVAL_MS;
        if (events.length > 0) broadcast(true);
        else if (t - lastBroadcast >= interval) broadcast(false);
        return;
      }
      if (hostId && (mirror.ageMs(t) > HOST_TIMEOUT_MS || !alive(hostId))) {
        hostId = null;
        mirror.reset();
        onEvent({ type: 'closed', reason: 'host-lost' });
      }
    },

    dispose() {
      room.off?.(eventName, onData);
      if (duel) closeTable(null);
    },
  };
}
