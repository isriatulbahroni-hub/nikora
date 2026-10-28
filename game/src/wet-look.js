// Basah karena hujan (tanpa THREE, diuji di Node): bahan dunia menggelap dan makin licin/mengilap seiring tanah basah (jalan, mobil, bangunan, petugas),
// dan avatar pemain sendiri basah hanya bila ia berdiri tanpa atap atau di luar kabin (mengering pelan di bawah atap atau di dalam mobil).
// Cat asli tiap bahan disimpan; bila kode lain mengubah warna bahan (mis. lampu), warna baru itu jadi dasar. Tidak menyentuh bahan polos (langit, lampu, papan),
// bahan transparan (kaca), dan bahan shader.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const WET = Object.freeze({ darken: 0.24, rough: 0.5, env: 0.55, person: 0.38 });
const key = (c) => Math.round(c.r * 4095) * 16777216 + Math.round(c.g * 4095) * 4096 + Math.round(c.b * 4095);
const listMaterials = (o) => { const m = o.material; return !m ? [] : Array.isArray(m) ? m : [m]; };

function eligible(m, allowBasic) {
  if (!m || !m.color || m.userData?.noWet || m.isShaderMaterial) return false;
  if (m.isSpriteMaterial || m.isPointsMaterial || m.isLineBasicMaterial) return false;
  if (m.transparent && m.opacity < 0.95) return false;
  if (m.isMeshBasicMaterial) return allowBasic;
  return true;
}

function apply(base, m, k, darken) {
  let b = base.get(m);
  if (!b) {
    b = { r: 0, g: 0, b: 0, rough: NaN, env: NaN, last: null };
    base.set(m, b);
  }
  const cur = key(m.color);
  if (b.last === null) {
    b.r = m.color.r; b.g = m.color.g; b.b = m.color.b;
    b.rough = m.roughness;
    b.env = m.envMapIntensity;
  } else if (cur !== b.last) {
    b.r = m.color.r; b.g = m.color.g; b.b = m.color.b; // kode lain mengganti warna: itu dasar yang baru
  }
  if (k <= 0.001) {
    if (b.last !== null) {
      m.color.setRGB(b.r, b.g, b.b);
      if (Number.isFinite(b.rough)) m.roughness = b.rough;
      if (Number.isFinite(b.env)) m.envMapIntensity = b.env;
      b.last = null;
    }
    return;
  }
  const f = 1 - darken * k;
  m.color.setRGB(b.r * f, b.g * f, b.b * f);
  b.last = key(m.color);
  if (Number.isFinite(b.rough)) m.roughness = Math.max(0.08, b.rough * (1 - WET.rough * k));
  if (Number.isFinite(b.env)) m.envMapIntensity = b.env * (1 + WET.env * k);
}

export function createWetLook({ scene } = {}) {
  const base = new WeakMap();
  const st = { g: 0, gAt: -1e9, gScan: -1e9, p: 0, pAt: -1e9, pScan: -1e9 };

  function collect(root, skip, allowBasic) {
    const out = new Set();
    const stack = [root];
    while (stack.length) {
      const o = stack.pop();
      if (!o || o === skip || o.visible === false) continue;
      for (const m of listMaterials(o)) if (eligible(m, allowBasic)) out.add(m);
      const ch = o.children;
      if (ch) for (let i = 0; i < ch.length; i++) stack.push(ch[i]);
    }
    return out;
  }
  const run = (root, skip, allowBasic, k, darken) => {
    for (const m of collect(root, skip, allowBasic)) apply(base, m, k, darken);
  };

  return {
    /** Tiap frame: time detik, wet = basah tanah 0..1, personWet = basah avatar 0..1, avatar = objek avatar pemain (dikecualikan dari basah tanah). */
    update({ time = 0, wet = 0, personWet = 0, avatar = null } = {}) {
      const g = clamp(Number(wet) || 0, 0, 1);
      const changedG = Math.abs(g - st.g) >= 0.015 || (g <= 0.001 && st.g > 0.001);
      const dueG = g > 0.02 && time - st.gScan >= 4; // bahan baru (villa, lorong) ikut basah
      if ((changedG || dueG) && time - st.gAt >= 0.35) {
        run(scene, avatar, false, g <= 0.001 ? 0 : g, WET.darken);
        st.g = g;
        st.gAt = time;
        st.gScan = time;
      }
      if (avatar) {
        const p = clamp(Number(personWet) || 0, 0, 1);
        const changedP = Math.abs(p - st.p) >= 0.015 || (p <= 0.001 && st.p > 0.001);
        const dueP = p > 0.02 && time - st.pScan >= 4;
        if ((changedP || dueP) && time - st.pAt >= 0.35) {
          run(avatar, null, true, p <= 0.001 ? 0 : p, WET.person);
          st.p = p;
          st.pAt = time;
          st.pScan = time;
        }
      }
    },
    /** Kembalikan semua cat asli (dipakai saat modul dibuang). */
    restore(avatar = null) {
      run(scene, avatar, false, 0, WET.darken);
      if (avatar) run(avatar, null, true, 0, WET.person);
      st.g = 0;
      st.p = 0;
    },
    info: () => ({ ground: st.g, person: st.p }),
  };
}
