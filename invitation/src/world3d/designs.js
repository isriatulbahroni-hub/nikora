/**
 * Tujuh desain amplop 3D. Ukuran dalam satuan dunia: amplop 22 x 14.5, tutup 60% tinggi.
 * Koordinat ornamen memakai ruang desain 440x290 (saku), 440x174 (tutup), 387x255 (surat).
 */
export const EW = 22, EH = 14.5, FH = EH * 0.6;
export const LW = 19.4, LH = LW * (255 / 387);

export const PEONY = {
  pink: { o: '#f9c6cf', m: '#f09bb0', i: '#e0728f', c: '#f6d36b', l: '#4e7d52' },
  ivory: { o: '#fffaf3', m: '#fbe6e8', i: '#f3c2cb', c: '#f1cd69', l: '#6b8c68' },
  rose: { o: '#a3192e', m: '#8a1226', i: '#6b0c1c', c: '#e8c35a', l: '#2f5a3a' },
};

const C4 = (s) => [[10, 10, 0, s], [377, 10, 90, s], [10, 245, -90, s], [377, 245, 180, s]];

export const DESIGNS = [
  { id: 'zamrud', label: 'ZAMRUD & EMAS', sub: 'Adat Jawa · hijau tua berfoil emas',
    body: '#25493b', dark: '#173025', liner: '#173025', bgTop: '#10302a', bgBot: '#050f0b', glow: '#ffd98a',
    letterBg: '#f7f1e0', ink: '#1e3a2e', nameColor: '#9a6f1d', flap: 'tri', edge: true,
    pattern: { kind: 'diamond', color: '#e8c776', a: 0.45 },
    seal: { kind: 'sticker', base: '#b88a2c', hi: '#fff0b0', ink: '#2a2410' },
    pocketCorners: [[8, 282, -90, .62], [432, 282, 180, .62]], flapCorners: [[8, 8, 0, .62], [432, 8, 90, .62]], pkName: true,
    letter: { corners: C4(.5) } },
  { id: 'bordeaux', label: 'BORDEAUX', sub: 'Merah anggur · segel lilin emas',
    body: '#701525', dark: '#470c18', liner: '#470c18', bgTop: '#2d0710', bgBot: '#0e0206', glow: '#ffb892',
    letterBg: '#fbf5ea', ink: '#5a1220', nameColor: '#7a1424', flap: 'curve', edge: true,
    pattern: { kind: 'diag', color: '#000000', a: 0.12 },
    seal: { kind: 'wax', base: '#a47422', hi: '#f6dc8e', ink: '#3a2608' },
    pocketCorners: [], flapCorners: [], pkName: true,
    letter: { flowers: [[32, 222, 24, 'rose'], [358, 34, 22, 'rose']], frame: true } },
  { id: 'biru', label: 'BIRU MALAM FLORAL', sub: 'Navy · liner bunga · label holografik',
    body: '#17296b', dark: '#0e1c4d', liner: '#fbf3e6', bgTop: '#0f1c55', bgBot: '#030618', glow: '#a9c4ff',
    letterBg: '#fffaf0', ink: '#16296a', nameColor: '#2a3f94', flap: 'curve', edge: false, linerFloral: true,
    pattern: { kind: 'wood', color: '#ffffff', a: 0.07 },
    seal: { kind: 'holo', base: '#dfe6ff', hi: '#ffffff', ink: '#1b2a63' },
    pocketCorners: [], flapCorners: [], pkName: false,
    letter: { flowers: [[28, 28, 22, 'pink'], [360, 228, 24, 'pink']], dots: [[66, 14], [318, 244]] } },
  { id: 'sage', label: 'SAGE PEONY', sub: 'Hijau kelabu · peoni gading · segel emas',
    body: '#94a99a', dark: '#6c8373', liner: '#e9efe8', bgTop: '#2a3a33', bgBot: '#0a110e', glow: '#ffe3c9',
    letterBg: '#ffffff', ink: '#3c5446', nameColor: '#9a6f1d', flap: 'tri', edge: false,
    pattern: { kind: 'speck', color: '#ffffff', a: 0.14 },
    seal: { kind: 'wax', base: '#b0842a', hi: '#f8e19a', ink: '#40300c' },
    pocketCorners: [], pocketFlowers: [[46, 262, 34, 'ivory'], [400, 268, 28, 'ivory'], [18, 214, 18, 'ivory']],
    flapCorners: [], flapFlowers: [[30, 22, 26, 'ivory'], [430, 14, 20, 'ivory']], pkName: false,
    letter: { flowers: [[30, 224, 26, 'ivory'], [360, 30, 22, 'ivory']] } },
  { id: 'mauve', label: 'MAUVE BATIK', sub: 'Ungu mauve · motif kawung · monogram emas',
    body: '#7d4b69', dark: '#563248', liner: '#563248', bgTop: '#3a1b33', bgBot: '#0e050c', glow: '#ffc7e3',
    letterBg: '#fbf3ee', ink: '#563248', nameColor: '#8a5a1c', flap: 'tri', edge: true,
    pattern: { kind: 'kawung', color: '#f0cf86', a: 0.3 },
    seal: { kind: 'sticker', base: '#c99a38', hi: '#ffe9a6', ink: '#3a2410' },
    pocketCorners: [], flapCorners: [], pkName: true,
    letter: { band: '#563248', corners: [[10, 10, 0, .5], [377, 10, 90, .5]] } },
  { id: 'navyemas', label: 'NAVY & EMAS ISLAMI', sub: 'Geometri bintang · tutup lengkung mihrab',
    body: '#112651', dark: '#0a1733', liner: '#0a1733', bgTop: '#0c1a45', bgBot: '#02050f', glow: '#ffe08a',
    letterBg: '#fbf6e8', ink: '#112651', nameColor: '#9a6f1d', flap: 'arch', edge: true,
    pattern: { kind: 'star', color: '#e8c776', a: 0.34 },
    seal: { kind: 'star8', base: '#c8993a', hi: '#ffeaa8', ink: '#2b2008' },
    pocketCorners: [], flapCorners: [], flapCrescent: true, pkName: false,
    letter: { arch: true, corners: C4(.45) } },
  { id: 'gapura', label: 'COKELAT GAPURA', sub: 'Candi bentar emas · tanah liat hangat',
    body: '#7b2f1f', dark: '#521d12', liner: '#521d12', bgTop: '#35140b', bgBot: '#0e0402', glow: '#ffc890',
    letterBg: '#fbf1e1', ink: '#521d12', nameColor: '#8a5a1c', flap: 'tri', edge: false,
    pattern: { kind: 'lattice', color: '#f0cf86', a: 0.12 },
    seal: { kind: 'sticker', base: '#e8dcc4', hi: '#fffaf0', ink: '#6b3a14' },
    pocketCorners: [[8, 282, -90, .6], [432, 282, 180, .6]], flapCorners: [], flapGapura: [160, 18, 1], pkName: true,
    letter: { gapura: [163, 8, .5], corners: [[10, 245, -90, .5], [377, 245, 180, .5]] } },
];

