// Tampilan sayap Ruang Game: lantai bertema, garis lapangan, papan nama, dan mesin arcade.
// Dinding, pintu, dan atap sudah dibuat oleh villa-world.js dari data denah; modul ini hanya menambah dekor.
// Sengaja hemat: bentuk dasar tanpa lampu tambahan dan tanpa tekstur gambar (HP kelas menengah).
import * as THREE from 'three';
import { GAMES, GAME_ROOMS, GAME_SIGNS, GAME_TERMINALS } from './villa-gamewing.js';

const FLOOR_COLORS = Object.freeze({ game_badminton: 0x2f7d4f, game_lobby: 0x4a3b32, game_horror: 0x2b1d22 });
const GAME_COLORS = Object.freeze({ badminton: '#39d98a', horror: '#ff4d4d' });

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

  // ---- lantai bertema (sedikit di atas lantai bawaan) ----
  for (const r of GAME_ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    const m = mat(new THREE.MeshStandardMaterial({ color: FLOOR_COLORS[r.id] ?? 0x333333, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const floor = new THREE.Mesh(geo(new THREE.PlaneGeometry(x2 - x1 - 0.3, z2 - z1 - 0.3)), m);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    floor.receiveShadow = true;
    group.add(floor);
  }

  // ---- garis lapangan mini di ruang bulu tangkis (hiasan; tanpa tabrakan) ----
  const bad = GAME_ROOMS.find((r) => r.game === 'badminton');
  if (bad) {
    const cx = (bad.rect[0] + bad.rect[2]) / 2;
    const cz = (bad.rect[1] + bad.rect[3]) / 2;
    const hw = 2.6;
    const hd = 3.4;
    const line = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const add = (w, d, x, z) => {
      const l = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, d)), line);
      l.rotation.x = -Math.PI / 2;
      l.position.set(cx + x, 0.06, cz + z);
      group.add(l);
    };
    const t = 0.06;
    add(hw * 2 + t, t, 0, -hd);
    add(hw * 2 + t, t, 0, hd);
    add(t, hd * 2, -hw, 0);
    add(t, hd * 2, hw, 0);
    add(hw * 2, t, 0, 0); // garis jaring
    add(hw * 2, t, 0, -hd * 0.45);
    add(hw * 2, t, 0, hd * 0.45);
    add(t, hd * 2 * 0.45, 0, -hd * 0.725);
    add(t, hd * 2 * 0.45, 0, hd * 0.725);
    const net = new THREE.Mesh(geo(new THREE.PlaneGeometry(hw * 2, 0.8)), mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false })));
    net.rotation.y = Math.PI / 2;
    net.rotation.set(0, 0, 0);
    net.position.set(cx, 0.55, cz);
    group.add(net);
  }

  // ---- papan nama ----
  for (const s of GAME_SIGNS) {
    const t = tex(textTexture([s.text, s.sub], { bg: s.scary ? '#3a0d12' : '#13233a', accent: s.scary ? '#ff6b6b' : '#ffd166' }));
    const m = mat(basic(s.scary ? 0x3a0d12 : 0x13233a, t));
    const sign = new THREE.Mesh(geo(new THREE.PlaneGeometry(s.w, s.h)), m);
    sign.position.set(s.x, s.y, s.z);
    sign.rotation.y = s.ry;
    group.add(sign);
  }

  // ---- mesin arcade (depan menghadap utara, -z) ----
  const body = mat(new THREE.MeshStandardMaterial({ color: 0x1d1f2e, roughness: 0.6, metalness: 0.2 }));
  for (const term of GAME_TERMINALS) {
    const entry = catalog[term.game];
    const color = GAME_COLORS[term.game] ?? '#7aa2ff';
    const cab = new THREE.Group();
    cab.position.set(term.x, 0, term.z);
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
