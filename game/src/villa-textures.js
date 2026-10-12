import * as THREE from 'three';

// Tekstur dibuat di kanvas saat dimuat: tanpa file aset, tanpa masalah lisensi, dan hasilnya selalu sama (seed tetap).

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surface(w, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function finish(canvas, { color = true, repeat = true, anisotropy = 8 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Gambar `draw(dx, dy)` juga di sisi seberang tepi kanvas supaya tekstur menyambung mulus. */
function wrapped(w, h, x, y, margin, draw) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -margin && px < w + margin && py > -margin && py < h + margin) draw(px, py);
    }
  }
}

const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

export function grassTexture() {
  const size = 512;
  const rand = rng(11);
  const [canvas, ctx] = surface(size);
  ctx.fillStyle = '#4d8a3b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 70;
    const dark = rand() < 0.5;
    wrapped(size, size, x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, dark ? 'rgba(52,104,38,0.30)' : 'rgba(112,160,72,0.26)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  const greens = ['#2f6a2a', '#3f7d33', '#5a9a43', '#74ad55', '#8cbc66', '#355f26'];
  ctx.lineCap = 'round';
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 4 + rand() * 7;
    const angle = -Math.PI / 2 + (rand() - 0.5) * 1.3;
    ctx.strokeStyle = greens[(rand() * greens.length) | 0];
    ctx.globalAlpha = 0.35 + rand() * 0.4;
    ctx.lineWidth = 0.8 + rand() * 0.9;
    wrapped(size, size, x, y, len, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  return finish(canvas);
}

export function stoneTexture({ slabs = 4, base = [214, 202, 178], seed = 21 } = {}) {
  const size = 512;
  const cell = size / slabs;
  const rand = rng(seed);
  const [canvas, ctx] = surface(size);
  for (let r = 0; r < slabs; r++) {
    for (let c = 0; c < slabs; c++) {
      const v = (rand() - 0.5) * 26;
      ctx.fillStyle = rgb(base[0] + v, base[1] + v * 0.95, base[2] + v * 0.85);
      ctx.fillRect(c * cell, r * cell, cell, cell);
      const g = ctx.createLinearGradient(c * cell, r * cell, (c + 1) * cell, (r + 1) * cell);
      g.addColorStop(0, 'rgba(255,255,255,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = g;
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  for (let i = 0; i < 5000; i++) {
    const dark = rand() < 0.55;
    ctx.fillStyle = dark ? 'rgba(70,60,45,0.10)' : 'rgba(255,255,255,0.10)';
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.strokeStyle = 'rgba(96,86,70,0.85)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= slabs; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  return finish(canvas);
}

export function parquetTexture({ seed = 31 } = {}) {
  const size = 512;
  const columns = 8;
  const plankW = size / columns;
  const rand = rng(seed);
  const palette = [[168, 120, 78], [152, 105, 66], [182, 134, 92], [140, 96, 60], [171, 124, 84]];
  const [canvas, ctx] = surface(size);
  for (let c = 0; c < columns; c++) {
    const offset = Math.floor(rand() * 4) * 64;
    for (let seg = 0; seg < 2; seg++) {
      const y0 = (offset + seg * 256) % size;
      const base = palette[(rand() * palette.length) | 0];
      const v = (rand() - 0.5) * 16;
      const x = c * plankW;
      const draw = (yy) => {
        ctx.fillStyle = rgb(base[0] + v, base[1] + v, base[2] + v);
        ctx.fillRect(x, yy, plankW, 256);
        for (let g = 0; g < 22; g++) {
          ctx.strokeStyle = rgba2(rand() < 0.5 ? [90, 56, 30] : [210, 165, 120], 0.10 + rand() * 0.12);
          ctx.lineWidth = 0.6 + rand() * 1.2;
          const gx = x + 3 + rand() * (plankW - 6);
          ctx.beginPath();
          ctx.moveTo(gx, yy);
          ctx.bezierCurveTo(gx + (rand() - 0.5) * 6, yy + 85, gx + (rand() - 0.5) * 6, yy + 170, gx + (rand() - 0.5) * 4, yy + 256);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(40,24,12,0.65)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, yy, plankW, 256);
      };
      draw(y0);
      if (y0 + 256 > size) draw(y0 - size);
    }
  }
  return finish(canvas);
}

function rgba2([r, g, b], a) {
  return `rgba(${r},${g},${b},${a})`;
}

export function marbleTexture({ checker = false, seed = 41 } = {}) {
  const size = 512;
  const tiles = 2;
  const cell = size / tiles;
  const rand = rng(seed);
  const [canvas, ctx] = surface(size);
  for (let r = 0; r < tiles; r++) {
    for (let c = 0; c < tiles; c++) {
      const dark = checker && (r + c) % 2 === 1;
      const base = dark ? [176, 166, 150] : [240, 235, 224];
      const v = (rand() - 0.5) * 10;
      ctx.fillStyle = rgb(base[0] + v, base[1] + v, base[2] + v);
      ctx.fillRect(c * cell, r * cell, cell, cell);
      ctx.save();
      ctx.beginPath();
      ctx.rect(c * cell, r * cell, cell, cell);
      ctx.clip();
      for (let k = 0; k < 7; k++) {
        ctx.strokeStyle = rgb(120, 114, 104, 0.10 + rand() * 0.2);
        ctx.lineWidth = 0.5 + rand() * 1.6;
        ctx.beginPath();
        const x0 = c * cell + rand() * cell;
        const y0 = r * cell;
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x0 + (rand() - 0.5) * 140, y0 + cell * 0.3, x0 + (rand() - 0.5) * 160, y0 + cell * 0.65, x0 + (rand() - 0.5) * 120, y0 + cell);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(110,100,90,0.08)';
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.strokeStyle = 'rgba(150,142,128,0.9)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  return finish(canvas);
}

export function asphaltTexture() {
  const size = 256;
  const rand = rng(51);
  const [canvas, ctx] = surface(size);
  ctx.fillStyle = '#3b3e43';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 6500; i++) {
    const l = 40 + rand() * 90;
    ctx.fillStyle = rgb(l, l, l + 4, 0.22 + rand() * 0.25);
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }
  return finish(canvas);
}

export function poolTileTexture() {
  const size = 256;
  const cell = size / 4;
  const rand = rng(61);
  const [canvas, ctx] = surface(size);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = (rand() - 0.5) * 18;
      ctx.fillStyle = rgb(150 + v, 222 + v * 0.6, 232 + v * 0.4);
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  ctx.strokeStyle = 'rgba(225,245,247,0.95)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  return finish(canvas);
}

/** Peta normal gelombang air yang menyambung (jumlah beberapa gelombang sinus berfrekuensi bulat). */
export function waterNormalTexture() {
  const size = 256;
  const rand = rng(71);
  const waves = Array.from({ length: 7 }, () => ({
    fx: 1 + ((rand() * 6) | 0),
    fy: 1 + ((rand() * 6) | 0) * (rand() < 0.5 ? -1 : 1),
    amp: 0.5 + rand() * 0.8,
    phase: rand() * Math.PI * 2,
  }));
  const [canvas, ctx] = surface(size);
  const image = ctx.createImageData(size, size);
  const k = (Math.PI * 2) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos((w.fx * x + w.fy * y) * k + w.phase) * w.amp * k;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      let nx = -dx * 9;
      let ny = -dy * 9;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const nz = 1 / len;
      const i = (y * size + x) * 4;
      image.data[i] = (nx * 0.5 + 0.5) * 255;
      image.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return finish(canvas, { color: false });
}

/** Daun palem: sumbu di tengah (u=0.5), ujung di atas (v=1). Latar transparan untuk alphaTest. */
export function frondTexture() {
  const w = 128;
  const h = 512;
  const rand = rng(81);
  const [canvas, ctx] = surface(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  const leaflets = 40;
  for (let i = 0; i < leaflets; i++) {
    const t = (i + 0.5) / leaflets; // 0 = pangkal, 1 = ujung
    const y = h - 14 - t * (h - 36);
    const length = 14 + Math.sin(Math.min(1, t * 1.1) * Math.PI) ** 0.6 * 48;
    for (const side of [-1, 1]) {
      const g = 105 + rand() * 55;
      ctx.strokeStyle = rgb(36 + rand() * 24, g, 38 + rand() * 20);
      ctx.lineWidth = 6.5 - t * 3;
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 + side * length * 0.55, y - 12 - length * 0.1, w / 2 + side * length, y + length * 0.32);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#2c5a22';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, 6);
  ctx.stroke();
  return finish(canvas, { repeat: false });
}

/** Karpet bermotif sederhana (satu tekstur dipetakan sekali pada satu bidang). */
export function rugTexture(main = '#8c2f39', accent = '#e8d9b0') {
  const size = 256;
  const [canvas, ctx] = surface(size);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = main;
  ctx.fillRect(14, 14, size - 28, size - 28);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, size - 52, size - 52);
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const inset = 44 + i * 16;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = i % 2 ? accent : 'rgba(255,255,255,0.35)';
    const s = (size - inset * 2) * 0.62;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 9, 0, Math.PI * 2);
  ctx.fill();
  return finish(canvas, { repeat: false });
}
