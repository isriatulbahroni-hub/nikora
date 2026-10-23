// Penghalang tabrakan untuk sekitar menara (gedung kota, menara satelit, arena), supaya pemain dan mobil tidak menembusnya.
// Kotak sejajar sumbu {minX, maxX, minZ, maxZ} seperti collider hotel lain. Silinder (satelit, arena) diwakili persegi di dalamnya
// (sisi = jari-jari x 1,4, sudutnya tepat di dalam lingkaran), jadi sedikit lebih sempit dari bentuknya (jalan masuk tidak terhalang) tetapi tidak bisa ditembus dari tengah.
import { ARENA, SATELLITES, cityBuildings } from './hotel-surroundings-data.js';

const INSCRIBED = 0.7;
const box = (x, z, hw, hd) => Object.freeze({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });

let cache = null;
export function surroundColliders() {
  if (cache) return cache;
  const out = cityBuildings().map((b) => box(b.x, b.z, b.w / 2, b.d / 2));
  for (const s of SATELLITES) out.push(box(s.x, s.z, s.radius * INSCRIBED, s.radius * INSCRIBED));
  out.push(box(ARENA.x, ARENA.z, ARENA.radius * INSCRIBED, ARENA.radius * INSCRIBED));
  cache = Object.freeze(out);
  return cache;
}
