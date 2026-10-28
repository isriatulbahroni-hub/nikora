import * as THREE from 'three';

// Bintang dan bulan untuk langit malam, dipakai Villa dan Masjid. Bintang = dua lapis titik (berkelip bergantian), bulan = satu bola
// bertekstur kawah dengan halo cahaya lembut. Titik-titik berada di belahan langit atas pada jarak `radius`;
// tanah dan bangunan menutupinya lewat depth test.
// Opsi untuk Hotel: `moon: false` tidak membuat bola bulan dan halonya (bulan digambar di kubah langit, lihat hotel-moon.js), dan
// `clearCone: { dir, angle }` tidak menaruh bintang dalam kerucut itu (terang bulan menelan bintang di dekatnya). Bawaan tidak berubah.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hasDom = () => typeof document !== 'undefined';

// Tekstur bulan purnama prosedural: dataran gelap (maria), kawah dengan tepi terang-bayangan, dan butiran halus.
function moonTexture(seed) {
  if (!hasDom()) return null;
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ece7d6';
  g.fillRect(0, 0, w, h);
  // dataran gelap lunak di sekitar wajah yang menghadap pemain (tengah gambar)
  for (let i = 0; i < 9; i++) {
    const x = w * (0.3 + rand() * 0.4);
    const y = h * (0.2 + rand() * 0.6);
    const r = 24 + rand() * 46;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(150,152,160,0.55)');
    grad.addColorStop(1, 'rgba(150,152,160,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // kawah
  for (let i = 0; i < 170; i++) {
    const x = w * (0.18 + rand() * 0.64);
    const y = h * (0.1 + rand() * 0.8);
    const r = 2 + rand() * rand() * 15;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(120,122,130,0.28)';
    g.fill();
    g.lineWidth = Math.max(1, r * 0.22);
    g.strokeStyle = 'rgba(255,255,250,0.55)';
    g.beginPath();
    g.arc(x - r * 0.12, y - r * 0.12, r, Math.PI * 0.9, Math.PI * 1.9);
    g.stroke();
    g.strokeStyle = 'rgba(90,92,100,0.4)';
    g.beginPath();
    g.arc(x + r * 0.12, y + r * 0.12, r, -Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }
  // butiran halus
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '110,112,120'},${0.04 + rand() * 0.06})`;
    g.fillRect(rand() * w, rand() * h, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.offset.x = 0.25; // sisi bola yang menghadap pusat dunia (+Z setelah lookAt) memakai tengah gambar
  return tex;
}

function haloTexture() {
  if (!hasDom()) return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,252,235,0.95)');
  grad.addColorStop(0.18, 'rgba(235,240,255,0.55)');
  grad.addColorStop(0.45, 'rgba(170,190,255,0.16)');
  grad.addColorStop(1, 'rgba(150,170,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNightDecor({ radius = 400, stars = 600, moonRadius = 14, seed = 1, moon: withMoon = true, clearCone = null } = {}) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let clear = null;
  if (clearCone) {
    const [cx, cy, cz] = clearCone.dir;
    const len = Math.hypot(cx, cy, cz) || 1;
    clear = { x: cx / len, y: cy / len, z: cz / len, cos: Math.cos(clearCone.angle) };
  }
  const makeStars = (count, size) => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let tries = 0; tries < 12; tries++) {
        const y = 0.05 + rand() * 0.95; // sebaran seragam pada bola: tinggi acak seragam, sudut acak
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - y * y);
        nx = Math.cos(a) * r;
        ny = y;
        nz = Math.sin(a) * r;
        if (!clear || nx * clear.x + ny * clear.y + nz * clear.z < clear.cos) break;
      }
      positions[i * 3] = nx * radius;
      positions[i * 3 + 1] = ny * radius;
      positions[i * 3 + 2] = nz * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xffffff, size, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    pts.frustumCulled = false;
    return pts;
  };
  const points = makeStars(stars, 2);
  const bright = makeStars(Math.max(12, Math.round(stars / 14)), 3.4); // bintang terang, berkelip bergantian dengan lapis pertama

  let moon = null;
  let halo = null;
  if (withMoon) {
    const tex = moonTexture(seed + 99);
    moon = new THREE.Mesh(
      new THREE.SphereGeometry(moonRadius, 40, 28),
      new THREE.MeshBasicMaterial({ color: tex ? 0xfffaf0 : 0xeef3ff, map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    moon.frustumCulled = false;

    const haloMap = haloTexture();
    halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloMap, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending,
    }));
    halo.scale.setScalar(moonRadius * 9);
    halo.frustumCulled = false;
    halo.visible = !!haloMap;
  }

  const group = new THREE.Group();
  group.add(points, bright);
  if (halo) group.add(halo);
  if (moon) group.add(moon);
  group.visible = false;
  let level = 0;

  return {
    group,
    /** Memusatkan langit pada pemain supaya bintang dan bulan tidak pernah terkejar. */
    follow(x, z) {
      group.position.set(x, 0, z);
    },
    /** k = 0..1 tingkat malam; moonDir = arah bulan (vektor satuan). */
    setNight(k, moonDir) {
      level = clamp(k, 0, 1);
      group.visible = level > 0.01;
      points.material.opacity = level * 0.9;
      bright.material.opacity = level;
      if (moon) moon.material.opacity = level;
      if (halo) halo.material.opacity = level * 0.7;
      if (moonDir && moon) {
        moon.position.copy(moonDir).multiplyScalar(radius * 0.93);
        moon.lookAt(0, 0, 0); // wajah bulan selalu menghadap pemain
        halo.position.copy(moonDir).multiplyScalar(radius * 0.94);
      }
    },
    /** Kelipan bintang halus; dipanggil tiap frame dengan waktu (detik). Tanpa panggilan ini bintang tetap tenang. */
    twinkle(t) {
      if (level <= 0.01) return;
      points.material.opacity = level * (0.78 + 0.14 * Math.sin(t * 1.3));
      bright.material.opacity = level * (0.55 + 0.45 * Math.sin(t * 2.1 + 1.7));
      if (halo) halo.material.opacity = level * (0.66 + 0.06 * Math.sin(t * 0.5));
    },
  };
}