export const FLAP_PTS = {
  tri: [[0, 0], [100, 0], [50, 100]],
  curve: [[0, 0], [100, 0], [100, 30], [92, 58], [76, 82], [60, 96], [50, 100], [40, 96], [24, 82], [8, 58], [0, 30]],
  arch: [[0, 0], [100, 0], [100, 35], [88, 62], [70, 84], [56, 98], [50, 100], [44, 98], [30, 84], [12, 62], [0, 35]],
};
export const POCKET_PTS = [[0, 0], [50, 42], [100, 0], [100, 100], [0, 100]];

/** Padanan tema undangan -> desain amplop 3D. Tema tanpa padanan (minimalis, futuristik, ulang tahun) tetap 2D. */
export const THEME_DESIGN = {
  'pernikahan-adat-sasak': 'gapura',
  'pernikahan-islami': 'navyemas',
  'pernikahan-taman': 'sage',
  'pernikahan-kerajaan': 'bordeaux',
  'pernikahan-fantasi': 'biru',
};

/** Pilihan editor (config.design3d) menang atas padanan tema. null = pakai amplop 2D. */
export function designFor(view, override) {
  const sc = view && view.scenes && view.scenes.find((x) => x.kind === 'amplop');
  const wanted = [override, sc && sc.config && sc.config.design3d].find((v) => typeof v === 'string' && DESIGNS.some((d) => d.id === v));
  const id = wanted || THEME_DESIGN[view && view.theme && view.theme.id];
  return DESIGNS.find((d) => d.id === id) || null;
}
