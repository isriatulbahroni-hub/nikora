import { normalizeMovement } from '../../game/src/game-rules.js';
import { HALL, SEATS, resolveCollisions } from '../../game/src/hall-layout.js';

export const ROOM_RULES = Object.freeze({
  maxPlayers: 50,
  playerSpeed: 5.2, // sama dengan PLAYER_SPEED di game offline
  maxNameLength: 24,
});

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
  }

  addPlayer(id, name) {
    if (this.players.has(id) || this.players.size >= this.rules.maxPlayers) return null;
    // Muncul di lorong pintu masuk (sisi z positif), tersebar dalam baris.
    const n = this.spawnCounter++;
    const player = {
      id,
      name: sanitizeName(name),
      x: ((n % 7) - 3) * 1.1,
      z: 9.4 - Math.floor(n / 7 % 8) * 0.6,
      rot: 0,
      input: { x: 0, z: 0 },
      seq: 0,
      sit: null, // id kursi bila sedang duduk
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    return this.players.delete(id);
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
    if (p.sit !== null) p.input = { x: 0, z: 0 };
    return true;
  }

  /** sit: id kursi (angka bulat) untuk duduk, null untuk berdiri. Server memvalidasi jarak dan kursi kosong. */
  #applySit(p, sit) {
    if (sit === null || sit === undefined) {
      p.sit = null;
      return true;
    }
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
      if (p.sit !== null) continue; // sedang duduk: tidak bergerak
      const next = resolveCollisions({
        x: p.x + p.input.x * this.rules.playerSpeed * safeDt,
        z: p.z + p.input.z * this.rules.playerSpeed * safeDt,
      });
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
    }));
  }
}
