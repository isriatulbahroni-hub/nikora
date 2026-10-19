// Data murni untuk dunia 3D NIKORA Grand Hotel: warna lantai, tinggi perabot, daftar tempat "Jelajah",
// dan keterangan lokasi pemain. Tanpa THREE supaya bisa diuji di Node.
import { HOTEL_BUILDING, HOTEL_LEVEL_COUNT, HOTEL_PARKING, HOTEL_SPAWN, isGuestLevel } from './hotel-layout.js';

/** Tinggi perabot (m): dipakai penggambar dan penghalang kamera. */
export const PROP_HEIGHT = Object.freeze({ bed: 1.2, table: 0.85, desk: 1.1, counter: 0.95, tub: 0.8, sofa: 0.95, lounger: 0.6 });

/** Warna lantai per jenis ruang (hex). */
export const FLOOR_COLORS = Object.freeze({
  core: 0xe9e4da, lobby: 0xd9cbb0, restaurant: 0xbf9f7c, kitchen: 0xc3c8ca, hall: 0xe7d9bf, bridal: 0xecd2da,
  meeting: 0xc8ccd4, spa: 0xa6cdc8, pool: 0xbfe3ea, gym: 0x9aa8b4, shop: 0xdcc9a8, prayer: 0x8fbf9f,
  kids: 0xf0cf8a, cinema: 0x4a3f5c, games: 0x7a8fd0, library: 0xa98660, lounge: 0xe0cfae, suite: 0xa9805a,
  terrace: 0xbcd4b2, guest: 0xd4bc96,
});
export const CORRIDOR_COLOR = 0x9a8872;

export const cssColor = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export const GROUPS = Object.freeze({
  yard: 'Halaman & parkir',
  dining: 'Lobi & restoran',
  events: 'Pesta & pertemuan',
  wellness: 'Spa & kebugaran',
  lifestyle: 'Gaya hidup & keluarga',
  guest: 'Kamar tamu',
  sky: 'Suite & Sky Level',
});
export const GROUP_ORDER = Object.freeze([GROUPS.yard, GROUPS.dining, GROUPS.events, GROUPS.wellness, GROUPS.lifestyle, GROUPS.guest, GROUPS.sky]);

const GROUP_BY_KIND = Object.freeze({
  lobby: GROUPS.dining, restaurant: GROUPS.dining,
  hall: GROUPS.events, bridal: GROUPS.events, meeting: GROUPS.events,
  spa: GROUPS.wellness, pool: GROUPS.wellness, gym: GROUPS.wellness,
  shop: GROUPS.lifestyle, prayer: GROUPS.lifestyle, kids: GROUPS.lifestyle, cinema: GROUPS.lifestyle, games: GROUPS.lifestyle, library: GROUPS.lifestyle,
  lounge: GROUPS.sky, suite: GROUPS.sky, terrace: GROUPS.sky,
});

/** Titik terdekat yang bisa diinjak dari (x, z); bila roomId diberikan, titik itu harus tetap di ruang tersebut. */
export function findStandable(world, level, x, z, roomId = null) {
  const ok = (px, pz) => world.canStand(level, px, pz) && (!roomId || world.roomAt(px, pz, level).id === roomId);
  if (ok(x, z)) return { x, z };
  for (let r = 0.5; r <= 10; r += 0.5) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Daftar tempat untuk menu Jelajah: halaman, semua ruang publik, dan satu kamar contoh di tiap lantai tamu. */
export function hotelPlaces(world) {
  const out = [];
  const add = (id, name, group, level, x, z, roomId = null) => {
    const p = findStandable(world, level, x, z, roomId);
    if (p) out.push({ id, name, group, level, floor: level + 1, x: p.x, z: p.z });
  };
  add('drop_off', 'Drop-off & Valet', GROUPS.yard, 0, HOTEL_SPAWN.x, HOTEL_SPAWN.z);
  add('parkir_tamu', 'Parkir Tamu', GROUPS.yard, 0, (HOTEL_PARKING[0] + HOTEL_PARKING[2]) / 2, (HOTEL_PARKING[1] + HOTEL_PARKING[3]) / 2);
  for (let level = 0; level < HOTEL_LEVEL_COUNT; level++) {
    const rooms = world.levels[level].rooms;
    if (isGuestLevel(level)) {
      const cell = rooms.find((r) => r.kind === 'guest');
      if (cell) add(cell.id, cell.name, GROUPS.guest, level, (cell.rect[0] + cell.rect[2]) / 2, (cell.rect[1] + cell.rect[3]) / 2, cell.id);
      continue;
    }
    for (const r of rooms) {
      const group = GROUP_BY_KIND[r.kind];
      if (!group) continue; // inti (lift) dan dapur tidak jadi tujuan
      add(r.id, r.name, group, level, (r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2, r.id);
    }
  }
  return out;
}

const insideBuilding = (x, z) => x > HOTEL_BUILDING[0] && x < HOTEL_BUILDING[2] && z > HOTEL_BUILDING[1] && z < HOTEL_BUILDING[3];

/**
 * Keterangan lokasi pemain: nama ruang, apakah di dalam bangunan (untuk potongan tampak lantai), dan apakah beratap.
 * Area di antara kamar pada lantai tamu dinamai "Lorong".
 */
export function describePlace(world, x, z, level) {
  const room = world.roomAt(x, z, level);
  const inBuilding = insideBuilding(x, z);
  if (room.id === 'grounds' && inBuilding) return { id: 'corridor', name: level === 0 ? 'Lobi' : 'Lorong', kind: 'corridor', indoor: true, inside: true, level };
  return { ...room, inside: inBuilding || level > 0 };
}
