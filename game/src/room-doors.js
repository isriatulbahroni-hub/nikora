// Kunci kamar villa di sisi klien: menghubungkan RoomLocks (logika murni) dengan jaringan.
//
// Dua transport, satu API:
//  - LiveKit (bawaan di Vercel, tanpa server otoritatif): pemilik kamar menyiarkan status kamarnya lewat data channel
//    (topik 'orbit-room'); tiap klien menegakkan kunci pada geraknya sendiri. Kooperatif: klien yang dimodifikasi bisa
//    menembusnya, sama seperti posisi dan duduk di transport ini.
//  - WebSocket (?server=): server otoritatif yang memutuskan; klien hanya meniru supaya geraknya tidak tersentak.
import { RoomLocks, doorNear } from './villa-doors.js';
import { LEVEL_HEIGHT } from './villa-layout.js';

const TOPIC = 'orbit-room';
const HEARTBEAT_MS = 5000;
const P2P_DOOR_RANGE = 3.4; // sedikit longgar dari 2,6 m karena posisi pemain lain terlambat
const enc = new TextEncoder();
const dec = new TextDecoder();

export const REASONS = Object.freeze({
  'too-far': 'Dekati pintu kamar dulu.',
  taken: 'Kamar ini sudah dipakai orang lain.',
  'already-has-room': 'Kamu sudah punya kamar. Check-out dulu.',
  'already-yours': 'Ini sudah kamarmu.',
  sleeping: 'Kamar tidak bisa dibuka saat kamu sedang tidur.',
  'too-soon': 'Tunggu sebentar sebelum mengetuk lagi.',
  busy: 'Pemilik sedang menerima banyak ketukan. Coba lagi nanti.',
  'no-owner': 'Kamar ini kosong, tidak ada yang bisa diketuk.',
  'not-locked': 'Pintunya tidak terkunci.',
  'already-allowed': 'Kamu sudah boleh masuk.',
  expired: 'Ketukan itu sudah kedaluwarsa.',
  'no-room': 'Kamu belum punya kamar.',
});

const fail = (reason) => ({ ok: false, reason });
const levelOf = (p) => Math.round((p?.y ?? 0) / LEVEL_HEIGHT);

