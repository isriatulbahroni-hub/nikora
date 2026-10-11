import { normalizeMovement } from '../../game/src/game-rules.js';
import { HALL, SEATS, resolveCollisions } from '../../game/src/hall-layout.js';

export const ROOM_RULES = Object.freeze({
  maxPlayers: 50,
  playerSpeed: 5.2, // sama dengan PLAYER_SPEED di game offline
  maxNameLength: 24,
  maxChatLength: 160,
  chatIntervalMs: 800, // jeda minimum antar pesan per pemain (anti-spam)
  greetRange: 2.2, // jarak maksimum untuk mengajak salaman
  greetRequestTtlMs: 8000, // ajakan kedaluwarsa bila tidak dijawab
  greetDurationMs: 2600, // lama animasi berpasangan
});

export const GREET_KINDS = Object.freeze(['handshake', 'wave', 'highfive', 'bow']);

export function sanitizeChat(raw, maxLength = ROOM_RULES.maxChatLength) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Tamu';
  const clean = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, ROOM_RULES.maxNameLength);
  return clean || 'Tamu';
}

/**
 * Ruang virtual. Server adalah satu-satunya yang menghitung posisi:
 * klien hanya mengirim arah gerak (input), bukan koordinat.
 */
export class Room {
  constructor(rules = {}) {
    this.rules = { ...ROOM_RULES, ...rules };
    this.players = new Map();
    this.spawnCounter = 0;
    this.greetRequests = new Map(); // id penerima -> { from, kind, expires }
  }

  addPlayer(id, name) {
    if (this.players.has(id) || this.players.size >= this.rules.maxPlayers) return null;
    // Muncul di lorong pintu masuk (sisi z positif), tersebar dalam baris.
    const n = this.spawnCounter++;
    const world = this.rules.world; // dunia berdinding opsional (NIKORA Wedding Villa)
    const spawn = world
      ? world.constrain({ x: world.spawn.x + ((n % 5) - 2) * 1.2, z: world.spawn.z - (Math.floor(n / 5) % 4) * 1.2 })
      : { x: ((n % 7) - 3) * 1.1, z: 9.4 - Math.floor(n / 7 % 8) * 0.6 };
    const player = {
      id,
      name: sanitizeName(name),
      x: spawn.x,
      z: spawn.z,
      rot: 0,
      input: { x: 0, z: 0 },
      seq: 0,
      sit: null, // id kursi bila sedang duduk
      act: null, // interaksi aktif: { kind, with, until }
    };
    this.players.set(id, player);
    return player;
  }

  /** Pesan obrolan: dibersihkan, dibatasi panjang dan frekuensinya. Mengembalikan pesan atau null. */
  chat(id, rawText, nowMs = Date.now()) {
    const p = this.players.get(id);
    if (!p) return null;
    const text = sanitizeChat(rawText, this.rules.maxChatLength);
    if (!text) return null;
    if (nowMs - (p.lastChatAt ?? -Infinity) < this.rules.chatIntervalMs) return null;
    p.lastChatAt = nowMs;
    return { id: p.id, name: p.name, text, ts: nowMs };
  }

  removePlayer(id) {
    this.greetRequests.delete(id);
    for (const [to, req] of this.greetRequests) if (req.from === id) this.greetRequests.delete(to);
    const p = this.players.get(id);
    if (p?.act) this.#endAct(p);
    return this.players.delete(id);
  }

