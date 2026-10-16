// Bingkai lapangan bulu tangkis di dunia 3D. `badminton.js` bekerja di koordinat lokal lapangan
// (net di z = 0, sisi 'a' z < 0, sisi 'b' z > 0); dunia villa memakai x timur, z selatan.
// Lapangan diputar 90 derajat: panjang lapangan sejajar sumbu x dunia, sisi 'a' di barat, 'b' di timur.
// Rumus ini sama dengan `group.rotation.y = Math.PI / 2` pada mesh di `villa-court.js`.
import { COURT } from './badminton.js';

/** Letak lapangan di halaman barat daya villa (ruang kosong di antara dapur dan pagar selatan). */
export const VILLA_COURT = Object.freeze({ x: -27, z: 36 });
export const COURT_MARGIN = 1.2; // ruang bebas di sekeliling garis (pemain butuh ruang untuk mengejar kok)

export function createCourtFrame({ x, z } = VILLA_COURT) {
  const halfLength = COURT.length / 2;
  const halfWidth = COURT.width / 2;
  const toWorld = (p) => ({ x: x + p.z, y: p.y ?? 0, z: z - p.x });
  const toLocal = (p) => ({ x: z - p.z, y: p.y ?? 0, z: p.x - x });
  const padRect = (margin = 0) => ({
    minX: x - halfLength - margin, maxX: x + halfLength + margin,
    minZ: z - halfWidth - margin, maxZ: z + halfWidth + margin,
  });
  return {
    center: Object.freeze({ x, z }),
    rotationY: Math.PI / 2,
    toWorld,
    toLocal,
    padRect,
    /** Titik dunia berada di dalam lapangan (plus margin)? */
    contains: (p, margin = 0) => {
      const r = padRect(margin);
      return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
    },
    /** Sisi lapangan tempat pemain berdiri ('a' barat, 'b' timur), atau null bila di luar lapangan + margin. */
    sideAt(p, margin = COURT_MARGIN) {
      const r = padRect(margin);
      if (p.x < r.minX || p.x > r.maxX || p.z < r.minZ || p.z > r.maxZ) return null;
      return p.x < x ? 'a' : 'b';
    },
    /** Penghalang net (kotak tipis) agar pemain tidak bisa berjalan menembus net. */
    netCollider: (thickness = 0.12) => ({ minX: x - thickness / 2, maxX: x + thickness / 2, minZ: z - halfWidth - 0.15, maxZ: z + halfWidth + 0.15 }),
  };
}
