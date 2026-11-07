// Penghubung beberapa tempat acara yang dipasang di ujung lorong perjalanan (villa, masjid, ...) di dalam dunia hotel.
// hotel-main.js memanggil penghubung ini persis seperti dulu memanggil satu villa (active, near, walk, assist, constrain, place, update, ...),
// jadi halaman hotel tidak perlu tahu ada berapa tempat acara. Murni logika (tanpa THREE) supaya mudah diuji.
//
// Tiap tempat acara (`venue`) menyediakan antarmuka yang sama dengan hotel-villa.js:
//   id, zone, carColliders, occluders, loaded, anchored, anchor(f), load(), release(), active(p), near(p), toLocalPoint(p), localYaw(yaw),
//   walk(p, dx, dz), constrain(p), assist(p, move), place(p), update(args), state(), serta fenceZ dan approach untuk pemasangan di ujung rute.
export function createVenueHub(list) {
  const byId = Object.freeze(Object.fromEntries(list.map((v) => [v.id, v])));
  let cur = null; // tempat acara yang sedang dekat pemain (diperbarui near(), dipanggil tiap frame sebelum kamera dihitung)
  const mounted = () => list.filter((v) => v.anchored);
  // tempat acara yang memuat posisi p; bila tidak ada, yang terakhir dekat pemain, lalu yang terpasang pertama
  const pick = (p) => mounted().find((v) => v.active(p)) ?? cur ?? mounted()[0] ?? list[0];

  return {
    venues: byId,
    zone: list[0].zone,
    carColliders: [],
    /** Penghalang kamera tempat acara yang sedang dekat pemain (larik kosong bila tidak ada). */
    get occluders() { return cur?.occluders ?? []; },
    get loaded() { return list.some((v) => v.loaded); },
    get anchored() { return list.some((v) => v.anchored); },
    release() { for (const v of list) v.release(); cur = null; },
    active: (p) => mounted().some((v) => v.active(p)),
    near(p) {
      cur = mounted().find((v) => v.near(p)) ?? null;
      return cur !== null;
    },
    toLocalPoint: (p) => (cur ?? pick(p)).toLocalPoint(p),
    localYaw: (yaw) => (cur ?? mounted()[0] ?? list[0]).localYaw(yaw),
    walk: (p, dx, dz) => pick(p).walk(p, dx, dz),
    constrain: (p) => pick(p).constrain(p),
    assist: (p, move) => pick(p).assist(p, move),
    place(p) {
      for (const v of mounted()) {
        const r = v.place(p);
        if (r) return r;
      }
      return null;
    },
    update(args) { for (const v of list) v.update(args); },
    /** Bentuk lama (villa) tetap, ditambah keadaan semua tempat acara di `venues` (pengujian). */
    state() {
      return { ...list[0].state(), venues: Object.fromEntries(list.map((v) => [v.id, v.state()])) };
    },
  };
}
