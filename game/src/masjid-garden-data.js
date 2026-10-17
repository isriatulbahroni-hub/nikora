// Data murni "Taman Perenungan" di Halaman Selatan (antara Gerbang Utama dan sahn), tanpa THREE supaya dipakai
// denah/tabrakan dan renderer sekaligus, dan mudah diuji. Dua sayap kembar di kiri-kanan jalan berpalem tengah.
// Tiap sayap: kolam pantul dengan pancuran kecil, bangku, lentera, pohon bunga, dan sebuah gazebo untuk duduk merenung.
export const GARDEN = Object.freeze({
  id: 'taman_perenungan',
  name: 'Taman Perenungan',
  rect: Object.freeze([-80, 165, 80, 240]),
  wingX: 50, // pusat tiap sayap (±)
  wingHalfX: 28, // sayap membentang x = ±(22..78)
  z: 202, // garis tengah taman
  z0: 168,
  z1: 236,
  pool: Object.freeze({ x: 52, hx: 10.5, hz: 22, waterHx: 9, waterHz: 20.5 }),
  gazebo: Object.freeze({ x: 70, post: 3.2, roofR: 5.6 }),
  avenueX: 14, // tepi jalan berpalem tengah
});

/** Daftar properti taman (semua bertanda garden:true; digambar oleh masjid-garden.js, bukan rantai perabot biasa). */
export function gardenProps() {
  const props = [];
  const add = (type, x, z, extra) => props.push({ type, x, z, garden: true, ...extra });
  const { pool, gazebo } = GARDEN;
  for (const sx of [-1, 1]) {
    add('gpool', sx * pool.x, GARDEN.z, { sx });
    // bangku di ujung utara dan selatan kolam (menghadap kolam) dan di sisi jalan tengah (menghadap kolam)
    add('gbench', sx * pool.x, 176.8, { face: 1 });
    add('gbench', sx * pool.x, 227.2, { face: -1 });
    add('gbenchv', sx * 38, 190, { face: sx });
    add('gbenchv', sx * 38, 214, { face: sx });
    // lentera taman di empat sudut kolam
    for (const dx of [-12.2, 12.2]) for (const z of [179, 225]) add('glamp', sx * (pool.x + dx), z);
    // pohon bunga
    [[27, 174], [73, 174], [27, 230], [73, 230], [62, 176], [62, 228]].forEach(([x, z], i) => add('gtree', sx * x, z, { variant: i % 3 }));
    // gazebo: empat tiang (bisa dimasuki), atap digambar renderer
    for (const ox of [-1, 1]) for (const oz of [-1, 1]) add('gpost', sx * gazebo.x + ox * gazebo.post, GARDEN.z + oz * gazebo.post);
  }
  return props;
}

export const GARDEN_PROP_SPECS = Object.freeze({
  gpool: { hx: GARDEN.pool.hx, hz: GARDEN.pool.hz, h: 0.6 },
  gbench: { hx: 2.2, hz: 0.6, h: 1.4 },
  gbenchv: { hx: 0.6, hz: 2.2, h: 1.4 },
  glamp: { hx: 0.3, hz: 0.3, h: 4.2 },
  gtree: { hx: 0.4, hz: 0.4, h: 6 },
  gpost: { hx: 0.35, hz: 0.35, h: 5 },
});
