// Tampilan TV di dinding tiap ruangan. Dua InstancedMesh (bingkai dan layar) supaya puluhan TV hanya menambah 2 draw call.
// Layar gelap bila tidak dipakai. Video (.mp4 / berkas HP) diputar LANGSUNG di layar TV lewat VideoTexture;
// untuk YouTube/TikTok (iframe) screenQuad() memberi sudut layar di layar HP agar iframe ditempel pas di TV.
import * as THREE from 'three';
import { fitContain } from './room-tv-quad.js';
import { tvBridge } from './room-tv-bridge.js';

export function createTvView({ scene, tvs }) {
  const n = tvs.length;
  if (!n) return { setActive() {}, setVideo() {}, screenQuad: () => null, dispose() {} };
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

  // layar video: satu bidang di depan layar TV yang aktif (video hanya diputar di satu TV sekaligus)
  let tex = null;
  let liveMesh = null;
  const liveGeo = new THREE.PlaneGeometry(1, 1);
  const clearVideo = () => {
    if (liveMesh) {
      scene.remove(liveMesh);
      liveMesh.material.dispose();
      liveMesh = null;
    }
    tex?.dispose();
    tex = null;
  };
  const corner = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const size = new THREE.Vector2();
  const api = {
    setActive(id) {
      tvs.forEach((t, i) => screens.setColorAt(i, t.id === id ? live : idle));
      screens.instanceColor.needsUpdate = true;
      if (id == null) clearVideo();
    },
    /** Putar elemen <video> di layar TV `id` (null = lepas). */
    setVideo(id, video) {
      clearVideo();
      const t = id && video ? tvs.find((x) => x.id === id) : null;
      if (!t) return;
      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      liveMesh = new THREE.Mesh(liveGeo, mat);
      liveMesh.position.set(t.x + t.nx * 0.04, t.y, t.z + t.nz * 0.04);
      liveMesh.rotation.set(0, t.rot, 0);
      liveMesh.frustumCulled = false;
      const fit = () => {
        const { width, height } = fitContain(video.videoWidth / video.videoHeight);
        liveMesh?.scale.set(width, height, 1);
      };
      fit();
      video.addEventListener('loadedmetadata', fit);
      scene.add(liveMesh);
    },
    /**
     * Sudut layar TV `id` dalam piksel [kiriAtas, kananAtas, kananBawah, kiriBawah], atau null bila
     * tidak terlihat (di belakang kamera, membelakangi kamera, atau seluruhnya di luar layar).
     */
    screenQuad(id, camera, width, height) {
      const t = id ? tvs.find((x) => x.id === id) : null;
      if (!t) return null;
      tmp.set(camera.position.x - t.x, camera.position.y - t.y, camera.position.z - t.z);
      if (tmp.x * t.nx + tmp.z * t.nz <= 0.05) return null; // melihat punggung TV
      const rx = Math.cos(t.rot);
      const rz = -Math.sin(t.rot);
      const out = [];
      for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        corner.set(t.x + t.nx * 0.04 + rx * sx * 0.7, t.y + sy * 0.4, t.z + t.nz * 0.04 + rz * sx * 0.7);
        const view = corner.clone().applyMatrix4(camera.matrixWorldInverse);
        if (view.z > -camera.near - 0.05) return null; // sudut di belakang kamera
        corner.project(camera);
        out.push([(corner.x * 0.5 + 0.5) * width, (-corner.y * 0.5 + 0.5) * height]);
      }
      const xs = out.map((p) => p[0]);
      const ys = out.map((p) => p[1]);
      if (Math.max(...xs) < 0 || Math.min(...xs) > width || Math.max(...ys) < 0 || Math.min(...ys) > height) return null;
      return out;
    },
    dispose() {
      clearVideo();
      liveGeo.dispose();
      scene.remove(frames, screens);
      frames.dispose();
      screens.dispose();
      frameGeo.dispose();
      screenGeo.dispose();
      frameMat.dispose();
      screenMat.dispose();
    },
  };
  tvBridge.setVideo = api.setVideo;
  tvBridge.screenQuad = api.screenQuad;
  // tiap render utama: kamera + ukuran layar diteruskan ke UI (untuk menempelkan iframe YouTube/TikTok di layar TV)
  frames.onBeforeRender = (renderer, _scene, camera) => {
    if (!tvBridge.onFrame) return;
    renderer.getSize(size);
    tvBridge.onFrame(camera, size.x, size.y);
  };
  const dispose = api.dispose;
  api.dispose = () => {
    tvBridge.setVideo = () => {};
    tvBridge.screenQuad = () => null;
    dispose();
  };
  return api;
}
