// Gerak karakter, kontrol sentuh, dan bantuan kamera di vila. Murni matematika (tanpa THREE) supaya mudah diuji.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const wrapAngle = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Putar sudut `cur` menuju `target` lewat jalur terpendek: meredam halus, dengan batas laju putar (rad/s). */
export function turnToward(cur, target, delta, { rate = 14, maxSpeed = 11 } = {}) {
  const diff = wrapAngle(target - cur);
  const step = diff * (1 - Math.exp(-rate * Math.max(0, delta)));
  const cap = maxSpeed * Math.max(0, delta);
  return wrapAngle(cur + clamp(step, -cap, cap));
}

// ---------------------------------------------------------------- siklus jalan
export const GAIT = Object.freeze({ cycleHz: 2.1, maxSpeed: 5.2, hip: 0.5, arm: 0.55 });

/**
 * Majukan siklus jalan. `speed` = laju nyata (m/s), bukan sekadar "joystick ditekan": menabrak dinding berarti laju ~0
 * sehingga kaki berhenti. Amplitudo mengecil halus saat berhenti (tidak membeku di tengah langkah).
 */
export function stepGait(g, speed, delta) {
  const target = clamp(speed / GAIT.maxSpeed, 0, 1);
  const amp = g.amp + (target - g.amp) * (1 - Math.exp(-9 * Math.max(0, delta)));
  const live = amp > 0.02;
  const phase = live ? (g.phase + Math.max(0, delta) * TAU * GAIT.cycleHz * (0.55 + 0.45 * amp)) % TAU : 0;
  return { phase, amp: live ? amp : 0 };
}

/** Sudut sendi dari siklus jalan. Rotasi x positif = ayun ke depan (-z). */
export function gaitPose(phase, amp) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const hip = GAIT.hip * amp;
  const flex = (v) => -(0.08 * amp + 0.95 * amp * Math.max(0, v)); // lutut menekuk saat kaki mengayun ke depan
  return {
    hipR: s * hip,
    hipL: -s * hip,
    kneeR: flex(c),
    kneeL: flex(-c),
    armR: -s * GAIT.arm * amp,
    armL: s * GAIT.arm * amp,
    dip: -0.05 * amp * (1 - Math.abs(c)), // badan sedikit turun saat kedua kaki terbuka lebar
    lean: -0.09 * amp, // condong ke depan
  };
}

// ---------------------------------------------------------------- pintu
/**
 * Bantuan pintu. Bila pemain melaju ke arah bukaan pintu (lintasan proyeksinya mengenai pintu atau sedikit meleset),
 * vektor gerak digeser ke garis tengah pintu. Di ambang pintu pemain dipandu lurus keluar. Hasil tidak pernah lebih
 * panjang dari 1 (kecepatan tetap sah di server). Mengembalikan objek baru; `move` tidak diubah.
 */
export function doorAssist(pos, move, doors, { radius = 0.4, reach = 2.6, slop = 0.55, gain = 1.2 } = {}) {
  const len = Math.hypot(move.x, move.z);
  if (len < 0.2) return move;
  const hx = move.x / len;
  const hz = move.z / len;
  let best = null;
  for (const d of doors) {
    const along = d.orient === 'h' ? 'z' : 'x'; // sumbu yang ditembus pintu
    const across = d.orient === 'h' ? 'x' : 'z'; // sumbu lebar pintu
    const dir = along === 'z' ? hz : hx;
    const dist = d[along] - pos[along];
    const offset = d[across] - pos[across];
    const half = d.width / 2;
    const inDoorway = Math.abs(dist) <= 0.35 && Math.abs(offset) <= half;
    let err;
    let weight;
    if (inDoorway) {
      if (Math.abs(dir) < 0.3) continue;
      err = offset;
      weight = 1;
    } else {
      if (Math.abs(dist) > reach || Math.abs(dir) < 0.5 || Math.sign(dist) !== Math.sign(dir)) continue;
      const t = dist / dir; // jarak menuju bidang pintu sepanjang arah gerak
      const head = across === 'x' ? hx : hz;
      const projected = pos[across] + head * t;
      err = d[across] - projected;
      if (Math.abs(err) > half + slop) continue; // tidak mengarah ke pintu ini
      weight = clamp(1.2 - Math.abs(dist) / reach, 0.25, 1);
    }
    const score = Math.abs(dist) + Math.abs(err);
    if (!best || score < best.score) best = { score, across, err, weight, half };
  }
  if (!best) return move;
  // jangan "menarik" bila sudah cukup di tengah (ada ruang bebas di kiri-kanan badan)
  const free = Math.max(0, best.half - radius);
  const need = Math.abs(best.err) - free * 0.5;
  if (need <= 0) return move;
  const push = clamp(Math.sign(best.err) * need * gain, -1, 1) * best.weight * len;
  const out = { x: move.x, z: move.z };
  out[best.across] += push;
  const outLen = Math.hypot(out.x, out.z);
  const cap = Math.max(1, len);
  if (outLen > cap) {
    out.x = (out.x / outLen) * cap;
    out.z = (out.z / outLen) * cap;
  }
  return out;
}

