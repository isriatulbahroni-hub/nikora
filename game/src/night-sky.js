import * as THREE from 'three';

// Bintang dan bulan sederhana untuk langit malam, dipakai Villa dan Masjid. Seluruhnya satu draw call bintang + satu bola bulan.
// Titik-titik berada di belahan langit atas pada jarak `radius`; tanah dan bangunan menutupinya lewat depth test.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createNightDecor({ radius = 400, stars = 600, moonRadius = 14, seed = 1 } = {}) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const positions = new Float32Array(stars * 3);
  for (let i = 0; i < stars; i++) {
    const y = 0.05 + rand() * 0.95; // sebaran seragam pada bola: tinggi acak seragam, sudut acak
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(a) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(a) * r * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  points.frustumCulled = false;

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(moonRadius, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xeef3ff, transparent: true, opacity: 0, depthWrite: false, fog: false }),
  );
  moon.frustumCulled = false;

  const group = new THREE.Group();
  group.add(points, moon);
  group.visible = false;

  return {
    group,
    /** Memusatkan langit pada pemain supaya bintang dan bulan tidak pernah terkejar. */
    follow(x, z) {
      group.position.set(x, 0, z);
    },
    /** k = 0..1 tingkat malam; moonDir = arah bulan (vektor satuan). */
    setNight(k, moonDir) {
      const level = clamp(k, 0, 1);
      group.visible = level > 0.01;
      points.material.opacity = level * 0.9;
      moon.material.opacity = level;
      if (moonDir) moon.position.copy(moonDir).multiplyScalar(radius * 0.93);
    },
  };
}
