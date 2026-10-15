// Tubuh manusia lengkap untuk avatar "Sederhana": kepala (mata, alis, hidung, mulut, telinga), leher,
// badan, panggul, dua lengan (bahu-siku-tangan), dua kaki (paha-lutut-betis-sepatu). Depan = -z.
// Kepala tetap bola r=0.3 di y=1.37 agar rambut/aksesori di buildGear() tidak perlu diubah.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
export const PANTS_SHADE = 0.55;

function mesh(geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, name = '') {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

function buildArm(side, outfit, skin) {
  const sx = side === 'l' ? -0.275 : 0.275;
  const shoulder = new THREE.Group(); // pivot bahu: rotation.x/z dipakai applyPose
  shoulder.position.set(sx, 1.02, 0);
  shoulder.add(
    mesh(new THREE.SphereGeometry(0.085, 12, 10), outfit, 0, 0, 0, 1, 1, 1, 'shoulder'),
    mesh(new THREE.CapsuleGeometry(0.065, 0.17, 4, 10), outfit, 0, -0.135, 0, 1, 1, 1, 'upperArm'),
  );
  const elbow = new THREE.Group();
  elbow.position.y = -0.27;
  elbow.rotation.x = 0.15; // siku sedikit menekuk ke depan
  elbow.add(
    mesh(new THREE.CapsuleGeometry(0.055, 0.15, 4, 10), skin, 0, -0.125, 0, 1, 1, 1, 'forearm'),
    mesh(new THREE.SphereGeometry(0.07, 12, 10), skin, 0, -0.27, 0, 1, 1, 1, 'hand'),
  );
  shoulder.add(elbow);
  return { shoulder, elbow };
}

function buildLeg(side, pants, skin, shoe) {
  const sx = side === 'l' ? -0.115 : 0.115;
  const hip = new THREE.Group(); // pivot pinggul
  hip.position.set(sx, 0.52, 0);
  hip.add(mesh(new THREE.CapsuleGeometry(0.085, 0.12, 4, 10), pants, 0, -0.13, 0, 1, 1, 1, 'thigh'));
  const knee = new THREE.Group();
  knee.position.y = -0.26;
  knee.add(
    mesh(new THREE.CapsuleGeometry(0.065, 0.1, 4, 10), pants, 0, -0.115, 0, 1, 1, 1, 'shin'),
    mesh(new THREE.BoxGeometry(0.12, 0.07, 0.26), shoe, 0, -0.235, -0.05, 1, 1, 1, 'foot'),
  );
  hip.add(knee);
  return { hip, knee };
}

/** Bangun seluruh tubuh. Mengembalikan root (Group) + rujukan untuk animasi dan pewarnaan. */
export function buildBody({ color, skin }) {
  const root = new THREE.Group();
  const outfit = mat(color, { roughness: 0.55 });
  const pants = mat(new THREE.Color(color).multiplyScalar(PANTS_SHADE), { roughness: 0.65 });
  const skinMat = mat(skin);
  const shoe = mat(0x23202a, { roughness: 0.5 });

  const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.34, 5, 14), outfit, 0, 0.8, 0, 1.05, 1, 0.8, 'torso');
  const pelvis = mesh(new THREE.SphereGeometry(0.2, 16, 12), pants, 0, 0.5, 0, 1.05, 0.7, 0.85, 'pelvis');
  const neck = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 12), skinMat, 0, 1.13, 0);
  const head = mesh(new THREE.SphereGeometry(0.3, 20, 16), skinMat, 0, 1.37, 0);
  root.add(torso, pelvis, neck, head);

  // Wajah: posisi dihitung agar menonjol sedikit dari cangkang rambut (r=0.325 di buildGear).
  const face = new THREE.Group(); // mata, alis, hidung, mulut (disembunyikan saat foto wajah dipakai)
  root.add(face);
  const white = mat(0xffffff, { roughness: 0.3 });
  const iris = mat(0x1b1620, { roughness: 0.3 });
  const brow = mat(0x2a1f1a);
  for (const s of [-1, 1]) {
    const x = s * 0.105;
    face.add(
      mesh(new THREE.SphereGeometry(0.05, 14, 12), white, x, 1.36, -0.285, 1, 1.15, 0.45),
      mesh(new THREE.SphereGeometry(0.028, 12, 10), iris, x, 1.36, -0.304, 1, 1, 0.5),
      mesh(new THREE.SphereGeometry(0.008, 8, 6), white, x + 0.01, 1.372, -0.318),
    );
    const b = mesh(new THREE.BoxGeometry(0.085, 0.014, 0.02), brow, x, 1.435, -0.292);
    b.rotation.z = -s * 0.12;
    face.add(b);
    root.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat, s * 0.295, 1.3, 0, 0.5, 1, 0.8)); // telinga
  }
  face.add(
    mesh(new THREE.SphereGeometry(0.034, 10, 8), skinMat, 0, 1.305, -0.298, 1, 1, 0.9), // hidung
    mesh(new THREE.BoxGeometry(0.09, 0.016, 0.02), mat(0x8a3b3b), 0, 1.225, -0.268), // mulut
  );

  const arms = {};
  const elbows = {};
  for (const side of ['l', 'r']) {
    const a = buildArm(side, outfit, skinMat);
    arms[side] = a.shoulder;
    elbows[side] = a.elbow;
    root.add(a.shoulder);
  }
  const legs = {};
  for (const side of ['l', 'r']) {
    legs[side] = buildLeg(side, pants, skinMat, shoe);
    root.add(legs[side].hip);
  }
  return { root, face, torso, arms, elbows, legs, tint: [outfit], skin: skinMat, pants };
}
