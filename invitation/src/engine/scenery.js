/**
 * Pemandangan berlapis (jauh, tengah, dekat) untuk latar adegan. Dibuat dari bentuk SVG sederhana
 * yang diwarnai oleh token tema, jadi satu resep tampil berbeda di tiap tema dan tanpa berkas gambar.
 * Lapisan digeser berbeda-beda saat kursor/jari bergerak (parallax) agar kedalamannya terasa.
 */
export const SCENERY_KINDS = ['lumbung', 'masjid', 'taman', 'istana', 'pulau', 'bukit', 'kota', 'balon', 'panggung'];

const NS = 'http://www.w3.org/2000/svg';
const W = 400;
const H = 200;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Number(n.toFixed(1));
const node = (tag, a) => ({ tag, a });
const path = (d, cls) => node('path', { d, class: cls });
const rect = (x, y, w, h, cls) => node('rect', { x: f(x), y: f(y), width: f(w), height: f(h), class: cls });
const circle = (cx, cy, r, cls) => node('circle', { cx: f(cx), cy: f(cy), r: f(r), class: cls });
const ellipse = (cx, cy, rx, ry, cls) => node('ellipse', { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry), class: cls });

/** Garis punggung bukit yang halus, tertutup ke dasar. */
function ridge(r, base, amp, steps = 7) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push([(W / steps) * i, base - r() * amp]);
  let d = `M0 ${H} L${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q${f(x0 + (x1 - x0) * 0.5)} ${f(Math.min(y0, y1) - amp * 0.18)} ${f(x1)} ${f(y1)}`;
  }
  return path(`${d} L${W} ${H} Z`);
}

const crenels = (x, w, y, n) => Array.from({ length: n }, (_, i) => rect(x + (w / n) * i + 1, y - 7, w / n - 3, 8));

