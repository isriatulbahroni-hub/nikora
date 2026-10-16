// Tampilan TV di dinding tiap ruangan. Dua InstancedMesh (bingkai dan layar) supaya puluhan TV hanya menambah 2 draw call.
// Layar gelap bila tidak dipakai, menyala biru bagi TV yang sedang kamu tonton.
import * as THREE from 'three';

export function createTvView({ scene, tvs }) {
  const n = tvs.length;
  if (!n) return { setActive() {}, dispose() {} };
  const frameGeo = new THREE.BoxGeometry(1.5, 0.9, 0.06);
  const screenGeo = new THREE.PlaneGeometry(1.4, 0.8);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.5, metalness: 0.3 });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const frames = new THREE.InstancedMesh(frameGeo, frameMat, n);
  const screens = new THREE.InstancedMesh(screenGeo, screenMat, n);
  frames.frustumCulled = false; // bounding bola instance hanya di titik asal: tanpa ini TV hilang saat asalnya keluar layar
  screens.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const idle = new THREE.Color(0x0b0d12);
  const live = new THREE.Color(0x8ec5ff);
  tvs.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.updateMatrix();
    frames.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x + t.nx * 0.034, t.y, t.z + t.nz * 0.034);
    dummy.updateMatrix();
    screens.setMatrixAt(i, dummy.matrix);
    screens.setColorAt(i, idle);
  });
  frames.instanceMatrix.needsUpdate = true;
  screens.instanceMatrix.needsUpdate = true;
  screens.instanceColor.needsUpdate = true;
  scene.add(frames, screens);
  return {
    setActive(id) {
      tvs.forEach((t, i) => screens.setColorAt(i, t.id === id ? live : idle));
      screens.instanceColor.needsUpdate = true;
    },
    dispose() {
      scene.remove(frames, screens);
      frames.dispose();
      screens.dispose();
      frameGeo.dispose();
      screenGeo.dispose();
      frameMat.dispose();
      screenMat.dispose();
    },
  };
}
