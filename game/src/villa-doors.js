// Kunci kamar villa: kamar tamu dan suite premium bisa di-check-in, dikunci, dan diketuk.
// Murni (tanpa THREE, tanpa jaringan) supaya SERVER menjadi satu-satunya penentu siapa boleh masuk.
//
// Aturan utama: pintu kamar TIDAK PERNAH terbuka otomatis. Kamar yang sudah di-check-in selalu terkunci
// untuk orang lain; hanya pemilik, atau tamu yang pintunya dibukakan pemilik lewat ketukan (izin sementara),
// yang boleh melewati pintu. Kunci hanya menahan orang MASUK: siapa pun yang sudah di dalam tetap bisa keluar.
// Kamar yang belum di-check-in tetap terbuka seperti biasa.

export const LOCK_RULES = Object.freeze({
  allowTtlMs: 60000, // izin masuk setelah ketukan diterima
  knockTtlMs: 20000, // ketukan kedaluwarsa bila tidak dijawab
  knockCooldownMs: 4000, // jeda minimum antar ketukan dari orang yang sama ke kamar yang sama
  doorRange: 2.6, // jarak maksimum ke pintu untuk check-in dan mengetuk
  maxPendingKnocks: 4, // ketukan yang menunggu jawaban per kamar
});

const LOCKABLE_KINDS = new Set(['guest', 'suite', 'bridal']);
const DOOR_DEPTH = 0.3; // sama dengan WALL_THICKNESS di villa-layout.js
const EPS = 1e-6;
const near = (a, b) => Math.abs(a - b) < EPS;
const fail = (reason) => ({ ok: false, reason });

/** Arah ke DALAM kamar untuk pintu yang berada di tepi kamar; null bila pintu bukan milik kamar itu. */
function inwardNormal(room, door) {
  const [x1, z1, x2, z2] = room.rect;
  if (door.orient === 'v') {
    if (door.z <= z1 || door.z >= z2) return null;
    if (near(door.x, x1)) return { nx: 1, nz: 0 };
    if (near(door.x, x2)) return { nx: -1, nz: 0 };
  } else {
    if (door.x <= x1 || door.x >= x2) return null;
    if (near(door.z, z1)) return { nx: 0, nz: 1 };
    if (near(door.z, z2)) return { nx: 0, nz: -1 };
  }
  return null;
}

function doorRect(door) {
  const h = DOOR_DEPTH / 2;
  const w = door.width / 2;
  return door.orient === 'h'
    ? { minX: door.x - w, maxX: door.x + w, minZ: door.z - h, maxZ: door.z + h }
    : { minX: door.x - h, maxX: door.x + h, minZ: door.z - w, maxZ: door.z + w };
}

function touches(rect, x, z, r) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, x));
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, z));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r - 1e-9;
}

/** Semua kamar yang bisa dikunci (kamar tamu, suite, kamar pengantin) beserta pintunya. */
export function lockableRooms(world) {
  const out = [];
  for (const L of world.levels) {
    for (const room of L.rooms) {
      if (!LOCKABLE_KINDS.has(room.kind)) continue;
      const doors = [];
      for (const d of L.doors) {
        const n = inwardNormal(room, d);
        if (!n) continue;
        doors.push({ id: `${room.id}#${doors.length}`, x: d.x, z: d.z, orient: d.orient, width: d.width, ...n, rect: doorRect(d) });
      }
      if (doors.length) out.push({ id: room.id, name: room.name, kind: room.kind, level: L.level, doors });
    }
  }
  return out;
}

/** Pintu kamar terdekat dari pemain di lantai yang sama; null bila tidak ada dalam jangkauan. */
export function doorNear(rooms, pos, range = LOCK_RULES.doorRange) {
  if (pos.stair != null) return null;
  const level = pos.level ?? 0;
  let best = null;
  for (const room of rooms) {
    if (room.level !== level) continue;
    for (const door of room.doors) {
      const dist = Math.hypot(door.x - pos.x, door.z - pos.z);
      if (dist <= range && (!best || dist < best.dist)) best = { room, door, dist };
    }
  }
  return best;
}

export class RoomLocks {
  constructor(world, rules = {}) {
    this.world = world;
    this.rules = { ...LOCK_RULES, ...rules };
    this.state = new Map(
      lockableRooms(world).map((r) => [r.id, { ...r, owner: null, locked: false, allowed: new Map(), knocks: new Map(), lastKnock: new Map() }]),
    );
    this.byOwner = new Map(); // id pemain -> id kamar
    this.version = 0; // naik tiap kali kepemilikan/kunci berubah (dipakai server untuk menyiarkan)
  }

  get rooms() {
    return [...this.state.values()];
  }

