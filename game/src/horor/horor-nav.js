// Adaptor navigasi: mengubah collider Room (x0,z0,x1,z1) ke bentuk yang dipahami vendor/navmesh.js dan vendor/collision.js
// (minX,maxX,minZ,maxZ), lalu membangun NavGrid (A* di grid) untuk satu ruangan atau satu lantai mansion.
// Murni (tanpa THREE/DOM). Collider gerbang yang sedang terbuka (digeser ke 9999 oleh Room.setShutter) dilewati.
import { NavGrid } from './vendor/navmesh.js';

const FAR = 9000;

export const toBox = (c) => ({ minX: c.x0, maxX: c.x1, minZ: c.z0, maxZ: c.z1 });

/** Semua collider Room sebagai kotak vendor (tanpa gerbang terbuka). */
export function colliderBoxes(colliders) {
  const out = [];
  for (const c of colliders) if (c.x0 < FAR) out.push(toBox(c));
  return out;
}

/**
 * Dunia navigasi untuk `room` pada area `rect` = [minX, minZ, maxX, maxZ] (meter).
 * `boxes` adalah larik yang sama yang dipakai grid; refresh() mengisinya ulang dari room.colliders dan membangun ulang grid.
 * Panggil refresh() setelah collider berubah (gerbang dibuka/ditutup).
 */
export function createNavWorld(room, rect, { cell, radius } = {}) {
  const map = {
    rooms: [{ rect: { minX: rect[0], minZ: rect[1], maxX: rect[2], maxZ: rect[3] } }],
    colliders: [],
    floorY: () => 0, // lantai datar; navmesh memanggilnya tanpa `this`
  };
  const sync = () => {
    map.colliders.length = 0;
    map.colliders.push(...colliderBoxes(room.colliders));
  };
  sync();
  const grid = new NavGrid(map, { cell, radius });
  return {
    map,
    grid,
    boxes: map.colliders,
    refresh() {
      sync();
      grid.rebuildAll();
    },
  };
}
