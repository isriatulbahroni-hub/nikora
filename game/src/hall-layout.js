// Tata letak Aula Resepsi: dipakai bersama oleh klien (render) dan server (validasi).
import { clampArenaPosition } from './game-rules.js';

export const HALL = Object.freeze({
  tableRadius: 1.05,
  seatRadius: 1.75,
  seatsPerTable: 6,
  playerRadius: 0.35,
  seatedDrop: -0.3, // avatar duduk sedikit lebih rendah
  sitRange: 1.7, // jarak maksimum pemain ke kursi agar boleh duduk
  stage: Object.freeze({ halfWidth: 4.2, frontZ: -7.6 }), // pelaminan, di sisi z negatif
});

export const TABLES = Object.freeze(
  [
    [-6, -3.2], [6, -3.2],
    [-6, 2.2], [6, 2.2],
    [-6, 7.6], [6, 7.6],
  ].map(([x, z], id) => Object.freeze({ id, x, z })),
);

/** Arah hadap (rotasi Y) untuk melihat ke vektor (dx, dz); rot 0 = menghadap -z. */
export function facingAngle(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export const SEATS = Object.freeze(
  TABLES.flatMap((table) =>
    Array.from({ length: HALL.seatsPerTable }, (_, i) => {
      const angle = (i / HALL.seatsPerTable) * Math.PI * 2;
      const x = table.x + Math.cos(angle) * HALL.seatRadius;
      const z = table.z + Math.sin(angle) * HALL.seatRadius;
      return Object.freeze({
        id: table.id * HALL.seatsPerTable + i,
        table: table.id,
        x,
        z,
        rot: facingAngle(table.x - x, table.z - z),
      });
    }),
  ),
);

/** Dorong posisi keluar dari meja dan pelaminan, lalu batasi di dalam aula. */
export function resolveCollisions(position, radius = HALL.playerRadius) {
  let { x, z } = position;
  const minDistance = HALL.tableRadius + radius;
  for (const table of TABLES) {
    const dx = x - table.x;
    const dz = z - table.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= minDistance) continue;
    if (distance === 0) {
      x = table.x + minDistance;
    } else {
      x = table.x + (dx / distance) * minDistance;
      z = table.z + (dz / distance) * minDistance;
    }
  }

  const penetrationX = HALL.stage.halfWidth + radius - Math.abs(x);
  const penetrationZ = HALL.stage.frontZ + radius - z;
  if (penetrationX > 0 && penetrationZ > 0) {
    if (penetrationX < penetrationZ) x += x >= 0 ? penetrationX : -penetrationX;
    else z = HALL.stage.frontZ + radius;
  }
  return clampArenaPosition({ x, z });
}

/** Kursi kosong terdekat dalam jangkauan, atau null. `occupied` = Set id kursi. */
export function findNearestSeat(position, occupied = new Set(), range = HALL.sitRange) {
  let best = null;
  let bestDistance = range;
  for (const seat of SEATS) {
    if (occupied.has(seat.id)) continue;
    const distance = Math.hypot(seat.x - position.x, seat.z - position.z);
    if (distance <= bestDistance) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}
