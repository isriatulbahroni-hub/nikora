import * as THREE from 'three';

// Efek partikel Istana Cinta (satu kolam partikel aditif): berkat kelopak + percikan emas, kembang api berbentuk
// bola/hati/willow/crackle, konfeti bersulang, dan pita kristal yang bergerak mengikuti musik.
const N = 5000;
const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FRAG = `
varying float vA; varying vec3 vC;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vC * (1.0 + a), a * vA); }`;

const rnd = (a, b) => a + Math.random() * (b - a);
const c = new THREE.Color();
const PETALS = ['#ffd1dc', '#ffb7c9', '#ffffff', '#ffc2d6'];
const GOLDS = ['#ffd978', '#ffe9a8', '#ffc247'];
const CONFETTI = ['#ff5d7a', '#ffd24a', '#59d8ff', '#7dff9c', '#b77bff', '#ffffff'];

export function createFx({ scene, camera, renderer }) {
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const maxLife = new Float32Array(N);
  const grav = new Float32Array(N);
  const drag = new Float32Array(N);
  const twinkle = new Float32Array(N);
  let head = 0;
  let alive = 0;

  const geometry = new THREE.BufferGeometry();
  const attr = (array, n, name) => {
    const a = new THREE.BufferAttribute(array, n);
    a.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, a);
    return a;
  };
  const aPos = attr(pos, 3, 'position');
  const aCol = attr(col, 3, 'aColor');
  const aSize = attr(size, 1, 'aSize');
  const aAlpha = attr(alpha, 1, 'aAlpha');
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uniforms = { uScale: { value: 600 } };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  function spawn(x, y, z, vx, vy, vz, color, sz, ttl, g = 9.8, d = 0, tw = 0) {
    const i = head;
    head = (head + 1) % N;
    c.set(color);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = sz; life[i] = maxLife[i] = ttl; grav[i] = g; drag[i] = d; twinkle[i] = tw;
    alive++;
  }

  const timers = [];
  const rockets = [];
  const after = (delay, fn) => timers.push({ t: delay, fn });

  function burst(x, y, z, count, make) {
    for (let i = 0; i < count; i++) make(i, count);
  }
  const sphereDir = () => {
    const u = rnd(-1, 1);
    const a = rnd(0, Math.PI * 2);
    const r = Math.sqrt(1 - u * u);
    return [r * Math.cos(a), u, r * Math.sin(a)];
  };

  function explode(x, y, z, mood) {
    const colors = mood.colors;
    const pick = () => colors[(Math.random() * colors.length) | 0];
    spawn(x, y, z, 0, 0, 0, '#ffffff', 9, 0.28, 0, 0);
    if (mood.shape === 'heart') {
      const toCam = new THREE.Vector3(camera.position.x - x, 0, camera.position.z - z);
      if (toCam.lengthSq() < 1e-3) toCam.set(0, 0, 1);
      const right = new THREE.Vector3(0, 1, 0).cross(toCam.normalize()).normalize();
      burst(x, y, z, 150, (i, n) => {
        const t = (i / n) * Math.PI * 2;
        const hx = 16 * Math.sin(t) ** 3;
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        spawn(x, y, z, right.x * hx * 0.62, hy * 0.62, right.z * hx * 0.62, pick(), rnd(0.5, 0.75), rnd(2.0, 2.6), 1.6, 1.5, 0.4);
      });
    } else if (mood.shape === 'willow') {
      burst(x, y, z, 140, () => {
        const [dx, dy, dz] = sphereDir();
        const s = rnd(6, 13);
        spawn(x, y, z, dx * s, dy * s, dz * s, pick(), rnd(0.35, 0.6), rnd(3.2, 4.2), 4.5, 0.9, 0.6);
      });
    } else {
      burst(x, y, z, mood.shape === 'crackle' ? 100 : 160, () => {
        const [dx, dy, dz] = sphereDir();
        const s = rnd(11, 17);
        spawn(x, y, z, dx * s, dy * s, dz * s, pick(), rnd(0.4, 0.7), rnd(1.6, 2.3), 3, 1.2, 0.3);
      });
      if (mood.shape === 'crackle') {
        for (let k = 0; k < 12; k++) {
          after(rnd(0.6, 1.5), () => {
            const ox = x + rnd(-8, 8);
            const oy = y + rnd(-6, 6);
            const oz = z + rnd(-8, 8);
            burst(ox, oy, oz, 10, () => {
              const [dx, dy, dz] = sphereDir();
              spawn(ox, oy, oz, dx * 4, dy * 4, dz * 4, '#fff1c1', 0.35, 0.55, 2, 1, 1);
            });
          });
        }
      }
    }
  }

  uniforms.uScale.value = 600;
  return {
    points,
    /** Roket naik dari (x, y, z) lalu meledak; mood = hasil classifyMood. */
    firework({ x, y, z, mood, height = rnd(34, 48) }) {
      rockets.push({ x, y0: y, z, h: height, age: 0, dur: 1.3 + Math.random() * 0.3, mood });
    },
    /** Berkat di pelaminan: kelopak sakura melayang + percikan emas di sekitar (x, y, z). */
    blessing(x, y, z) {
      for (let i = 0; i < 110; i++) {
        const a = rnd(0, Math.PI * 2);
        const r = rnd(0.5, 2.4);
        spawn(x + Math.cos(a) * r, y + rnd(0.1, 0.6), z + Math.sin(a) * r, Math.cos(a + 1.2) * rnd(0.3, 1.2), rnd(1.6, 3.4), Math.sin(a + 1.2) * rnd(0.3, 1.2),
          PETALS[(Math.random() * PETALS.length) | 0], rnd(0.2, 0.34), rnd(3, 4.6), 1.1, 0.5, 0);
      }
      for (let i = 0; i < 90; i++) {
        const [dx, dy, dz] = sphereDir();
        const s = rnd(1.8, 5);
        spawn(x, y + 1.2, z, dx * s, Math.abs(dy) * s + 1, dz * s, GOLDS[(Math.random() * GOLDS.length) | 0], rnd(0.1, 0.18), rnd(1.6, 2.6), 2.2, 0.8, 0.9);
      }
    },
    /** Konfeti mini di atas meja saat bersulang. */
    toast(x, y, z) {
      for (let i = 0; i < 70; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.6, 2.2);
        spawn(x, y + 0.9, z, Math.cos(a) * s, rnd(3, 6), Math.sin(a) * s, CONFETTI[(Math.random() * CONFETTI.length) | 0], rnd(0.12, 0.2), rnd(1.4, 2.2), 7, 0.3, 0.5);
      }
    },
    update(dt, t) {
      uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn();
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.age += dt;
        const s = Math.min(1, r.age / r.dur);
        const y = r.y0 + r.h * (1 - (1 - s) * (1 - s));
        for (let k = 0; k < 2; k++) spawn(r.x + rnd(-0.1, 0.1), y, r.z + rnd(-0.1, 0.1), rnd(-0.4, 0.4), rnd(-1.5, -0.5), rnd(-0.4, 0.4), '#ffb35c', rnd(0.3, 0.5), 0.55, 2, 0.5, 0.5);
        if (s >= 1) {
          rockets.splice(i, 1);
          explode(r.x, y, r.z, r.mood);
        }
      }
      if (alive <= 0) return;
      let live = 0;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0;
          continue;
        }
        life[i] -= dt;
        if (life[i] <= 0) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        live++;
        const k = Math.exp(-drag[i] * dt);
        vel[i * 3] *= k;
        vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt;
        vel[i * 3 + 2] *= k;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const a = life[i] / maxLife[i];
        const fade = a < 0.35 ? a / 0.35 : 1;
        alpha[i] = fade * (twinkle[i] ? 1 - twinkle[i] * 0.5 + twinkle[i] * 0.5 * Math.sin(t * 34 + i) : 1);
      }
      alive = live;
      aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
    },
  };
}

