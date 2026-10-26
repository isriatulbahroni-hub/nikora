// Pandangan kokpit yang bersih (tanpa THREE: hanya membaca pohon node): dipakai cockpit-view.js saat kamera berada di dalam kabin.
// Masalah yang diselesaikan: pada model GLB berlangit-langit rendah (mis. Bugatti Chiron) garis bawah atap hanya sekitar 3 derajat di atas mata pengemudi,
// jadi panel atap (cat + kaca) memenuhi sekitar 40% bagian atas layar dan jalan nyaris tidak terlihat. Selama kamera kabin aktif:
//   - semua mesh di bawah node ROOF/ATAP disembunyikan (atap ikut kembali saat kamera keluar dari kabin),
//   - kaca dibuat lebih bening lagi (hanya sebagai selaput tipis), lalu dikembalikan.
// Juga melaporkan apakah model punya spion tengah sendiri (INT_mirror_*, rear mirror): kalau punya, kokpit tidak menempelkan panel spion buatan kode
// (panel itulah yang tampil sebagai persegi putih besar di tengah atas layar).
const ROOF_NODE = /^(?:roof|atap)(?:[_. ]?\d+)?$/i;
const OWN_MIRROR = /^(?:int[_ ]?mirror|rear[_ ]?view[_ ]?mirror|int[_ ]?rear[_ ]?mirror|spion[_ ]?(?:tengah|dalam))/i;
const GLASS_NAME = /glass|kaca|window|windshield|windscreen|jendela/i;
const NOT_GLASS = /frame|trim|seal|rubber|karet|wiper|mirror|cermin|spion|cover/i;
export const COCKPIT_GLASS_OPACITY = 0.1;
const asArray = (m) => (Array.isArray(m) ? m : [m]);

const hasRoofAncestor = (o) => {
  for (let p = o; p; p = p.parent) if (p.name && ROOF_NODE.test(p.name)) return true;
  return false;
};

/** Cari bagian yang perlu disesuaikan di pohon model `root`. Aman dipanggil pada pohon kosong. */
export function findClearView(root) {
  const roof = [];
  const glass = new Map(); // bahan -> opacity asli
  let ownMirror = false;
  root?.traverse?.((o) => {
    if (o.name && OWN_MIRROR.test(o.name)) ownMirror = true;
    if (!o.isMesh) return;
    if (hasRoofAncestor(o)) roof.push({ mesh: o, visible: o.visible });
    for (const m of asArray(o.material)) {
      if (!m || glass.has(m)) continue;
      const label = m.name || o.name || '';
      if (GLASS_NAME.test(label) && !NOT_GLASS.test(label) && !NOT_GLASS.test(o.name || '')) glass.set(m, m.opacity ?? 1);
    }
  });
  return { roof, glass, ownMirror, on: false };
}

/** Pasang (on = true) atau kembalikan (on = false) pandangan bersih. Idempoten. */
export function applyClearView(state, on) {
  if (!state || state.on === on) return;
  state.on = on;
  for (const r of state.roof) r.mesh.visible = on ? false : r.visible;
  for (const [m, base] of state.glass) {
    m.opacity = on ? Math.min(base, COCKPIT_GLASS_OPACITY) : base;
    m.needsUpdate = true;
  }
}
