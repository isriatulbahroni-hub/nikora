// Pemetaan model mobil nikora ke model GLB dari katalog carros (github.com/pedrosoandre/carros). Murni data + matematika (tanpa THREE).
// Fisika, kursi, dan suara tetap dari car-models.js; hanya tampilan luar yang diganti bila berkas GLB tersedia (glb-car-view.js).
// Berkas GLB tidak ikut repo: salin dengan `node scripts/copy-car-models.mjs <folder carros>` ke game/public/cars/.
// `flip` membalik arah depan bila mobil terlihat menghadap ke belakang (tiap pembuat model memakai arah berbeda).

export const GLB_BASE = '/cars';

export const GLB_CARS = Object.freeze({
  royale: Object.freeze({ file: 'rolls-royce-phantom.glb', flip: false }),
  noir: Object.freeze({ file: 'mclaren-spider.glb', flip: false }),
  argent: Object.freeze({ file: 'ferrari-laferrari.glb', flip: false }),
  rubis: Object.freeze({ file: 'rolls-royce-cullinan.glb', flip: false }),
});

/** Berkas katalog yang berlisensi CC BY-SA (turunannya wajib CC BY-SA juga): tidak dipakai di nikora. */
export const SHARE_ALIKE_FILES = Object.freeze(['porsche-911-carrera.glb', 'porsche-959.glb', 'porsche-mission.glb']);

export const glbEntry = (modelId) => GLB_CARS[modelId] ?? null;

/** URL berkas GLB untuk satu model nikora (null bila model tidak dipetakan). */
export function glbUrl(modelId, base = GLB_BASE) {
  const e = glbEntry(modelId);
  return e ? `${String(base).replace(/\/+$/, '')}/${e.file}` : null;
}

/** Id katalog carros (nama berkas tanpa .glb), dipakai mencari kredit di credits.json. */
export const glbCreditId = (modelId) => glbEntry(modelId)?.file.replace(/\.glb$/, '') ?? null;

/**
 * Skala, putaran, dan posisi supaya model GLB pas dengan kerangka mobil nikora (depan = +z, panjang = spec.length, alas di y = 0,
 * pusat di x = z = 0). min/max = kotak pembatas model asli. Sumbu terpanjang dianggap sumbu depan-belakang;
 * bila sumbu itu x, +x dijadikan depan. Mengembalikan null bila kotak kosong atau panjang tidak valid.
 */
export function fitToSpec(min, max, length, { flip = false } = {}) {
  const sx = max.x - min.x;
  const sz = max.z - min.z;
  const longest = Math.max(sx, sz);
  if (!(longest > 0) || !(length > 0) || !Number.isFinite(max.y - min.y)) return null;
  const alongX = sx > sz;
  const rotY = (alongX ? -Math.PI / 2 : 0) + (flip ? Math.PI : 0);
  const scale = length / longest;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  // rotasi sumbu y ala THREE: x' = x cos + z sin, z' = -x sin + z cos
  return { scale, rotY, position: { x: -scale * (cx * cos + cz * sin), y: -min.y * scale, z: -scale * (-cx * sin + cz * cos) } };
}