/**
 * Pita kristal yang meliuk di sekeliling panggung, bergerak mengikuti spektrum audio (Web Audio AnalyserNode).
 * bins = Uint8Array frekuensi (0..255) atau null.
 */
export function createRibbons(scene, center) {
  const R = 3;
  const S = 48;
  const verts = R * (S + 1) * 2;
  const positions = new Float32Array(verts * 3);
  const colors = new Float32Array(verts * 4);
  const indices = [];
  for (let r = 0; r < R; r++) {
    for (let i = 0; i < S; i++) {
      const a = (r * (S + 1) + i) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(positions, 3);
  const aCol = new THREE.BufferAttribute(colors, 4);
  aPos.setUsage(THREE.DynamicDrawUsage);
  aCol.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', aPos);
  geometry.setAttribute('color', aCol);
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(center.x, center.y + 3, center.z), 12);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false,
  }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  const tmp = new THREE.Color();
  return {
    mesh,
    update(bins, level, t) {
      mesh.visible = level > 0.01;
      if (!mesh.visible) return;
      for (let r = 0; r < R; r++) {
        for (let i = 0; i <= S; i++) {
          const u = i / S;
          const bin = bins ? bins[Math.min(bins.length - 1, Math.floor(u * bins.length * 0.7))] / 255 : 0;
          const ang = u * Math.PI * 3 + r * 2.094 + t * 0.5;
          const rad = 1.6 + u * 2.8 + bin * 1.4;
          const y = center.y + 0.6 + u * 5.5 + Math.sin(u * 9 + t * 2 + r) * 0.35 * (0.3 + level);
          const half = 0.07 + 0.28 * bin;
          const px = center.x + Math.cos(ang) * rad;
          const pz = center.z + Math.sin(ang) * rad;
          const v = (r * (S + 1) + i) * 2;
          positions.set([px, y - half, pz, px, y + half, pz], v * 3);
          tmp.setHSL((0.52 + 0.3 * u + r * 0.05) % 1, 0.8, 0.65);
          const a = (0.15 + 0.7 * (1 - u * 0.4)) * (0.3 + level);
          colors.set([tmp.r, tmp.g, tmp.b, a, tmp.r, tmp.g, tmp.b, a], v * 4);
        }
      }
      aPos.needsUpdate = true;
      aCol.needsUpdate = true;
    },
  };
}