  #near(s, pos) {
    return doorNear([s], pos, this.rules.doorRange) !== null;
  }

  /** Bolehkah pemain melewati pintu kamar ini (masuk)? */
  canEnter(playerId, s, now = Date.now()) {
    if (!s.owner || !s.locked || s.owner === playerId) return true;
    return (s.allowed.get(playerId) ?? 0) > now;
  }

  checkIn(playerId, roomId, pos, now = Date.now()) {
    const s = this.state.get(roomId);
    if (!s) return fail('unknown-room');
    if (s.owner) return fail(s.owner === playerId ? 'already-yours' : 'taken');
    if (this.byOwner.has(playerId)) return fail('already-has-room');
    if (!this.#near(s, pos)) return fail('too-far');
    s.owner = playerId;
    s.locked = true;
    s.allowed.clear();
    s.knocks.clear();
    this.byOwner.set(playerId, roomId);
    this.version++;
    return { ok: true, room: roomId, now };
  }

  /** Melepas kamar milik pemain (check-out atau keluar dari server). Mengembalikan id kamar atau null. */
  release(playerId) {
    const roomId = this.byOwner.get(playerId);
    if (!roomId) return null;
    const s = this.state.get(roomId);
    s.owner = null;
    s.locked = false;
    s.allowed.clear();
    s.knocks.clear();
    s.lastKnock.clear();
    this.byOwner.delete(playerId);
    this.version++;
    return roomId;
  }

  checkOut(playerId) {
    const room = this.release(playerId);
    return room ? { ok: true, room } : fail('no-room');
  }

  /** Kunci paksa (dipakai saat pemilik mulai tidur). */
  lockOwned(playerId) {
    const s = this.state.get(this.byOwner.get(playerId));
    if (s && !s.locked) {
      s.locked = true;
      this.version++;
    }
  }

  /** Pemilik mengunci/membuka kamarnya. Saat pemilik tidur, kamar tidak bisa dibuka. */
  setLocked(playerId, locked, { sleeping = false } = {}) {
    const roomId = this.byOwner.get(playerId);
    if (!roomId) return fail('no-room');
    if (!locked && sleeping) return fail('sleeping');
    const s = this.state.get(roomId);
    if (s.locked !== locked) {
      s.locked = locked;
      if (locked) s.allowed.clear();
      this.version++;
    }
    return { ok: true, room: roomId, locked };
  }

  knock(visitorId, roomId, pos, now = Date.now()) {
    const s = this.state.get(roomId);
    if (!s || !s.owner) return fail('no-owner');
    if (s.owner === visitorId) return fail('own-room');
    if (!s.locked) return fail('not-locked');
    if (this.canEnter(visitorId, s, now)) return fail('already-allowed');
    if (!this.#near(s, pos)) return fail('too-far');
    if (now - (s.lastKnock.get(visitorId) ?? -Infinity) < this.rules.knockCooldownMs) return fail('too-soon');
    for (const [id, until] of s.knocks) if (until <= now) s.knocks.delete(id);
    if (s.knocks.size >= this.rules.maxPendingKnocks && !s.knocks.has(visitorId)) return fail('busy');
    s.lastKnock.set(visitorId, now);
    s.knocks.set(visitorId, now + this.rules.knockTtlMs);
    return { ok: true, room: roomId, to: s.owner };
  }

  /** Pemilik menjawab ketukan. accept=true memberi izin masuk sementara. */
  respondKnock(ownerId, visitorId, accept, now = Date.now()) {
    const roomId = this.byOwner.get(ownerId);
    if (!roomId) return fail('no-room');
    const s = this.state.get(roomId);
    const until = s.knocks.get(visitorId);
    s.knocks.delete(visitorId);
    if (until === undefined || until <= now) return fail('expired');
    if (accept) s.allowed.set(visitorId, now + this.rules.allowTtlMs);
    return { ok: true, room: roomId, visitor: visitorId, accepted: accept === true };
  }

  expire(now = Date.now()) {
    for (const s of this.state.values()) {
      for (const [id, until] of s.allowed) if (until <= now) s.allowed.delete(id);
      for (const [id, until] of s.knocks) if (until <= now) s.knocks.delete(id);
      for (const [id, at] of s.lastKnock) if (now - at > this.rules.knockCooldownMs) s.lastKnock.delete(id);
    }
  }

  /** Daftar kamar yang sedang dipakai: dikirim ke klien supaya pintu tampil terkunci/terbuka. */
  snapshot() {
    return this.rooms.filter((s) => s.owner).map((s) => ({ id: s.id, owner: s.owner, locked: s.locked }));
  }

  #blocked(pos, sx, sz, guards) {
    if (pos.stair != null) return false;
    for (const g of guards.get(pos.level) ?? []) {
      if (sx * g.nx + sz * g.nz > 1e-9 && touches(g.rect, pos.x, pos.z, this.world.radius)) return true;
    }
    return false;
  }

  /**
   * Gerak pemain dengan pintu terkunci sebagai penghalang searah (hanya menahan arah MASUK).
   * Dijalankan per langkah kecil supaya tidak bisa menembus pintu walau langkah server besar.
   */
  move(p, dx, dz, now = Date.now()) {
    const guards = new Map();
    for (const s of this.state.values()) {
      if (this.canEnter(p.id, s, now)) continue;
      const list = guards.get(s.level) ?? [];
      for (const d of s.doors) list.push(d);
      guards.set(s.level, list);
    }
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    const sx = dx / n;
    const sz = dz / n;
    let cur = { x: p.x, z: p.z, level: p.level ?? 0, stair: p.stair ?? null, y: p.y ?? 0 };
    for (let i = 0; i < n; i++) {
      let next = this.world.move(cur, sx, sz);
      if (guards.size && this.#blocked(next, sx, sz, guards)) {
        next = null;
        for (const [ax, az] of [[sx, 0], [0, sz]]) {
          if (!ax && !az) continue;
          const t = this.world.move(cur, ax, az);
          if (!this.#blocked(t, ax, az, guards)) {
            next = t;
            break;
          }
        }
      }
      if (next) cur = next;
    }
    return cur;
  }
}
