// Sopan santun avatar: logika murni (tanpa THREE/DOM) supaya mudah diuji.
//  - tidur: telentang / miring kiri / miring kanan
//  - hormat: dua avatar yang berhadapan dekat saling menunduk sedikit dengan tangan kanan di dada
//  - tengok: kepala menoleh kiri-kanan (ke avatar terdekat di depan, atau melirik sesekali saat diam)
//  - tabrakan: tidak boleh menembus avatar lain; menabrak dengan laju tinggi = jatuh, lalu bangun lagi
// Konvensi sudut sama dengan game: rotation.y positif = menoleh/berputar ke KIRI avatar; depan = -z.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrapAngle = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

// ---------------------------------------------------------------- tidur
export const SLEEP_SIDES = Object.freeze(['up', 'left', 'right']);
export const SLEEP_LABELS = Object.freeze({ up: 'Telentang', left: 'Miring kiri', right: 'Miring kanan' });
/** Putaran badan di sekeliling sumbu panjangnya (rad). Kiri: perut menghadap ke kiri avatar. */
export const LIE_ROLL = Object.freeze({ up: 0, left: Math.PI / 2, right: -Math.PI / 2 });

/**
 * Pose berbaring dari pose tidur bawaan tempat tidur (`spotPose` vila: posisi, tinggi, rot = arah kepala).
 * Bawaan lama memakai tilt -90° sehingga avatar tengkurap; di sini tilt +90° dan menghadap berlawanan (rotY + 180°)
 * supaya kepala tetap di sisi papan kepala, wajah menghadap ke atas. Miring: badan diputar `LIE_ROLL` lewat userData.lie.
 */
export function lyingPose(base, side = 'up') {
  const s = SLEEP_SIDES.includes(side) ? side : 'up';
  return { x: base.x, z: base.z, y: base.y + (s === 'up' ? 0 : 0.05), rotY: wrapAngle(base.rotY + Math.PI), tilt: Math.PI / 2, side: s };
}

// ---------------------------------------------------------------- kode di dalam arah hadap
// Jaringan hanya membawa (x, z, y, rot, sit, act). Supaya pemain lain melihat posisi tidur dan jatuhmu tanpa mengubah
// protokol, keduanya dititipkan di `rot`: jatuh = rot + 40 putaran penuh (arah hadap tetap sama, sebab sudut berulang
// tiap 2π); posisi tidur = geser kecil dari rot tempat tidur. Pemain lama (tanpa kode ini) membaca arah yang sama.
const FALL_FLAG = TAU * 40;
const SIDE_SHIFT = 0.2;

export function packFacing(rot, { fall = false, side = null } = {}) {
  let r = rot;
  if (side === 'left') r += SIDE_SHIFT;
  else if (side === 'right') r -= SIDE_SHIFT;
  return fall ? r + FALL_FLAG : r;
}

/** { rot, fall }: buang bendera jatuh dari rot yang diterima. */
export function unpackFacing(rot) {
  return rot > FALL_FLAG / 2 ? { rot: rot - FALL_FLAG, fall: true } : { rot, fall: false };
}

/** Sisi tidur dari rot yang diterima, dibandingkan dengan rot tempat tidur (arah kepala). */
export function sleepSideFromRot(rot, spotRot) {
  const diff = wrapAngle(rot - spotRot);
  if (diff > SIDE_SHIFT / 2) return 'left';
  if (diff < -SIDE_SHIFT / 2) return 'right';
  return 'up';
}

// ---------------------------------------------------------------- jatuh
export const FALL_TOTAL = 2.6; // detik: jatuh, terbaring, bangun

/** Pose jatuh pada detik ke-`e`: w = 0..1 seberapa rebah; tilt (rad, + = jatuh ke belakang); lift = angkat badan agar tidak menembus lantai. */
export function fallPose(e) {
  const DOWN = 0.38;
  const UP0 = 1.85;
  let w = 0;
  if (e > 0 && e < DOWN) w = (e / DOWN) ** 2; // jatuh makin cepat
  else if (e >= DOWN && e < UP0) w = 1;
  else if (e >= UP0 && e < FALL_TOTAL) w = 1 - smoothstep(0, 1, (e - UP0) / (FALL_TOTAL - UP0));
  return { w, tilt: w * (Math.PI / 2), lift: 0.17 * w };
}

/**
 * Deteksi tabrakan: laju tinggi tiba-tiba terhenti padahal pemain masih mendorong. `want` = laju yang diminta (m/s),
 * `actual` = laju nyata setelah tabrakan dinding/avatar. Menyusur dinding (laju tinggal >30%) tidak dihitung.
 * Setelah jatuh ada jeda `cooldown` supaya tidak jatuh beruntun.
 */
export function createImpactDetector({ minSpeed = 3.4, cooldown = 3.6, keep = 7 } = {}) {
  let recent = 0;
  let wait = 0;
  return {
    update({ want, actual, delta }) {
      const dt = Math.max(0, delta);
      wait = Math.max(0, wait - dt);
      recent = Math.max(actual, recent * Math.exp(-keep * dt)); // ingatan laju terbaru ±0,15 dtk
      if (wait === 0 && want >= 2.5 && recent >= minSpeed && actual < recent * 0.3) {
        wait = cooldown;
        recent = 0;
        return true;
      }
      return false;
    },
    reset() {
      recent = 0;
      wait = 0;
    },
  };
}

