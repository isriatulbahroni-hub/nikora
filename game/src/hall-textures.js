import * as THREE from 'three';

// Tekstur prosedural (kanvas) untuk NIKORA Royal Wedding World: tanpa file aset, hasilnya selalu sama (PRNG berbenih).

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surface(w, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, { color = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.anisotropy = aniso;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Salinan tekstur dengan ulangan lain (berbagi kanvas yang sama). */
export function tiled(texture, rx, ry = rx) {
  const t = texture.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

// ---- Derau nilai (value noise) tileable ----
function makeNoise(seed, size = 64) {
  const r = rng(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = r();
  const at = (x, y) => grid[((y % size) + size) % size * size + (((x % size) + size) % size)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = at(xi, yi) * (1 - fx) + at(xi + 1, yi) * fx;
    const b = at(xi, yi + 1) * (1 - fx) + at(xi + 1, yi + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
}

function fbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += noise(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

/** Marmer putih berurat abu-abu dan emas tipis, dengan sambungan ubin 2x2 m (satu tekstur = 4x4 m). */
export function marbleTexture(size = 1024) {
  const [c, ctx] = surface(size);
  const r = rng(11);
  ctx.fillStyle = '#f2eee7';
  ctx.fillRect(0, 0, size, size);
  const noise = makeNoise(5, 32);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(noise, (x / size) * 8, (y / size) * 8, 5);
      const cloud = (n - 0.5) * 26;
      const i = (y * size + x) * 4;
      d[i] = 242 + cloud;
      d[i + 1] = 238 + cloud;
      d[i + 2] = 231 + cloud * 0.9;
    }
  }
  ctx.putImageData(img, 0, 0);
  const vein = (color, widthMin, widthMax, count, alpha) => {
    for (let k = 0; k < count; k += 1) {
      let x = r() * size;
      let y = r() * size;
      let a = r() * Math.PI * 2;
      const w = widthMin + r() * (widthMax - widthMin);
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        ctx.beginPath();
        let px = x + ox;
        let py = y + oy;
        ctx.moveTo(px, py);
        let aa = a;
        for (let s = 0; s < 40; s += 1) {
          aa += (r() - 0.5) * 0.7;
          px += Math.cos(aa) * 22;
          py += Math.sin(aa) * 22;
          ctx.lineTo(px, py);
        }
        ctx.strokeStyle = color.replace('A', String(alpha));
        ctx.lineWidth = w;
        ctx.stroke();
      }
    }
  };
  vein('rgba(150,146,140,A)', 1, 3.5, 26, 0.18);
  vein('rgba(120,116,110,A)', 0.6, 1.6, 22, 0.3);
  vein('rgba(201,162,74,A)', 0.8, 1.8, 7, 0.34);
  // sambungan ubin 2 m dengan alur halus
  ctx.strokeStyle = 'rgba(120,114,104,0.5)';
  ctx.lineWidth = 2;
  for (const p of [0, size / 2]) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (const p of [3, size / 2 + 3]) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Medali emas bermotif untuk lantai marmer (transparan di luar motif). */
export function medallionTexture(size = 1024) {
  const [c, ctx] = surface(size);
  const m = size / 2;
  const gold = ctx.createLinearGradient(0, 0, size, size);
  gold.addColorStop(0, '#f6dc8e');
  gold.addColorStop(0.5, '#c99a3c');
  gold.addColorStop(1, '#efd07a');
  ctx.strokeStyle = gold;
  ctx.fillStyle = gold;
  const ring = (rad, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(m, m, rad, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(m * 0.97, size * 0.012);
  ring(m * 0.9, size * 0.004);
  ring(m * 0.52, size * 0.008);
  ring(m * 0.47, size * 0.003);
  // bintang berujung 16
  ctx.beginPath();
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? m * 0.3 : m * 0.5;
    ctx.lineTo(m + Math.cos(a) * rad, m + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
  // kelopak arabesk
  ctx.lineWidth = size * 0.005;
  for (let i = 0; i < 16; i += 1) {
    ctx.save();
    ctx.translate(m, m);
    ctx.rotate((i / 16) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(m * 0.55, 0);
    ctx.bezierCurveTo(m * 0.65, -m * 0.14, m * 0.78, -m * 0.12, m * 0.86, 0);
    ctx.bezierCurveTo(m * 0.78, m * 0.12, m * 0.65, m * 0.14, m * 0.55, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m * 0.9, 0, size * 0.009, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#fff6dc';
  ctx.beginPath();
  ctx.arc(m, m, m * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = size * 0.006;
  ctx.stroke();
  return toTexture(c, { repeat: false });
}

/** Mosaik kolam: ubin biru kehijauan dengan nat tipis. */
export function poolTileTexture(size = 512) {
  const [c, ctx] = surface(size);
  const r = rng(23);
  const cell = size / 16;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const t = r();
      ctx.fillStyle = `rgb(${24 + t * 20}, ${132 + t * 40}, ${150 + t * 36})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  ctx.strokeStyle = 'rgba(190,235,240,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 16; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Jaring cahaya kaustik di dasar kolam (Worley F2-F1), terang di atas transparan. */
export function causticsTexture(size = 256) {
  const [c, ctx] = surface(size);
  const r = rng(77);
  const pts = Array.from({ length: 22 }, () => [r() * size, r() * size]);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let d1 = 1e9;
      let d2 = 1e9;
      for (const [px, py] of pts) {
        for (const ox of [-size, 0, size]) {
          for (const oy of [-size, 0, size]) {
            const d = Math.hypot(x - (px + ox), y - (py + oy));
            if (d < d1) {
              d2 = d1;
              d1 = d;
            } else if (d < d2) d2 = d;
          }
        }
      }
      const edge = Math.max(0, 1 - (d2 - d1) / 9);
      const v = edge ** 2.2;
      const i = (y * size + x) * 4;
      img.data[i] = 220;
      img.data[i + 1] = 250;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Peta normal riak air (jumlah gelombang sinus bilangan bulat agar mulus saat diulang). */
export function waterNormalTexture(size = 512, { strength = 2.4, seed = 3 } = {}) {
  const r = rng(seed);
  const waves = Array.from({ length: 9 }, () => ({
    kx: Math.round((r() * 2 - 1) * 9) + 1,
    ky: Math.round((r() * 2 - 1) * 9) + 1,
    ph: r() * Math.PI * 2,
    a: 0.35 + r() * 0.65,
  }));
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0;
      for (const w of waves) v += Math.sin(((x * w.kx + y * w.ky) / size) * Math.PI * 2 + w.ph) * w.a;
      h[y * size + x] = v;
    }
  }
  const [c, ctx] = surface(size);
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { color: false });
}

/** Plester krem istana + peta tonjolan untuk sambungan balok. */
export function facadeTextures(size = 512) {
  const r = rng(41);
  const [c, ctx] = surface(size);
  const [b, bctx] = surface(size);
  const noise = makeNoise(9, 32);
  const img = ctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);
  const rows = 8;
  const rowH = size / rows;
  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / rowH);
    for (let x = 0; x < size; x += 1) {
      const block = Math.floor((x + (row % 2) * (size / 8)) / (size / 4));
      const tone = (rng(row * 31 + block)() - 0.5) * 10;
      const n = (fbm(noise, (x / size) * 12, (y / size) * 12, 4) - 0.5) * 22 + tone;
      const edgeY = y % rowH;
      const edgeX = (x + (row % 2) * (size / 8)) % (size / 4);
      const seam = edgeY < 2 || edgeX < 2;
      const i = (y * size + x) * 4;
      img.data[i] = 238 + n - (seam ? 22 : 0);
      img.data[i + 1] = 224 + n - (seam ? 24 : 0);
      img.data[i + 2] = 198 + n * 0.9 - (seam ? 28 : 0);
      img.data[i + 3] = 255;
      const bv = seam ? 70 : 150 + n * 2 + r() * 10;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = bv;
      bimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  return { map: toTexture(c), bump: toTexture(b, { color: false }) };
}

/** Batu tebing: strata cokelat keabuan. */
export function rockTextures(size = 512) {
  const [c, ctx] = surface(size);
  const [b, bctx] = surface(size);
  const noise = makeNoise(21, 32);
  const img = ctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(noise, (x / size) * 6, (y / size) * 18, 5);
      const strata = Math.sin((y / size) * Math.PI * 14 + n * 6) * 0.5 + 0.5;
      const v = 0.45 + n * 0.5 + strata * 0.12;
      const i = (y * size + x) * 4;
      img.data[i] = 118 * v + 30;
      img.data[i + 1] = 104 * v + 28;
      img.data[i + 2] = 94 * v + 28;
      img.data[i + 3] = 255;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = 255 * v;
      bimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  return { map: toTexture(c), bump: toTexture(b, { color: false }) };
}

/** Rumput taman hijau tua. */
export function grassTexture(size = 512) {
  const [c, ctx] = surface(size);
  const noise = makeNoise(31, 32);
  const img = ctx.createImageData(size, size);
  const r = rng(32);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(noise, (x / size) * 10, (y / size) * 10, 5);
      const blade = r() * 18;
      const i = (y * size + x) * 4;
      img.data[i] = 46 + n * 50 + blade * 0.4;
      img.data[i + 1] = 92 + n * 70 + blade;
      img.data[i + 2] = 44 + n * 36;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Helai daun palem (alpha-cut): tulang daun dengan anak daun menjuntai. */
export function frondTexture() {
  const [c, ctx] = surface(256, 128);
  const r = rng(61);
  ctx.clearRect(0, 0, 256, 128);
  ctx.lineCap = 'round';
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#2f6a2a');
  g.addColorStop(1, '#6ea23a');
  ctx.strokeStyle = '#3b5f22';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.quadraticCurveTo(128, 60, 252, 66);
  ctx.stroke();
  for (let i = 0; i < 52; i += 1) {
    const t = i / 51;
    const x = 6 + t * 240;
    const spine = 64 + Math.sin(t * 3) * 2;
    const len = (1 - t * 0.72) * 58 + 4;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.6 - t * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, spine);
      ctx.quadraticCurveTo(x + 14, spine + side * len * 0.55, x + 22 + r() * 4, spine + side * len);
      ctx.stroke();
    }
  }
  return toTexture(c, { repeat: false });
}

/** Jendela lengkung bercahaya: gradasi hangat dengan kisi. Dipakai pada ShapeGeometry (UV 0..1). */
export function windowGlowTexture() {
  const [c, ctx] = surface(128, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ffe7ae');
  g.addColorStop(0.55, '#ffcf80');
  g.addColorStop(1, '#f0a255');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  const r = rng(5);
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = `rgba(255,255,230,${r() * 0.18})`;
    ctx.fillRect(r() * 128, r() * 256, 10 + r() * 30, 8 + r() * 24);
  }
  ctx.strokeStyle = 'rgba(88,52,22,0.9)';
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 124, 252);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(64, 0);
  ctx.lineTo(64, 256);
  for (const y of [84, 150, 212]) {
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
  }
  ctx.stroke();
  return toTexture(c, { repeat: false });
}

export function glowTexture() {
  const [c, ctx] = surface(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { repeat: false });
}

/** Percikan air: titik putih lembut kecil untuk partikel. */
export function dropTexture() {
  const [c, ctx] = surface(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(235,250,255,0.7)');
  g.addColorStop(1, 'rgba(220,245,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, { repeat: false });
}

/** Cincin riak yang menyebar dari air mancur. */
export function rippleTexture() {
  const [c, ctx] = surface(256);
  for (let i = 0; i < 3; i += 1) {
    const rad = 60 + i * 28;
    const g = ctx.createRadialGradient(128, 128, rad - 9, 128, 128, rad + 9);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.7 - i * 0.18})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return toTexture(c, { repeat: false });
}

/** Awan sore: gumpalan lembut putih (diwarnai lewat material). */
export function cloudTexture() {
  const [c, ctx] = surface(512, 192);
  const r = rng(91);
  for (let i = 0; i < 70; i += 1) {
    const x = 70 + r() * 372;
    const y = 70 + r() * 58;
    const rad = 26 + r() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return toTexture(c, { repeat: false });
}

/** Tirai kain tipis dengan lipatan vertikal (dipakai sebagai alphaMap/peta warna). */
export function sheerTexture() {
  const [c, ctx] = surface(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const fold = Math.sin((x / 256) * Math.PI * 2 * 6) * 0.5 + 0.5;
      const edge = 0.55 + 0.45 * (y / 256);
      const v = (0.52 + fold * 0.38) * edge;
      const i = (y * 256 + x) * 4;
      img.data[i] = 255 - (1 - fold) * 22;
      img.data[i + 1] = 252 - (1 - fold) * 24;
      img.data[i + 2] = 248 - (1 - fold) * 28;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Air terjun: guratan putih vertikal bertransparansi. */
export function waterfallTexture() {
  const [c, ctx] = surface(128, 512);
  const r = rng(13);
  ctx.clearRect(0, 0, 128, 512);
  for (let i = 0; i < 70; i += 1) {
    const x = r() * 128;
    const w = 1 + r() * 4;
    const y = r() * 512;
    const h = 60 + r() * 260;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.35 + r() * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillRect(x, y - 512, w, h);
  }
  return toTexture(c);
}

/** Karpet pelaminan: merah marun dengan bingkai emas. */
export function carpetTexture() {
  const [c, ctx] = surface(512);
  ctx.fillStyle = '#7d1f2e';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(6);
  for (let i = 0; i < 4000; i += 1) {
    ctx.fillStyle = `rgba(${r() > 0.5 ? '255,200,200' : '0,0,0'},${r() * 0.06})`;
    ctx.fillRect(r() * 512, r() * 512, 2, 2);
  }
  ctx.strokeStyle = '#d9b25a';
  for (const [inset, w] of [[18, 10], [40, 3], [52, 2]]) {
    ctx.lineWidth = w;
    ctx.strokeRect(inset, inset, 512 - inset * 2, 512 - inset * 2);
  }
  ctx.fillStyle = '#d9b25a';
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 9; i += 1) {
    const p = 90 + i * 41;
    for (const [x, y] of [[p, 30], [p, 482], [30, p], [482, p]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 7, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

/** Papan nama emas "NIKORA · Royal Wedding World" pada batu. */
export function signTexture() {
  const [c, ctx] = surface(1024, 512);
  const noise = makeNoise(15, 32);
  const img = ctx.createImageData(1024, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 1024; x += 1) {
      const n = fbm(noise, (x / 1024) * 10, (y / 512) * 6, 4);
      const i = (y * 1024 + x) * 4;
      img.data[i] = 74 + n * 46;
      img.data[i + 1] = 64 + n * 42;
      img.data[i + 2] = 56 + n * 38;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const gold = ctx.createLinearGradient(0, 120, 0, 380);
  gold.addColorStop(0, '#fff0b8');
  gold.addColorStop(0.5, '#d9a844');
  gold.addColorStop(1, '#b07c26');
  ctx.fillStyle = gold;
  ctx.strokeStyle = gold;
  // mahkota
  ctx.save();
  ctx.translate(512, 120);
  ctx.beginPath();
  ctx.moveTo(-58, 40);
  ctx.lineTo(-66, -14);
  ctx.lineTo(-34, 14);
  ctx.lineTo(-18, -26);
  ctx.lineTo(0, 10);
  ctx.lineTo(18, -26);
  ctx.lineTo(34, 14);
  ctx.lineTo(66, -14);
  ctx.lineTo(58, 40);
  ctx.closePath();
  ctx.fill();
  for (const [x, y] of [[-66, -18], [-18, -30], [18, -30], [66, -18], [0, 6]]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(-58, 46, 116, 12);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 168px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillText('NIKORA', 512, 330);
  ctx.shadowColor = 'transparent';
  ctx.font = '600 46px Georgia, "Times New Roman", serif';
  ctx.fillText('R O Y A L   W E D D I N G   W O R L D', 512, 410);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(150, 436);
  ctx.lineTo(874, 436);
  ctx.stroke();
  return toTexture(c, { repeat: false });
}

/** Siluet pegunungan jauh berlapis (pita panorama 4:1, transparan di atas). */
export function mountainTexture({ seed = 1, color = '#6a5a86', haze = 0.35, height = 0.5, roughness = 0.5 } = {}) {
  const w = 2048;
  const h = 256;
  const [c, ctx] = surface(w, h);
  const r = rng(seed);
  // pergeseran titik tengah, melingkar agar tepi kiri-kanan menyambung
  const n = 256;
  const ys = new Float32Array(n);
  ys[0] = ys[n - 1] = 0.5;
  const mid = (a, b, amp) => {
    if (b - a < 2) return;
    const m = (a + b) >> 1;
    ys[m] = (ys[a] + ys[b]) / 2 + (r() - 0.5) * amp;
    mid(a, m, amp * roughness * 1.4);
    mid(m, b, amp * roughness * 1.4);
  };
  mid(0, n - 1, 0.9);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < n; i += 1) ctx.lineTo((i / (n - 1)) * w, h - (0.25 + ys[i] * height) * h * 0.85);
  ctx.lineTo(w, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, color);
  g.addColorStop(1, `rgba(255,190,160,${haze})`);
  ctx.fillStyle = g;
  ctx.fill();
  return toTexture(c, { repeat: false });
}

/** Kumpulan semua tekstur dasar (dibuat sekali). */
export function createHallTextures() {
  const marble = marbleTexture();
  const facade = facadeTextures();
  const rock = rockTextures();
  return {
    marble,
    medallion: medallionTexture(),
    poolTile: poolTileTexture(),
    caustics: causticsTexture(),
    waterNormalA: waterNormalTexture(512, { strength: 2.6, seed: 3 }),
    waterNormalB: waterNormalTexture(512, { strength: 1.8, seed: 8 }),
    seaNormal: waterNormalTexture(512, { strength: 1.5, seed: 19 }),
    facade: facade.map,
    facadeBump: facade.bump,
    rock: rock.map,
    rockBump: rock.bump,
    grass: grassTexture(),
    frond: frondTexture(),
    windowGlow: windowGlowTexture(),
    glow: glowTexture(),
    drop: dropTexture(),
    ripple: rippleTexture(),
    cloud: cloudTexture(),
    sheer: sheerTexture(),
    waterfall: waterfallTexture(),
    carpet: carpetTexture(),
    sign: signTexture(),
    mountainNear: mountainTexture({ seed: 4, color: '#54476e', haze: 0.55, height: 0.55 }),
    mountainFar: mountainTexture({ seed: 9, color: '#8a6f93', haze: 0.7, height: 0.35, roughness: 0.42 }),
  };
}