const RECIPES = {
  bukit: (r) => ({
    far: [ridge(r, 120, 50, 5)],
    mid: [ridge(r, 150, 36, 7)],
    near: [ridge(r, 182, 22, 9)],
  }),

  lumbung: (r) => {
    const hut = (x, y, s) => [
      path(`M${x - 36 * s} ${y} L${x - 7 * s} ${y - 36 * s} Q${x} ${y - 44 * s} ${x + 7 * s} ${y - 36 * s} L${x + 36 * s} ${y} Z`),
      rect(x - 22 * s, y, 4 * s, 26 * s), rect(x + 18 * s, y, 4 * s, 26 * s), rect(x - 22 * s, y + 22 * s, 44 * s, 4 * s),
    ];
    return {
      far: [path(`M0 ${H} L0 150 L110 118 L170 70 L205 28 L238 74 L300 120 L${W} 148 L${W} ${H} Z`)],
      mid: [ridge(r, 156, 14, 8), ...hut(90, 150, 1), ...hut(300, 156, 1.15)],
      near: [ridge(r, 186, 12, 10), ...hut(205, 176, 0.8).slice(0, 1)],
    };
  },

  masjid: (r) => {
    const minaret = (x) => [rect(x - 5, 84, 10, 116), path(`M${x - 8} 84 L${x + 8} 84 L${x} 60 Z`), circle(x, 56, 3), rect(x - 7, 118, 14, 3)];
    return {
      far: [ridge(r, 140, 26, 6)],
      mid: [
        rect(150, 140, 100, 60), path('M148 142 C148 88 252 88 252 142 Z'), rect(199, 76, 2, 18), circle(200, 74, 3.2),
        path('M118 200 V168 C118 148 148 148 148 168 V200 Z'), path('M252 200 V168 C252 148 282 148 282 168 V200 Z'),
        ...minaret(104), ...minaret(296),
        rect(188, 168, 24, 32, 'lit'),
      ],
      near: [ridge(r, 188, 12, 10)],
    };
  },

  taman: (r) => {
    const tree = (x, y, s) => [rect(x - 3 * s, y, 6 * s, 30 * s), circle(x, y - 6 * s, 22 * s), circle(x - 16 * s, y + 4 * s, 15 * s), circle(x + 16 * s, y + 4 * s, 15 * s)];
    const flowers = Array.from({ length: 18 }, () => circle(r() * W, 176 + r() * 20, 2 + r() * 2.4, 'lit'));
    return {
      far: [ridge(r, 128, 36, 6), ...tree(70, 104, 0.8), ...tree(330, 100, 0.9)],
      mid: [ridge(r, 156, 20, 8), ...tree(150, 126, 1), ...tree(262, 130, 1.1)],
      near: [ridge(r, 184, 14, 10), ...flowers],
    };
  },

  istana: (r) => {
    const tower = (x, w, top, lit) => [rect(x - w / 2, top, w, H - top), path(`M${x - w / 2 - 4} ${top} L${x} ${top - 34} L${x + w / 2 + 4} ${top} Z`), ...(lit ? [rect(x - 3, top + 18, 6, 12, 'lit')] : [])];
    return {
      far: [ridge(r, 132, 40, 5)],
      mid: [
        rect(70, 140, 260, 60), ...crenels(70, 260, 140, 18),
        ...tower(70, 40, 100, true), ...tower(330, 40, 100, true), ...tower(200, 54, 66, true),
        rect(188, 168, 24, 32, 'lit'),
      ],
      near: [ridge(r, 190, 10, 10)],
    };
  },

  pulau: (r) => {
    const isle = (x, y, s) => [
      path(`M${x - 44 * s} ${y} Q${x} ${y - 16 * s} ${x + 44 * s} ${y} L${x + 18 * s} ${y + 32 * s} L${x} ${y + 52 * s} L${x - 18 * s} ${y + 32 * s} Z`),
      circle(x - 12 * s, y - 12 * s, 9 * s), circle(x + 8 * s, y - 14 * s, 11 * s),
    ];
    const clouds = Array.from({ length: 5 }, (_, i) => ellipse(40 + i * 82 + r() * 20, 40 + r() * 70, 30 + r() * 20, 7 + r() * 4));
    return {
      far: clouds,
      mid: [...isle(96, 96, 0.8), ...isle(318, 70, 0.7)],
      near: [...isle(210, 132, 1.25)],
    };
  },

  kota: (r) => {
    const row = (minH, maxH, lit) => {
      const out = [];
      for (let x = -6; x < W; ) {
        const w = 16 + r() * 22;
        const h = minH + r() * (maxH - minH);
        out.push(rect(x, H - h, w, h));
        for (let wy = H - h + 8; wy < H - 6; wy += 11) {
          for (let wx = x + 4; wx < x + w - 5; wx += 8) if (r() > (lit ? 0.55 : 0.8)) out.push(rect(wx, wy, 3, 4, 'lit'));
        }
        x += w + 2;
      }
      return out;
    };
    return { far: row(50, 120, false), mid: row(36, 96, true), near: [ridge(r, 192, 6, 12)] };
  },

  balon: (r) => {
    const balloon = (x, y, s, c) => [ellipse(x, y, 15 * s, 19 * s, `c${c}`), path(`M${x} ${y + 19 * s} Q${x - 5 * s} ${y + 40 * s} ${x} ${y + 62 * s}`, 'string')];
    const many = (n, y0, y1, s0, s1) => Array.from({ length: n }, (_, i) => balloon((W / n) * i + 20 + r() * 26, y0 + r() * (y1 - y0), s0 + r() * (s1 - s0), (i % 3) + 1)).flat();
    return {
      far: many(7, 24, 90, 0.5, 0.7),
      mid: many(5, 40, 110, 0.85, 1.1),
      near: [...balloon(36, 128, 1.5, 1), ...balloon(366, 120, 1.6, 2), ridge(r, 194, 6, 10)],
    };
  },

  panggung: (r) => {
    const beam = (x, w) => path(`M${x} 0 L${x + w} 0 L${x + w * 2.4} ${H} L${x - w * 1.4} ${H} Z`, 'beam');
    const crowd = Array.from({ length: 16 }, (_, i) => [circle(i * 26 + 8 + r() * 10, 180 + r() * 6, 8 + r() * 3), rect(i * 26 - 1 + r() * 10, 188, 18, 14)]).flat();
    return {
      far: [beam(40, 14), beam(150, 16), beam(262, 14), beam(340, 12)],
      mid: [rect(0, 150, W, 50), rect(30, 106, 38, 44), rect(332, 106, 38, 44), circle(49, 128, 10, 'lit'), circle(351, 128, 10, 'lit'), rect(120, 142, 160, 8, 'lit')],
      near: crowd,
    };
  },
};

function drawLayer(items) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.setAttribute('aria-hidden', 'true');
  for (const { tag, a } of items) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) if (v != null) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

/** Elemen latar siap pakai: <div class="scenery"> berisi tiga lapisan + cahaya bulan/matahari. */
export function buildScenery(kind, seed = 7) {
  const recipe = RECIPES[kind] || RECIPES.bukit;
  const layers = recipe(rng(seed));
  const root = document.createElement('div');
  root.className = 'scenery';
  root.dataset.kind = RECIPES[kind] ? kind : 'bukit';
  root.setAttribute('aria-hidden', 'true');
  const orb = document.createElement('div');
  orb.className = 'sc-orb';
  root.append(orb);
  for (const depth of ['far', 'mid', 'near']) {
    const layer = document.createElement('div');
    layer.className = `sc-layer sc-${depth}`;
    layer.append(drawLayer(layers[depth]));
    root.append(layer);
  }
  return root;
}
