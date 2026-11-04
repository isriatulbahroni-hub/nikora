// Efek air untuk perenang (THREE): percikan saat terjun dan riak cincin yang melebar di permukaan. Ringan: satu Points (80 tetes) dan 10 cincin
// yang dipakai bergiliran, tanpa alokasi per frame. Dipakai pemain sendiri dan pemain lain yang berenang (hotel-main.js).
import * as THREE from 'three';

const DROPS = 80;
const RINGS = 10;
const GRAVITY = 9.8;

export function createSwimFx(scene) {
  const root = new THREE.Group();
  root.name = 'swim-fx';
  scene.add(root);

  // tetes percikan
  const dropGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(DROPS * 3);
  const vel = new Float32Array(DROPS * 3);
  const life = new Float32Array(DROPS); // sisa umur (detik); 0 = tidak aktif
  const baseY = new Float32Array(DROPS);
  for (let i = 0; i < DROPS; i++) pos[i * 3 + 1] = -1000;
  dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dropMat = new THREE.PointsMaterial({ color: 0xeaf8ff, size: 0.1, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  root.add(drops);
  let nextDrop = 0;

  // cincin riak
  const ringGeo = new THREE.RingGeometry(0.22, 0.3, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < RINGS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.visible = false;
    root.add(mesh);
    rings.push({ mesh, age: 0, life: 1, grow: 4 });
  }
  let nextRing = 0;

  function ripple(x, y, z, size = 1) {
    const r = rings[nextRing];
    nextRing = (nextRing + 1) % RINGS;
    r.age = 0;
    r.life = 1.1;
    r.grow = 3.2 * size;
    r.mesh.position.set(x, y + 0.015, z);
    r.mesh.scale.setScalar(0.5);
    r.mesh.material.opacity = 0.55;
    r.mesh.visible = true;
  }

  /** Percikan di (x, y = permukaan air, z). strength 0..1 menentukan jumlah dan tinggi lontaran; ikut memunculkan dua riak. */
  function splash(x, y, z, strength = 0.6) {
    const n = Math.round(12 + strength * 48);
    for (let k = 0; k < n; k++) {
      const i = nextDrop;
      nextDrop = (nextDrop + 1) % DROPS;
      const a = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random() * 1.6) * (0.5 + strength);
      pos[i * 3] = x + Math.cos(a) * 0.15;
      pos[i * 3 + 1] = y + 0.05;
      pos[i * 3 + 2] = z + Math.sin(a) * 0.15;
      vel[i * 3] = Math.cos(a) * out;
      vel[i * 3 + 1] = 1.6 + Math.random() * 2.6 * (0.4 + strength);
      vel[i * 3 + 2] = Math.sin(a) * out;
      life[i] = 0.9 + Math.random() * 0.5;
      baseY[i] = y;
    }
    ripple(x, y, z, 1 + strength);
    ripple(x, y, z, 0.7 + strength * 0.6);
  }

  function update(delta) {
    const dt = Math.min(0.1, Math.max(0, delta));
    for (let i = 0; i < DROPS; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i * 3 + 1] -= GRAVITY * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0 || pos[i * 3 + 1] < baseY[i]) {
        life[i] = 0;
        pos[i * 3 + 1] = -1000; // jatuh kembali ke air: hilang
      }
    }
    dropGeo.attributes.position.needsUpdate = true;
    for (const r of rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.5 + r.grow * k);
      r.mesh.material.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }

  function dispose() {
    scene.remove(root);
    dropGeo.dispose();
    dropMat.dispose();
    ringGeo.dispose();
    for (const r of rings) r.mesh.material.dispose();
  }

  return { splash, ripple, update, dispose, root };
}
