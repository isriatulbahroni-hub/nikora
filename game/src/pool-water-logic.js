// Logika murni kolam renang NIKORA (tanpa THREE, sehingga bisa diuji dengan `node --test`).
// Satuan meter. x ke timur, z ke selatan, y ke atas. Satu kolam = persegi panjang sejajar sumbu
// dengan pusat (x, z), lebar (sumbu x), kedalaman denah (sumbu z), dan permukaan air di ketinggian y.

export const POOL_CAPTURE_RANGE = 48; // m: pantulan hidup hanya dirender untuk kolam sedekat ini
export const SURFACE_EPSILON = 0.03; // m: kamera dianggap di atas air bila lebih tinggi dari permukaan + nilai ini
export const UNDERWATER_FADE = 0.12; // m: lebar peralihan permukaan -> bawah air

// Desain kolam. Tiap kolam di hotel memilih satu desain supaya tidak ada dua kolam yang tampak sama.
// shallow/deep = warna air (dangkal/dalam), tile = warna dasar dan dinding kolam, opacity = kepekatan air
// (0..1), ripple = kekuatan riak permukaan.
export const POOL_DESIGNS = Object.freeze({
  azure: Object.freeze({ name: 'Azure', shallow: 0x35d0d8, deep: 0x0a5f86, tile: 0xe9f1f2, opacity: 0.62, ripple: 2.6 }),
  lagoon: Object.freeze({ name: 'Lagoon', shallow: 0x4fe0b0, deep: 0x0b7a6c, tile: 0xdfeee5, opacity: 0.58, ripple: 2.2 }),
  midnight: Object.freeze({ name: 'Midnight', shallow: 0x2c5fa8, deep: 0x07163a, tile: 0x1d2a44, opacity: 0.8, ripple: 2.0 }),
  emerald: Object.freeze({ name: 'Emerald', shallow: 0x3cc47a, deep: 0x0b5a3a, tile: 0xcfe3d2, opacity: 0.7, ripple: 2.4 }),
  pearl: Object.freeze({ name: 'Pearl', shallow: 0x9fe3ee, deep: 0x2f8fb0, tile: 0xf6efe4, opacity: 0.5, ripple: 3.0 }),
});
export const DEFAULT_DESIGN = 'azure';
export const designOf = (name) => POOL_DESIGNS[name] ?? POOL_DESIGNS[DEFAULT_DESIGN];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Jarak mendatar dari titik (x, z) ke persegi panjang kolam; 0 bila di dalam atau di tepi. */
export function footprintDistance(pool, x, z) {
  const dx = Math.max(Math.abs(x - pool.x) - pool.width / 2, 0);
  const dz = Math.max(Math.abs(z - pool.z) - pool.depth / 2, 0);
  return Math.hypot(dx, dz);
}

export const isOverPool = (pool, x, z) => footprintDistance(pool, x, z) === 0;

/** 0 = kamera di atas air, 1 = kamera sudah sepenuhnya di bawah permukaan kolam; di luar denah kolam selalu 0. */
export function underwaterMix(pool, camera, fade = UNDERWATER_FADE) {
  if (!isOverPool(pool, camera.x, camera.z)) return 0;
  return clamp01((pool.y - camera.y) / fade);
}

/**
 * Kolam yang boleh memakai pantulan hidup (satu tangkapan scene tambahan per frame, jadi hanya satu kolam):
 * yang terdekat dari kamera, dalam jangkauan, dan hanya bila kamera berada di atas permukaannya.
 * Seri jarak: kolam yang lebih dulu di daftar menang. Mengembalikan null bila tidak ada.
 */
export function selectCapturePool(pools, camera, { range = POOL_CAPTURE_RANGE } = {}) {
  let best = null;
  let bestDistance = Infinity;
  for (const pool of pools) {
    const above = camera.y - pool.y;
    if (above <= SURFACE_EPSILON) continue;
    const distance = Math.hypot(footprintDistance(pool, camera.x, camera.z), above);
    if (distance <= range && distance < bestDistance) {
      best = pool;
      bestDistance = distance;
    }
  }
  return best;
}
