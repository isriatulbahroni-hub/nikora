// Tampilan Game Center: lantai bertema, lapangan bulu tangkis resmi, papan nama, mesin arcade, dan gerbang lengkung.
// Dinding, pintu, dan atap sudah dibuat oleh villa-world.js dari data denah; modul ini hanya menambah dekor.
// Sengaja hemat: bentuk dasar tanpa lampu tambahan dan tanpa tekstur gambar (HP kelas menengah).
import * as THREE from 'three';
import { BADMINTON_COURTS, COURT, GAMES, GAME_ARCH, GAME_ROOMS, GAME_SIGNS, GAME_TERMINALS, GAME_ZONES, courtLines } from './villa-gamewing.js';

const FLOOR_COLORS = Object.freeze({ game_badminton: 0x2f7d4f, game_horror: 0x2b1d22, game_moba: 0x1b2540 });
const GAME_COLORS = Object.freeze({ badminton: '#39d98a', horror: '#ff4d4d', moba: '#7aa2ff' });
const FACE_ROT = Object.freeze({ n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }); // depan model = utara (-z)

/** Kanvas teks sebagai tekstur. Mengembalikan null bila 2D canvas tidak tersedia (mis. saat uji tanpa DOM penuh). */
function textTexture(lines, { w = 512, h = 128, bg = '#1b1b2b', fg = '#ffffff', accent = '#ffd166' } = {}) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext?.('2d');
  if (!g) return null;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [main, sub] = lines;
  g.fillStyle = fg;
  g.font = `bold ${sub ? Math.round(h * 0.42) : Math.round(h * 0.5)}px system-ui, sans-serif`;
  g.fillText(main, w / 2, sub ? h * 0.38 : h / 2, w - 30);
  if (sub) {
    g.fillStyle = accent;
    g.font = `${Math.round(h * 0.24)}px system-ui, sans-serif`;
    g.fillText(sub, w / 2, h * 0.76, w - 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const basic = (color, map = null) => new THREE.MeshBasicMaterial({ color: map ? 0xffffff : color, map, toneMapped: false });

export function buildGameWingDecor(scene, { catalog = GAMES } = {}) {
  const group = new THREE.Group();
  group.name = 'game-wing-decor';
  const geos = [];
  const mats = [];
  const texs = [];
  const geo = (g) => {
    geos.push(g);
    return g;
  };
  const mat = (m) => {
    mats.push(m);
    return m;
  };
  const tex = (t) => {
    if (t) texs.push(t);
    return t;
  };
  const onFloor = (w, d, x, y, z, material) => {
    const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, d)), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // ---- plaza: paving batu di antara dua arena sampai gerbang ----
  const paving = mat(new THREE.MeshStandardMaterial({ color: 0xd2c6ae, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  for (const z of GAME_ZONES) {
    const [x1, z1, x2, z2] = z.rect;
    onFloor(x2 - x1, z2 - z1, (x1 + x2) / 2, 0.03, (z1 + z2) / 2, paving);
  }

  // ---- lantai bertema tiap arena (sedikit di atas lantai bawaan) ----
  for (const r of GAME_ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    const m = mat(new THREE.MeshStandardMaterial({ color: FLOOR_COLORS[r.id] ?? 0x333333, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    onFloor(x2 - x1 - 0.3, z2 - z1 - 0.3, (x1 + x2) / 2, 0.05, (z1 + z2) / 2, m);
  }

  // ---- lapangan bulu tangkis resmi (dua lapangan), garis + jaring + tiang ----
  const line = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const court = mat(new THREE.MeshStandardMaterial({ color: 0x246b44, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const netMat = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, toneMapped: false }));
  const postMat = mat(new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.5, metalness: 0.4 }));
  for (const c of BADMINTON_COURTS) {
    onFloor(COURT.length + 1.6, COURT.width + 1.6, c.x, 0.055, c.z, court); // area bermain sedikit lebih terang dari lantai
    for (const l of courtLines(c.x, c.z)) onFloor(l.w, l.d, l.x, 0.06, l.z, line);
    const hw = COURT.width / 2 + 0.3;
    const net = new THREE.Mesh(geo(new THREE.PlaneGeometry(COURT.width + 0.6, 0.76)), netMat);
    net.rotation.y = Math.PI / 2; // membentang sepanjang z
    net.position.set(c.x, COURT.netHeight - 0.38, c.z);
    group.add(net);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.035, 0.035, COURT.netHeight, 6)), postMat);
      post.position.set(c.x, COURT.netHeight / 2, c.z + s * hw);
      group.add(post);
    }
  }

  // ---- papan nama di atas pintu ----
  for (const s of GAME_SIGNS) {
    const t = tex(textTexture([s.text, s.sub], { bg: s.scary ? '#3a0d12' : '#13233a', accent: s.scary ? '#ff6b6b' : '#ffd166' }));
    const m = mat(basic(s.scary ? 0x3a0d12 : 0x13233a, t));
    const sign = new THREE.Mesh(geo(new THREE.PlaneGeometry(s.w, s.h)), m);
    sign.position.set(s.x, s.y, s.z);
    sign.rotation.y = s.ry;
    group.add(sign);
  }

  // ---- gerbang lengkung GAME CENTER di mulut plaza ----
  {
    const stone = mat(new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.8 }));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(geo(new THREE.BoxGeometry(0.8, GAME_ARCH.height, 0.8)), stone);
      p.position.set(s * GAME_ARCH.halfSpan, GAME_ARCH.height / 2, GAME_ARCH.z);
      p.castShadow = true;
      group.add(p);
    }
    const beam = new THREE.Mesh(geo(new THREE.BoxGeometry(GAME_ARCH.halfSpan * 2 + 0.8, 1.2, 0.8)), stone);
    beam.position.set(0, GAME_ARCH.height - 0.6, GAME_ARCH.z);
    beam.castShadow = true;
    group.add(beam);
    const t = tex(textTexture([GAME_ARCH.text, GAME_ARCH.sub], { w: 768, h: 160, bg: '#101a30', accent: '#ffd166' }));
    const m = mat(basic(0x101a30, t));
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(geo(new THREE.PlaneGeometry(GAME_ARCH.halfSpan * 2 - 0.4, 0.95)), m);
      face.position.set(0, GAME_ARCH.height - 0.6, GAME_ARCH.z + side * 0.42);
      if (side === 1) face.rotation.y = 0;
      else face.rotation.y = Math.PI;
      group.add(face);
    }
  }

  // ---- mesin arcade / meja pertandingan (depan menghadap sesuai `face`) ----
  const body = mat(new THREE.MeshStandardMaterial({ color: 0x1d1f2e, roughness: 0.6, metalness: 0.2 }));
  for (const term of GAME_TERMINALS) {
    const entry = catalog[term.game];
    const color = GAME_COLORS[term.game] ?? '#7aa2ff';
    const cab = new THREE.Group();
    cab.position.set(term.x, 0, term.z);
    cab.rotation.y = FACE_ROT[term.face] ?? 0;
    const base = new THREE.Mesh(geo(new THREE.BoxGeometry(1.0, 1.9, 0.6)), body);
    base.position.y = 0.95;
    base.castShadow = true;
    cab.add(base);
    const soon = !entry || entry.status !== 'ready';
    const screenTex = tex(textTexture(soon ? ['SEGERA', 'HADIR'] : [entry.label], { w: 256, h: 192, bg: '#05060d', fg: color, accent: color }));
    const screen = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.8, 0.6)), mat(basic(new THREE.Color(color).multiplyScalar(0.55).getHex(), screenTex)));
    screen.position.set(0, 1.35, -0.305);
    screen.rotation.y = Math.PI;
    cab.add(screen);
    const marqueeTex = tex(textTexture([entry?.label ?? term.game.toUpperCase()], { w: 256, h: 64, bg: '#0b0c16', fg: color, accent: color }));
    const marquee = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.0, 0.25)), mat(basic(0x0b0c16, marqueeTex)));
    marquee.position.set(0, 1.78, -0.305);
    marquee.rotation.y = Math.PI;
    cab.add(marquee);
    const panel = new THREE.Mesh(geo(new THREE.BoxGeometry(0.9, 0.08, 0.25)), mat(new THREE.MeshStandardMaterial({ color: 0x3a3d55, roughness: 0.5 })));
    panel.position.set(0, 0.95, -0.42);
    cab.add(panel);
    group.add(cab);
  }

  scene.add(group);
  return {
    group,
    dispose() {
      scene.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
