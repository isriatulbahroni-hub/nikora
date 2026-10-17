// Halaman uji satu avatar bicara. Jalankan: npm run dev di folder game, lalu buka /talking-test.html
// (belum terdaftar di vite.config.js, jadi tidak ikut build produksi sampai aset disematkan dan diuji).
import * as THREE from 'three';
import { createTalkingAvatar } from './avatar-talking.js';

const $ = (id) => document.getElementById(id);
const setStatus = (text) => { $('status').textContent = text; };

const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1b22);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2));
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(1, 2, 2);
scene.add(key);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 1.6, 1.3);
camera.lookAt(0, 1.55, 0);

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

let avatar = null;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  avatar?.update(clock.getDelta() * 1000);
  renderer.render(scene, camera);
});

try {
  avatar = await createTalkingAvatar({
    scene,
    camera,
    onProgress: (e) => { if (e?.lengthComputable) setStatus(`Memuat avatar… ${Math.round((e.loaded / e.total) * 100)}%`); },
  });
  setStatus('Siap. Aktifkan mikrofon lalu bicara: mulut avatar mengikuti suaramu.');
  for (const b of document.querySelectorAll('button')) b.disabled = false;
} catch (err) {
  console.error(err);
  setStatus(`Gagal memuat avatar: ${err.message}. Sudah menjalankan workflow "Siapkan aset avatar"?`);
}

$('happy').onclick = () => avatar.setMood('happy');
$('neutral').onclick = () => avatar.setMood('neutral');
$('sad').onclick = () => avatar.setMood('sad');
$('wave').onclick = () => avatar.gesture('handup', 3);
$('look').onclick = () => avatar.lookAtCamera(2000);
$('mic').onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    await avatar.listen(stream);
    $('mic').disabled = true;
    setStatus('Mikrofon aktif. Bicaralah, mulut avatar mengikuti suara.');
  } catch (err) {
    setStatus(`Mikrofon tidak bisa dipakai: ${err.message}`);
  }
};
