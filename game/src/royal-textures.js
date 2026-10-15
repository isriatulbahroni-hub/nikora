import * as THREE from 'three';

// Tekstur kanvas untuk Istana Cinta: tanpa file aset, hasil selalu sama.
function surface(w, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}
const tex = (canvas, color = true) => {
  const t = new THREE.CanvasTexture(canvas);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** Bintik cahaya lembut (untuk partikel dan halo). */
export function glowTexture() {
  const [c, ctx] = surface(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return tex(c);
}

/** Gumpalan awan lembut untuk sprite langit. */
export function cloudTexture() {
  const [c, ctx] = surface(256, 128);
  for (let i = 0; i < 26; i++) {
    const x = 40 + Math.random() * 176;
    const y = 40 + Math.random() * 48;
    const r = 22 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return tex(c);
}

/** Kaca patri lancet: panel berwarna dengan garis timah, juga dipakai sebagai peta cahaya. */
export function stainedGlassTexture() {
  const [c, ctx] = surface(128, 512);
  const palette = ['#e9a23b', '#d9534f', '#4a76c9', '#e7c65c', '#8a5fc0', '#58a6a1', '#f0d9a0'];
  const rows = 10;
  const cols = 3;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      ctx.fillStyle = palette[(r * 3 + k * 5 + (r % 2)) % palette.length];
      ctx.fillRect((k * 128) / cols, (r * 512) / rows, 128 / cols + 1, 512 / rows + 1);
    }
  }
  const g = ctx.createRadialGradient(64, 256, 10, 64, 256, 300);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 512);
  ctx.strokeStyle = 'rgba(40,28,16,0.9)';
  ctx.lineWidth = 3;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, (r * 512) / rows);
    ctx.lineTo(128, (r * 512) / rows);
    ctx.stroke();
  }
  for (let k = 0; k <= cols; k++) {
    ctx.beginPath();
    ctx.moveTo((k * 128) / cols, 0);
    ctx.lineTo((k * 128) / cols, 512);
    ctx.stroke();
  }
  return tex(c);
}

/** Jendela mawar bulat di gable katedral. */
export function roseWindowTexture() {
  const [c, ctx] = surface(512);
  ctx.fillStyle = '#1c2250';
  ctx.fillRect(0, 0, 512, 512);
  const colors = ['#e9a23b', '#d9534f', '#4a76c9', '#f0d9a0', '#8a5fc0'];
  for (let ring = 4; ring >= 1; ring--) {
    const petals = ring * 4 + 4;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const rr = ring * 52;
      ctx.fillStyle = colors[(i + ring) % colors.length];
      ctx.beginPath();
      ctx.ellipse(256 + Math.cos(a) * rr * 0.62, 256 + Math.sin(a) * rr * 0.62, 26 + ring * 3, 12 + ring * 2, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(256, 256, 30, 0, Math.PI * 2);
  ctx.fill();
  return tex(c);
}

/** Lambang inisial di lantai pelaminan: cincin emas berlapis dan monogram. */
export function inlayTexture(mono = 'N&A') {
  const [c, ctx] = surface(1024);
  const g = ctx.createRadialGradient(512, 512, 40, 512, 512, 512);
  g.addColorStop(0, '#f6efe0');
  g.addColorStop(1, '#e0d3b4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(512, 512, 508, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9a24a';
  for (const [r, w] of [[496, 14], [452, 4], [330, 8], [318, 3]]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(512, 512, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#c9a24a';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.save();
    ctx.translate(512 + Math.cos(a) * 392, 512 + Math.sin(a) * 392);
    ctx.rotate(a + Math.PI / 4);
    ctx.fillRect(-14, -14, 28, 28);
    ctx.restore();
  }
  ctx.fillStyle = '#b18732';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 700 250px Georgia, "Times New Roman", serif';
  ctx.fillText(mono, 512, 520);
  return tex(c);
}

/** Cahaya hangat di belakang pelaminan: sinar menyebar dari tengah. */
export function altarGlowTexture() {
  const [c, ctx] = surface(512);
  const g = ctx.createRadialGradient(256, 300, 10, 256, 300, 300);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.5, 'rgba(255,214,150,0.85)');
  g.addColorStop(1, 'rgba(210,150,90,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 6;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(256, 300);
    ctx.lineTo(256 + Math.cos(a) * 400, 300 + Math.sin(a) * 400);
    ctx.stroke();
  }
  return tex(c);
}

/** Label teks melayang (sprite) untuk portal dan titik interaktif. */
export function labelSprite(text, { color = '#ffe9a8', width = 6 } = {}) {
  const [c, ctx] = surface(512, 128);
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(500, ctx.measureText(text).width + 56);
  ctx.fillStyle = 'rgba(14,16,40,0.62)';
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 28, w, 72, 36);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,224,150,0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 66);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(width, width / 4, 1);
  return sprite;
}
