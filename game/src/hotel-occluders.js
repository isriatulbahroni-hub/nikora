// Kotak penghalang kamera di luar gedung hotel (murni matematika, tanpa THREE, supaya bisa diuji).
// Tanpa ini kamera bisa menembus kanopi drop-off, tiang, air mancur, atau badan menara dan layar jadi krem polos atau kaca biru polos.
// building = [minX, minZ, maxX, maxZ]; canopy = { rect, height, pillars: [[x, z]] }; fountain = { x, z, r }.
export function exteriorOccluders({ level, building, podiumLevels, podiumTopY, topY, canopy, fountain }) {
  const boxes = [];
  const add = (minX, maxX, minY, maxY, minZ, maxZ) => boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  // Badan menara di atas podium: pemain di luar atau di podium tidak boleh mengorbitkan kamera ke dalam kaca dan lantai menara.
  if (level < podiumLevels) add(building[0], building[2], podiumTopY, topY, building[1], building[3]);
  if (level === 0) {
    const r = canopy.rect;
    add(r[0] - 0.2, r[2] + 0.2, canopy.height - 0.2, canopy.height + 0.3, r[1] - 0.2, r[3] + 0.2); // pelat kanopi dan list tepinya
    for (const [x, z] of canopy.pillars) add(x - 0.45, x + 0.45, 0, canopy.height, z - 0.45, z + 0.45);
    add(fountain.x - fountain.r - 0.2, fountain.x + fountain.r + 0.2, 0, 0.7, fountain.z - fountain.r - 0.2, fountain.z + fountain.r + 0.2); // kolam
    add(fountain.x - 0.4, fountain.x + 0.4, 0.4, 3.0, fountain.z - 0.4, fountain.z + 0.4); // tugu
  }
  return boxes;
}
