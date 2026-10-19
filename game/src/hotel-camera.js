// Penghalang kamera orang ketiga di hotel: tanah, lantai, dinding, ambang pintu, dan perabot besar pada SATU lantai.
// Lantai di atas pemain disembunyikan (potongan tampak), jadi tidak ada langit-langit yang perlu dihitung.
import { DOOR_HEIGHT, PROP_SPECS, WALL_THICKNESS, wallToRect } from './villa-layout.js';
import { HOTEL_BUILDING, HOTEL_WALL_HEIGHT, hotelLevelY } from './hotel-layout.js';
import { PROP_HEIGHT } from './hotel-places.js';

/** Tinggi bawah ambang di atas pintu: pintu "tall" (lobi, antar-petak publik) lebih tinggi. */
export const doorTop = (door) => (door.tall ? 3.0 : DOOR_HEIGHT);

export function buildHotelOccluders(world, level) {
  const data = world.levels[level];
  const y0 = hotelLevelY(level);
  const boxes = [];
  const add = (minX, maxX, minY, maxY, minZ, maxZ) => boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  add(-700, 700, -6, 0.05, -700, 700); // tanah
  if (level > 0) add(HOTEL_BUILDING[0], HOTEL_BUILDING[2], y0 - 0.4, y0, HOTEL_BUILDING[1], HOTEL_BUILDING[3]); // pelat lantai
  for (const w of data.walls) {
    const r = wallToRect(w);
    add(r.minX, r.maxX, y0, y0 + HOTEL_WALL_HEIGHT, r.minZ, r.maxZ);
  }
  const t = WALL_THICKNESS / 2;
  for (const d of data.doors) {
    const hw = d.width / 2;
    const lo = y0 + doorTop(d);
    const hi = y0 + HOTEL_WALL_HEIGHT;
    if (d.orient === 'h') add(d.x - hw, d.x + hw, lo, hi, d.z - t, d.z + t);
    else add(d.x - t, d.x + t, lo, hi, d.z - hw, d.z + hw);
  }
  for (const p of data.props) {
    const h = PROP_HEIGHT[p.type];
    const s = PROP_SPECS[p.type];
    if (!h || !s) continue;
    add(p.x - s.hx, p.x + s.hx, y0, y0 + h, p.z - s.hz, p.z + s.hz);
  }
  return boxes;
}