  #canInteract(a, b) {
    if (!a || !b || a === b) return false;
    if (a.sit !== null || b.sit !== null) return false;
    if (a.act || b.act) return false;
    return Math.hypot(a.x - b.x, a.z - b.z) <= this.rules.greetRange;
  }

  /** Ajakan interaksi (salaman, tos, dll). 'wave' dan 'bow' satu arah: langsung jalan tanpa persetujuan. */
  requestGreet(fromId, toId, kind, nowMs = Date.now()) {
    const a = this.players.get(fromId);
    const b = this.players.get(toId);
    if (!GREET_KINDS.includes(kind) || !this.#canInteract(a, b)) return null;
    if (kind === 'wave' || kind === 'bow') {
      a.act = { kind, with: null, until: nowMs + this.rules.greetDurationMs };
      return { auto: true, from: fromId, to: toId, kind };
    }
    this.greetRequests.set(toId, { from: fromId, kind, expires: nowMs + this.rules.greetRequestTtlMs });
    return { auto: false, from: fromId, to: toId, kind };
  }

  /** Penerima menjawab ajakan. accept=false menolak. Mengembalikan { from, to, kind } bila disetujui. */
  respondGreet(toId, fromId, accept, nowMs = Date.now()) {
    const req = this.greetRequests.get(toId);
    if (!req || req.from !== fromId || req.expires < nowMs) {
      this.greetRequests.delete(toId);
      return null;
    }
    this.greetRequests.delete(toId);
    if (!accept) return { declined: true, from: fromId, to: toId, kind: req.kind };
    const a = this.players.get(fromId);
    const b = this.players.get(toId);
    if (!this.#canInteract(a, b)) return null;
    // Saling berhadapan, jarak dirapikan ke 0.9 m di sekitar titik tengah.
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const half = 0.45;
    const ux = Math.sin(ang);
    const uz = Math.cos(ang);
    a.x = mx - ux * half; a.z = mz - uz * half;
    b.x = mx + ux * half; b.z = mz + uz * half;
    // Konvensi rot sama dengan avatar: menghadap -z saat rot=0 → rot = atan2(-dx, -dz).
    a.rot = ((Math.atan2(-ux, -uz) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    b.rot = ((Math.atan2(ux, uz) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const until = nowMs + this.rules.greetDurationMs;
    a.act = { kind: req.kind, with: toId, until };
    b.act = { kind: req.kind, with: fromId, until };
    a.input = { x: 0, z: 0 };
    b.input = { x: 0, z: 0 };
    return { from: fromId, to: toId, kind: req.kind };
  }

  #endAct(p) {
    const partner = p.act?.with ? this.players.get(p.act.with) : null;
    p.act = null;
    if (partner?.act?.with === p.id) partner.act = null;
  }

  expire(nowMs = Date.now()) {
    for (const [to, req] of this.greetRequests) if (req.expires < nowMs) this.greetRequests.delete(to);
    for (const p of this.players.values()) if (p.act && p.act.until <= nowMs) this.#endAct(p);
  }

  setInput(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg !== 'object') return false;
    const { x, z, rot, seq } = msg;
    if (![x, z, rot, seq].every(Number.isFinite)) return false;
    if (!Number.isInteger(seq) || seq <= p.seq) return false; // tolak input lama/ulang
    const dir = normalizeMovement(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, z)));
    p.input = dir;
    p.rot = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    p.seq = seq;
    if ('sit' in msg && !this.#applySit(p, msg.sit)) return false;
    if (p.sit !== null || p.act?.with) p.input = { x: 0, z: 0 };
    return true;
  }

  /** sit: id kursi (angka bulat) untuk duduk, null untuk berdiri. Server memvalidasi jarak dan kursi kosong. */
  #applySit(p, sit) {
    if (sit === null || sit === undefined) {
      p.sit = null;
      return true;
    }
    if (this.rules.world) return false; // kursi aula hanya berlaku di aula resepsi
    if (!Number.isInteger(sit) || sit < 0 || sit >= SEATS.length) return false;
    if (p.sit === sit) return true;
    for (const other of this.players.values()) if (other !== p && other.sit === sit) return false;
    const seat = SEATS[sit];
    if (Math.hypot(seat.x - p.x, seat.z - p.z) > HALL.sitRange + 0.6) return false; // toleransi latensi
    p.sit = sit;
    p.x = seat.x;
    p.z = seat.z;
    p.rot = seat.rot;
    return true;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, 0.25);
    for (const p of this.players.values()) {
      if (p.sit !== null || p.act?.with) continue; // duduk atau sedang berpasangan: tidak bergerak
      const dx = p.input.x * this.rules.playerSpeed * safeDt;
      const dz = p.input.z * this.rules.playerSpeed * safeDt;
      const next = this.rules.world ? this.rules.world.move(p, dx, dz) : resolveCollisions({ x: p.x + dx, z: p.z + dz });
      p.x = next.x;
      p.z = next.z;
    }
  }

  snapshot() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: +p.x.toFixed(3),
      z: +p.z.toFixed(3),
      rot: +p.rot.toFixed(3),
      seq: p.seq,
      sit: p.sit,
      act: p.act ? p.act.kind : null,
      with: p.act?.with ?? null,
    }));
  }
}
