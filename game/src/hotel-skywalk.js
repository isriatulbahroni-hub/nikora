// Sky Walk: dek kaca yang menjorok ke barat dari teras Infinity Pool di Sky Level (lantai 1000, level 999), DI LUAR tapak menara.
// Tanpa atap: langit terbuka di atasnya dan ~4,2 km udara di bawah lantai kaca. Murni data + matematika (tanpa THREE).
// Tapak lantai puncak diberikan oleh pemanggil (hotel-layout.js), supaya modul ini tidak mengimpor hotel-layout.js (menghindari impor melingkar).
// Fisika (move/canStand/roomAt) ada di hotel-layout.js; gambar 3D di hotel-skywalk-world.js.
export const SKY_WALK_LEVEL = 999; // sama dengan HOTEL_TOP_LEVEL (dijaga tes)
export const SKY_WALK_REACH = 30; // menjorok keluar dari tepi barat tapak puncak (m)
export const SKY_WALK_WIDTH = 16; // lebar dek (m)
export const SKY_WALK_OVERLAP = 2; // area injak masuk 2 m ke dalam tapak supaya jalan dari teras ke dek tidak putus oleh jari-jari pemain

/**
 * Dek di sisi barat tapak puncak `fp` = [minX, minZ, maxX, maxZ], berpusat di z = zCenter.
 * rect = area injak (termasuk tumpang tindih ke teras); outer = bagian dek di luar tapak (yang digambar); z = [z0, z1] lebar dek.
 */
export function skyWalkSpec(fp, zCenter) {
  const z0 = zCenter - SKY_WALK_WIDTH / 2;
  const z1 = zCenter + SKY_WALK_WIDTH / 2;
  const x0 = fp[0] - SKY_WALK_REACH;
  return Object.freeze({
    level: SKY_WALK_LEVEL,
    rect: Object.freeze([x0, z0, fp[0] + SKY_WALK_OVERLAP, z1]),
    outer: Object.freeze([x0, z0, fp[0], z1]),
    z: Object.freeze([z0, z1]),
    center: Object.freeze({ x: (x0 + fp[0]) / 2, z: zCenter }),
  });
}

/** Apakah lingkaran berjari-jari r di (x, z) berada di dalam area injak dek pada `level`? */
export function inSkyWalk(spec, level, x, z, r = 0) {
  return level === spec.level && x >= spec.rect[0] + r && x <= spec.rect[2] - r && z >= spec.rect[1] + r && z <= spec.rect[3] - r;
}