// ---------------------------------------------------------------- joystick
/** Zona mati kecil + kurva halus: dorongan kecil = jalan pelan, penuh = lari. dx/dy dalam piksel dari pusat. */
export function joystickVector(dx, dy, radius, { dead = 0.1, expo = 1.35 } = {}) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, z: 0, mag: 0 };
  const raw = Math.min(1, len / radius);
  if (raw < dead) return { x: 0, z: 0, mag: 0 };
  const mag = ((raw - dead) / (1 - dead)) ** expo;
  return { x: (dx / len) * mag, z: (dy / len) * mag, mag };
}

/** Letakkan pusat joystick di titik sentuh, tetapi tetap di dalam zona (tidak terpotong tepi layar). */
export function joystickAnchor(touch, zone, radius, pad = 14) {
  return {
    x: clamp(touch.x, zone.left + radius + pad, zone.right - radius - pad),
    y: clamp(touch.y, zone.top + radius + pad, zone.bottom - radius - pad),
  };
}

// ---------------------------------------------------------------- label nama
/**
 * Ukuran label nama agar ukurannya di layar kira-kira tetap (tidak membesar saat kamera dekat) dan memudar
 * bila terlalu dekat (menutupi layar) atau jauh (ramai).
 */
export function labelMetrics(distance, fovDeg, { heightFrac = 0.028, min = 0.1, max = 0.26, near = 2.2, fadeStart = 10, far = 18 } = {}) {
  const worldHeight = 2 * Math.max(distance, 0.01) * Math.tan((fovDeg * Math.PI) / 360) * heightFrac;
  let opacity = 1;
  if (distance < near) opacity = clamp((distance - near * 0.6) / (near * 0.4), 0, 1);
  else if (distance > fadeStart) opacity = clamp(1 - (distance - fadeStart) / (far - fadeStart), 0, 1);
  return { height: clamp(worldHeight, min, max), opacity };
}

// ---------------------------------------------------------------- kamera
/** Penghalang kamera tambahan yang belum ada di buildCameraOccluders: batang pohon/palem, air mancur, pagar. */
export function extraCameraOccluders(world, { palmHeight = 5, treeHeight = 4.5, fenceHeight = 1.9, fountainHeight = 1.6 } = {}) {
  const boxes = [];
  const add = (minX, maxX, minY, maxY, minZ, maxZ) => boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  for (const p of world.allProps ?? []) {
    if (p.type === 'palm') add(p.x - 0.28, p.x + 0.28, 0, palmHeight, p.z - 0.28, p.z + 0.28);
    else if (p.type === 'tree') add(p.x - 0.35, p.x + 0.35, 0, treeHeight * (p.s ?? 1), p.z - 0.35, p.z + 0.35);
  }
  add(-2.4, 2.4, 0, fountainHeight, 25.6, 30.4); // air mancur
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const g = 3.2;
  const t = 0.2;
  add(minX - t, maxX + t, 0, fenceHeight, minZ - t, minZ + t);
  add(minX - t, minX + t, 0, fenceHeight, minZ, maxZ);
  add(maxX - t, maxX + t, 0, fenceHeight, minZ, maxZ);
  add(minX - t, -g, 0, fenceHeight, maxZ - t, maxZ + t);
  add(g, maxX + t, 0, fenceHeight, maxZ - t, maxZ + t);
  return boxes;
}

/** Perbesar tiap kotak sebesar `pad` ke segala arah: kamera diperlakukan sebagai bola, bukan titik. */
export function inflateBoxes(boxes, pad) {
  return boxes.map((b) => ({ minX: b.minX - pad, maxX: b.maxX + pad, minY: b.minY - pad, maxY: b.maxY + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad }));
}

/**
 * Seberapa kuat kamera harus berputar ke belakang pemain (0..1) saat lengannya terjepit. Tidak aktif saat pemain
 * sedang menyeret kamera sendiri, saat tidak bergerak, atau di pandangan atas.
 */
export function blockedSwing({ arm, want, moving, dragging, pitch }) {
  if (!moving || dragging || pitch > 0.95 || want <= 0) return 0;
  return clamp((0.6 - arm / want) / 0.4, 0, 1);
}

/** Peralihan pandangan ke depan saat lengan kamera sangat pendek (0 = lihat avatar, 1 = pandangan orang pertama). */
export const forwardBlend = (arm) => clamp((1.25 - arm) / 0.6, 0, 1);
