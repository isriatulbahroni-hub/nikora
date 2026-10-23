// Menara pendamping NIKORA Grand Hotel (satuan meter): empat menara kaca lebih rendah di sisi barat dan timur podium,
// seperti pada gambar acuan (menara utama dikelilingi beberapa menara kecil). Murni data + matematika (tanpa THREE) supaya bisa
// diuji; digambar hotel-tower-view.js. hotel-layout.js memakainya sebagai penghalang jalan kaki dan mobil.
//
// Letak: di tepi barat dan timur tapak hotel, di luar jangkauan sayap kristal podium (sayap maksimal 24 m dari tepi bangunan,
// x = ±102) dan di dalam Lingkar NIKORA (tepi dalam aspal x = ±152,75). Kulit tiap menara meruncing per zona, sudutnya dipotong.
export const SATELLITE_ZONES = 6; // jumlah ruas kulit per menara
export const SATELLITE_CHAMFER = 0.1; // potongan sudut = 10% dari sisi terpendek
export const SATELLITE_PAD = 1.5; // jarak penghalang jalan kaki dan mobil dari kulit

export const SATELLITES = Object.freeze([
  Object.freeze({ id: 'barat-utara', x: -127, z: 478, hx: 17, hz: 17, height: 1300, taper: 0.24 }),
  Object.freeze({ id: 'barat-selatan', x: -127, z: 538, hx: 17, hz: 17, height: 1900, taper: 0.28 }),
  Object.freeze({ id: 'timur-utara', x: 127, z: 478, hx: 17, hz: 17, height: 1700, taper: 0.26 }),
  Object.freeze({ id: 'timur-selatan', x: 127, z: 538, hx: 17, hz: 17, height: 1100, taper: 0.22 }),
]);

/** Persegi tapak dasar [minX, minZ, maxX, maxZ], ditambah `pad` di keempat sisi. */
export const satelliteRect = (s, pad = 0) => [s.x - s.hx - pad, s.z - s.hz - pad, s.x + s.hx + pad, s.z + s.hz + pad];

/** Skala tapak pada t = 0 (dasar) .. 1 (puncak): kurva t^1,5 (cekung), sama dengan taper menara utama. */
export const satelliteScale = (s, t) => 1 - s.taper * Math.pow(Math.min(1, Math.max(0, t)), 1.5);

/** Cincin segi delapan di ketinggian y: persegi [x±hx*skala, z±hz*skala] dengan sudut dipotong. Urut dari barat laut searah jarum jam. */
export function satelliteRing(s, t) {
  const k = satelliteScale(s, t);
  const hx = s.hx * k;
  const hz = s.hz * k;
  const c = SATELLITE_CHAMFER * 2 * Math.min(hx, hz);
  const x0 = s.x - hx;
  const x1 = s.x + hx;
  const z0 = s.z - hz;
  const z1 = s.z + hz;
  return { y: s.height * t, pts: [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]] };
}

/** SATELLITE_ZONES + 1 cincin dari tanah sampai atap. */
export function satelliteRings(s, zones = SATELLITE_ZONES) {
  return Array.from({ length: zones + 1 }, (_, i) => satelliteRing(s, i / zones));
}

/** Jarum puncak di atas atap: kerucut ramping setinggi 8% tinggi menara. */
export function satelliteSpire(s) {
  const height = Math.round(s.height * 0.08);
  return { x: s.x, z: s.z, baseY: s.height, height, radius: 2.6, tipY: s.height + height };
}

/** Penghalang jalan kaki dan mobil di lantai dasar: persegi bertepi tapak + SATELLITE_PAD. */
export function satelliteColliders() {
  return SATELLITES.map((s) => {
    const r = satelliteRect(s, SATELLITE_PAD);
    return { minX: r[0], maxX: r[2], minZ: r[1], maxZ: r[3] };
  });
}
