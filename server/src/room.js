import { clampArenaPosition, normalizeMovement } from '../../game/src/game-rules.js';

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
    const angle = (this.spawnCounter++ * 2.399963) % (Math.PI * 2); // sudut emas, sebar rata
    const radius = 3 + (this.spawnCounter % 4);
    const player = {
      id,
      name: sanitizeName(name),
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      rot: 0,
      input: { x: 0, z: 0 },
      seq: 0,
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
    return true;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, 0.25);
    for (const p of this.players.values()) {
      const next = clampArenaPosition({
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
    }));
  }
}