// ---------------------------------------------------------------- tubuh padat (antar avatar)
export const BODY_DISTANCE = 0.72; // jarak minimum antar pusat dua avatar (m)

/**
 * Dorong `pos` keluar dari avatar lain yang terlalu dekat (di lantai yang sama). Mengembalikan { x, z, pushed }.
 * `others`: [{ x, z, y? }]. Hanya dipakai saat pemain sendiri bergerak, supaya tidak terlempar saat diam.
 */
export function separateFromOthers(pos, others, minDist = BODY_DISTANCE, maxDy = 1.2) {
  let x = pos.x;
  let z = pos.z;
  let pushed = false;
  for (const o of others) {
    if (Math.abs((o.y ?? pos.y ?? 0) - (pos.y ?? 0)) > maxDy) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= minDist) continue;
    let ux;
    let uz;
    if (d < 1e-4) {
      // tepat bertumpuk: dorong ke arah yang diberikan pemanggil (arah hadap), bukan sembarang
      const len = Math.hypot(pos.fx ?? 0, pos.fz ?? 1) || 1;
      ux = (pos.fx ?? 0) / len;
      uz = (pos.fz ?? 1) / len;
    } else {
      ux = dx / d;
      uz = dz / d;
    }
    x += ux * (minDist - d);
    z += uz * (minDist - d);
    pushed = true;
  }
  return { x, z, pushed };
}

// ---------------------------------------------------------------- tengok
export const HEAD_YAW_MAX = 1.05; // ±60°

/** Lirikan kiri-kanan sesekali saat diam (rad). `seed` membedakan antar avatar. */
export function idleGlance(t, seed = 0) {
  const gate = Math.max(0, Math.sin(t * 0.23 + seed * 3.1) - 0.15) / 0.85; // sebagian besar waktu menghadap depan
  return 0.5 * Math.sin(t * 0.6 + seed) * gate;
}

// ---------------------------------------------------------------- hormat (salam)
/** Bobot gerak hormat 0..1 pada fase p (0..1): naik cepat, bertahan, turun pelan. */
export function greetingCurve(p) {
  if (!(p > 0) || p >= 1) return 0;
  return smoothstep(0, 0.22, p) * (1 - smoothstep(0.68, 1, p));
}

/**
 * Daftar avatar yang sedang tampil. Tiap frame tiap avatar memanggil `touch`; `step` menghitung (1) siapa yang
 * ditengok dan (2) pasangan yang saling berhadapan dekat dan perlu saling memberi hormat. Setiap klien menghitungnya
 * sendiri dari posisi yang sama sehingga kedua sisi melihat hal serupa tanpa pesan jaringan tambahan.
 */
export function createMannersRegistry({ greetRange = 2.4, cone = 1.15, duration = 2.0, cooldown = 20, lookRange = 7, lookCone = 2.0, maxAge = 0.5, maxSpeed = 1.5 } = {}) {
  const entries = new Map();
  const last = new Map(); // "idA|idB" -> waktu salam terakhir
  return {
    get size() {
      return entries.size;
    },
    touch(id, data, now) {
      const e = entries.get(id) ?? { id, greetStart: null, look: null };
      Object.assign(e, data, { seen: now });
      entries.set(id, e);
      return e;
    },
    step(now) {
      for (const [id, e] of entries) if (now - e.seen > maxAge) entries.delete(id);
      const list = [...entries.values()];
      for (const e of list) {
        e.look = null;
        e.lookDist = Infinity;
      }
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];
          if (Math.abs((a.y ?? 0) - (b.y ?? 0)) > 1.2) continue;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d > lookRange) continue;
          const relA = wrapAngle(Math.atan2(-dx, -dz) - a.rot); // arah ke b dilihat dari a (+ = kiri)
          const relB = wrapAngle(Math.atan2(dx, dz) - b.rot);
          if (Math.abs(relA) < lookCone && d < a.lookDist) {
            a.look = { rel: relA, dist: d };
            a.lookDist = d;
          }
          if (Math.abs(relB) < lookCone && d < b.lookDist) {
            b.look = { rel: relB, dist: d };
            b.lookDist = d;
          }
          if (d > greetRange || a.busy || b.busy || (a.speed ?? 0) > maxSpeed || (b.speed ?? 0) > maxSpeed) continue;
          if (Math.abs(relA) > cone || Math.abs(relB) > cone) continue; // harus saling berhadapan
          const idle = (e) => e.greetStart === null || now - e.greetStart > duration;
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          if (!idle(a) || !idle(b) || now - (last.get(key) ?? -Infinity) < cooldown) continue;
          a.greetStart = now;
          b.greetStart = now;
          last.set(key, now);
        }
      }
      if (last.size > 400) for (const [k, t] of last) if (now - t > cooldown) last.delete(k);
    },
    /** Bobot hormat 0..1 untuk avatar `id` saat ini. */
    greeting(id, now) {
      const e = entries.get(id);
      if (!e || e.greetStart === null) return 0;
      return greetingCurve((now - e.greetStart) / duration);
    },
    /** { rel, dist } avatar yang ditengok (rel > 0 = kiri), atau null. */
    look(id) {
      return entries.get(id)?.look ?? null;
    },
    clear() {
      entries.clear();
      last.clear();
    },
  };
}