export function createRoomDoors({ net, world, now = () => Date.now(), onKnock = () => {}, onNotice = () => {}, onChange = () => {} }) {
  const p2p = Boolean(net.room);
  const locks = new RoomLocks(world, p2p ? { doorRange: P2P_DOOR_RANGE } : {});
  let version = locks.version;
  let lastId = net.id;
  let known = new Set();
  let lastBeat = 0;
  let sleeping = false;
  let claim = null; // kamar yang baru kita ambil: untuk mengetahui bila kalah rebutan
  const lastKnockAt = new Map();

  const selfId = () => net.id;
  const mine = () => locks.byOwner.get(selfId()) ?? null;
  const ownRoom = () => (mine() ? locks.state.get(mine()) : null);
  const nameOf = (id) => net.players.find((p) => p.id === id)?.name ?? 'Tamu';
  const notice = (reason) => onNotice(REASONS[reason] ?? 'Tidak bisa dilakukan sekarang.');

  // ---------- P2P ----------
  const sendP2P = (msg, to) => {
    if (!net.room) return;
    const opts = { reliable: true, topic: TOPIC };
    if (to) opts.destinationIdentities = to;
    net.room.localParticipant.publishData(enc.encode(JSON.stringify(msg)), opts).catch(() => {});
  };
  const announce = (to) => {
    const s = ownRoom();
    if (!s) return;
    const t = now();
    sendP2P({ k: 'st', room: s.id, locked: s.locked, allow: [...s.allowed].map(([id, until]) => ({ id, ttl: until - t })).filter((a) => a.ttl > 0) }, to);
  };
  const posOf = (id) => {
    const p = net.players.find((q) => q.id === id);
    return p ? { x: p.x, z: p.z, level: levelOf(p), stair: null } : null;
  };

  function handleP2P(from, m) {
    if (!m || typeof m !== 'object' || from === selfId()) return;
    if (m.k === 'st' && typeof m.room === 'string') {
      const applied = locks.applyOwnerState(from, m.room, m.locked === true, Array.isArray(m.allow) ? m.allow.slice(0, 24) : [], now());
      if (applied && claim && mine() !== claim) {
        claim = null;
        onNotice(REASONS.taken);
      }
    } else if (m.k === 'out' && typeof m.room === 'string') {
      if (locks.byOwner.get(from) === m.room) locks.release(from);
    } else if (m.k === 'knock' && typeof m.room === 'string') {
      const pos = posOf(from);
      const s = locks.state.get(m.room);
      if (!pos || !s || s.owner !== selfId()) return;
      const r = locks.knock(from, m.room, pos, now());
      if (r.ok) onKnock({ from, name: nameOf(from), room: m.room, roomName: s.name });
    } else if (m.k === 'kr') {
      onNotice(m.ok === true ? 'Pintu dibukakan, silakan masuk.' : 'Ketukanmu ditolak.');
    }
  }

  if (p2p) {
    net.room.on('dataReceived', (payload, participant, _kind, topic) => {
      if (topic !== TOPIC || !participant) return;
      let m;
      try {
        m = JSON.parse(dec.decode(payload));
      } catch {
        return;
      }
      handleP2P(participant.identity, m);
    });
  } else {
    // ---------- WebSocket: server otoritatif ----------
    net.on('rooms', (m) => locks.applySnapshot(m.rooms, now()));
    net.on('knock', (m) => onKnock({ from: m.from, name: m.name ?? 'Tamu', room: m.room, roomName: locks.state.get(m.room)?.name ?? '' }));
    net.on('knock-result', (m) => {
      if (m.accepted) locks.allowSelf(selfId(), m.room, undefined, now());
      onNotice(m.accepted ? 'Pintu dibukakan, silakan masuk.' : 'Ketukanmu ditolak.');
    });
    net.on('room-error', (m) => notice(m.reason));
    if (Array.isArray(net.rooms)) locks.applySnapshot(net.rooms, now());
  }
  net.on('left', (m) => {
    locks.release(m.id);
  });

  // ---------- aksi pemain ----------
  const pending = { ok: true, pending: true };

  function checkIn(me) {
    const near = doorNear(locks.rooms, me, locks.rules.doorRange);
    if (!near) return fail('too-far');
    if (!p2p) {
      net.sendRoom({ act: 'checkin', room: near.room.id });
      return pending;
    }
    const r = locks.checkIn(selfId(), near.room.id, me, now());
    if (!r.ok) {
      notice(r.reason);
      return r;
    }
    claim = r.room;
    announce();
    onNotice(`Check-in di ${near.room.name}. Pintu terkunci untuk orang lain.`);
    return r;
  }

  function checkOut() {
    if (!p2p) {
      net.sendRoom({ act: 'checkout' });
      return pending;
    }
    const room = locks.release(selfId());
    if (!room) {
      notice('no-room');
      return fail('no-room');
    }
    claim = null;
    sendP2P({ k: 'out', room });
    onNotice('Check-out. Kamar terbuka lagi.');
    return { ok: true, room };
  }

  function setLocked(locked) {
    if (!p2p) {
      net.sendRoom({ act: 'lock', locked });
      return pending;
    }
    const r = locks.setLocked(selfId(), locked, { sleeping });
    if (!r.ok) {
      notice(r.reason);
      return r;
    }
    announce();
    return r;
  }

  function knock(me) {
    const near = doorNear(locks.rooms, me, locks.rules.doorRange);
    if (!near) return fail('too-far');
    const s = near.room;
    if (!p2p) {
      net.sendRoom({ act: 'knock', room: s.id });
      return pending;
    }
    if (!s.owner) return fail('no-owner');
    if (!s.locked) return fail('not-locked');
    if (now() - (lastKnockAt.get(s.id) ?? -Infinity) < locks.rules.knockCooldownMs) {
      notice('too-soon');
      return fail('too-soon');
    }
    lastKnockAt.set(s.id, now());
    sendP2P({ k: 'knock', room: s.id }, [s.owner]);
    onNotice('Mengetuk pintu…');
    return { ok: true, room: s.id };
  }

  function reply(from, accept) {
    if (!p2p) {
      net.sendRoom({ act: 'knock-reply', from, accept: accept === true });
      return pending;
    }
    const r = locks.respondKnock(selfId(), from, accept === true, now());
    if (!r.ok) {
      notice(r.reason);
      return r;
    }
    announce();
    sendP2P({ k: 'kr', room: r.room, ok: r.accepted }, [from]);
    return r;
  }

  /** Dipanggil tiap frame: tidur = kamar sendiri otomatis terkunci (mode server melakukannya sendiri). */
  function setSleeping(on) {
    if (on === sleeping) return;
    sleeping = on;
    if (on && p2p && mine()) {
      locks.lockOwned(selfId());
      announce();
    }
  }

  function tick() {
    const t = now();
    if (net.id !== lastId) {
      // masuk ulang dengan identitas baru: kamar lama dilepas (peserta lain sudah melihat kita keluar)
      if (lastId) locks.release(lastId);
      lastId = net.id;
      claim = null;
    }
    locks.expire(t);
    if (p2p && mine()) {
      const ids = new Set(net.players.filter((p) => p.id !== selfId()).map((p) => p.id));
      const fresh = [...ids].filter((id) => !known.has(id));
      known = ids;
      if (fresh.length) announce(fresh);
      if (t - lastBeat >= HEARTBEAT_MS) {
        lastBeat = t;
        announce();
      }
    }
    if (locks.version !== version) {
      version = locks.version;
      onChange();
    }
  }

  return {
    locks,
    p2p,
    selfId,
    ownRoom,
    tick,
    checkIn,
    checkOut,
    setLocked,
    knock,
    reply,
    setSleeping,
    nearDoor: (me) => doorNear(locks.rooms, me, locks.rules.doorRange),
    insideOwn: (me) => {
      const s = ownRoom();
      if (!s || (me.level ?? 0) !== s.level || me.stair != null) return false;
      const [x1, z1, x2, z2] = s.rect;
      return me.x >= x1 && me.x <= x2 && me.z >= z1 && me.z <= z2;
    },
    status: (s) => ({ owner: s.owner, locked: s.locked, mine: s.owner === selfId(), canEnter: locks.canEnter(selfId(), s, now()) }),
    /** Gerak dengan pintu terkunci sebagai penghalang masuk (menggantikan world.move). */
    move: (me, dx, dz) => locks.move({ id: selfId(), x: me.x, z: me.z, level: me.level, stair: me.stair, y: me.y }, dx, dz, now()),
  };
}
