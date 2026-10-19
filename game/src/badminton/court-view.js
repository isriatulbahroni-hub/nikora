// Perhitungan murni untuk tampilan bulu tangkis layar penuh (tanpa DOM, jadi bisa dites): proyeksi kamera di belakang
// pemain, garis lapangan resmi, dan gerak pemain. Koordinat = badminton.js: x melintang lapangan, y ke atas,
// z memanjang, net di z = 0, sisi pemain z < 0 (di layar: bawah), sisi bot z > 0 (di layar: atas).
import { COURT } from '../activities/badminton.js';

export const SERVICE_LINES = Object.freeze({ short: 1.98, back: 0.76 }); // jarak dari net / dari garis belakang (m)
export const PLAYER_BOUNDS = Object.freeze({ minX: -3.0, maxX: 3.0, minZ: -6.5, maxZ: -0.4 });
export const PLAYER_START = Object.freeze({ x: 0, z: -2.8 });
export const PLAYER_SPEED = 5.0; // m/s
// Kamera: di belakang garis belakang sisi pemain, tinggi, menatap ke lapangan.
export const CAMERA = Object.freeze({ position: Object.freeze({ x: 0, y: 9, z: -12 }), target: Object.freeze({ x: 0, y: 0, z: 0.8 }) });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Gerakkan pemain `dt` detik menurut input (x kanan, z maju ke net; panjang vektor dibatasi 1) dan jaga di sisinya. */
export function stepPlayer(pos, input, dt, bounds = PLAYER_BOUNDS, speed = PLAYER_SPEED) {
  const ix = Number.isFinite(input?.x) ? input.x : 0;
  const iz = Number.isFinite(input?.z) ? input.z : 0;
  const len = Math.hypot(ix, iz);
  const k = len > 1 ? 1 / len : 1;
  return {
    x: clamp(pos.x + ix * k * speed * dt, bounds.minX, bounds.maxX),
    z: clamp(pos.z + iz * k * speed * dt, bounds.minZ, bounds.maxZ),
  };
}

/** Bidikan menyamping -1..1 dari input (kiri/kanan di layar). */
export const aimFromInput = (input) => clamp(Number.isFinite(input?.x) ? input.x : 0, -1, 1);

/** Garis lapangan resmi BWF sebagai segmen [x1, z1, x2, z2] (13 garis, termasuk garis net). */
export function courtLineSegments(c = COURT) {
  const hl = c.length / 2;
  const hw = c.width / 2;
  const sw = c.singlesWidth / 2;
  const { short, back } = SERVICE_LINES;
  const backSvc = hl - back;
  return [
    [-hw, -hl, hw, -hl], [-hw, hl, hw, hl], // garis belakang
    [-hw, -hl, -hw, hl], [hw, -hl, hw, hl], // samping ganda
    [-sw, -hl, -sw, hl], [sw, -hl, sw, hl], // samping tunggal
    [-hw, -short, hw, -short], [-hw, short, hw, short], // servis pendek
    [-hw, -backSvc, hw, -backSvc], [-hw, backSvc, hw, backSvc], // servis belakang (ganda)
    [0, -hl, 0, -short], [0, short, 0, hl], // garis tengah
    [-hw, 0, hw, 0], // garis net
  ];
}

/**
 * Proyeksi perspektif dari CAMERA, diskalakan agar seluruh lapangan muat di kanvas `width` x `height`
 * (lebar 92%, tinggi 62% supaya ada ruang untuk kontrol di bawah). `project(x, y, z)` mengembalikan
 * { x, y } piksel kanvas dan `s` = piksel per meter di kedalaman titik itu (untuk ukuran pemain, kok, garis).
 */
export function createProjector(width, height, cam = CAMERA) {
  const dx = cam.target.x - cam.position.x;
  const dy = cam.target.y - cam.position.y;
  const dz = cam.target.z - cam.position.z;
  const flen = Math.hypot(dx, dy, dz);
  const f = { x: dx / flen, y: dy / flen, z: dz / flen };
  const un = Math.hypot(f.y, f.z) || 1;
  const up = { y: f.z / un, z: -f.y / un }; // tegak lurus arah pandang pada bidang y-z (kamera tidak miring ke samping)
  const unit = (x, y, z) => {
    const rx = x - cam.position.x;
    const ry = y - cam.position.y;
    const rz = z - cam.position.z;
    const depth = Math.max(rx * f.x + ry * f.y + rz * f.z, 0.1);
    return { px: rx / depth, py: (ry * up.y + rz * up.z) / depth, depth };
  };
  const hw = COURT.width / 2;
  const hl = COURT.length / 2;
  const fit = [[-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl], [0, COURT.netHeight, 0]].map((p) => unit(...p));
  const minPx = Math.min(...fit.map((p) => p.px));
  const maxPx = Math.max(...fit.map((p) => p.px));
  const minPy = Math.min(...fit.map((p) => p.py));
  const maxPy = Math.max(...fit.map((p) => p.py));
  const scale = Math.min((0.92 * width) / (maxPx - minPx), (0.62 * height) / (maxPy - minPy));
  const cx = width / 2 - (scale * (minPx + maxPx)) / 2;
  const cy = 0.42 * height + (scale * (minPy + maxPy)) / 2;
  return {
    scale,
    project(x, y, z) {
      const u = unit(x, y, z);
      return { x: cx + scale * u.px, y: cy - scale * u.py, s: scale / u.depth };
    },
  };
}
