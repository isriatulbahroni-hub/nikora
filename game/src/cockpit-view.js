// Tampilan 3D kokpit (THREE): roda setir yang berputar, tangan di setir, jam spidometer/RPM, tiga spion hidup (spion tengah dan dua samping).
// Roda setir dipasang di semua mobil mewah (terlihat berputar dari luar juga); tangan, jam, dan spion hanya dibuat untuk mobil yang dikemudikan
// dalam mode kabin. Spion = render ulang adegan ke tekstur kecil, satu spion per frame bergiliran (hemat HP); mati di kualitas rendah.
// Tekstur tiap spion berrasio sama dengan kacanya dan kamera spion memakai rasio itu juga (dulu semua 2:1 sehingga gambar melar/gepeng dan buram).
import * as THREE from 'three';
import { clusterState, cockpitSpec, dialAngle, handPositions, localToWorld, wheelAngle } from './cockpit.js';

const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_Y = new THREE.Vector3(0, 1, 0);
const MIRROR_RT_H = 160; // tinggi tekstur spion (px); lebarnya mengikuti rasio kaca spion
const SKIN = 0xc68a63;

/** Roda setir: lingkar kulit + tiga jari-jari + hub; `spin.rotation.z` = putaran setir (wheelAngle). Dipasang miring seperti kolom setir. */
export function buildSteeringWheel(spec) {
  const w = spec.wheel;
  const pivot = new THREE.Group();
  pivot.position.set(w.x, w.y, w.z);
  pivot.rotation.x = w.tilt;
  const spin = new THREE.Group();
  pivot.add(spin);
  const leather = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.35, metalness: 0.8 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(w.r, 0.021, 10, 32), leather);
  const barA = new THREE.Mesh(new THREE.BoxGeometry(w.r * 1.9, 0.024, 0.012), metal);
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.024, w.r * 0.95, 0.012), metal);
  barB.position.y = -w.r * 0.48;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.03, 16), leather);
  hub.rotation.x = Math.PI / 2;
  spin.add(rim, barA, barB, hub);
  return { pivot, spin, dispose() { for (const m of [rim, barA, barB, hub]) m.geometry.dispose(); leather.dispose(); metal.dispose(); } };
}

/** Gambar jam: takometer (kiri), speedometer (kanan), km/j digital dan gigi di tengah. */
export function drawCluster(g, st) {
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = '#06080b';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#2a2f38';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 252, 124);
  const dial = (cx, cy, r, frac, ticks, color, redFrom = 2) => {
    g.lineWidth = 2;
    for (let i = 0; i <= ticks; i++) {
      const a = dialAngle(i / ticks);
      const long = i % 2 === 0;
      g.strokeStyle = i / ticks >= redFrom ? '#e0412f' : '#cfd6df';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - (long ? 9 : 5)), cy + Math.sin(a) * (r - (long ? 9 : 5)));
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.stroke();
    }
    g.strokeStyle = '#3a4150';
    g.beginPath();
    g.arc(cx, cy, r + 2, dialAngle(0), dialAngle(1));
    g.stroke();
    const a = dialAngle(frac);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6);
    g.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    g.stroke();
    g.fillStyle = '#e8edf3';
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();
  };
  dial(60, 68, 48, st.rpmFrac, 10, '#ff8a3d', 0.85);
  dial(196, 68, 48, Math.min(1, st.kmh / Math.max(1, st.maxKmh)), 10, '#5ad2ff');
  g.fillStyle = '#e8edf3';
  g.textAlign = 'center';
  g.font = '700 34px system-ui, sans-serif';
  g.fillText(String(st.kmh), 128, 78);
  g.font = '600 11px system-ui, sans-serif';
  g.fillStyle = '#8b95a5';
  g.fillText('KM/J', 128, 92);
  g.fillStyle = '#ffb347';
  g.font = '700 20px system-ui, sans-serif';
  g.fillText(String(st.gear), 128, 40);
  g.fillStyle = '#8b95a5';
  g.font = '600 10px system-ui, sans-serif';
  g.fillText('x1000', 60, 118);
}

const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
/** Orientasi bidang yang sisi depannya (+z) menghadap mata pengemudi, dengan "atas" tetap ke atas (teks tidak terbalik). */
const facing = (pos, eye) => {
  _m.lookAt(new THREE.Vector3(eye.x, eye.y, eye.z), new THREE.Vector3(pos.x, pos.y, pos.z), _up);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
};

/**
 * Rig kokpit satu mobil. entry = { tilt, car }. opts.mirrors = false mematikan spion (kualitas rendah: kaca gelap).
 * Mengembalikan { group, update(info), renderMirrors(renderer, scene), setActive(on), dispose() }.
 */
export function createCockpitRig(entry, { mirrors = true } = {}) {
  const car = entry.car;
  const spec = cockpitSpec(car.spec);
  const group = new THREE.Group();
  group.name = 'kokpit';
  group.visible = false;
  entry.tilt.add(group);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // tangan dan lengan: lengan dari siku (tetap di bawah mata) ke tangan di setir, ikut berputar bersama setir
  const skin = keep(new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }));
  const sleeve = keep(new THREE.MeshStandardMaterial({ color: 0x1d2330, roughness: 0.85 }));
  const armGeo = keep(new THREE.CapsuleGeometry(0.034, 1, 4, 8));
  const sleeveGeo = keep(new THREE.CapsuleGeometry(0.042, 1, 4, 8));
  const palmGeo = keep(new THREE.SphereGeometry(0.046, 12, 10));
  const hands = ['left', 'right'].map((side) => {
    const palm = new THREE.Mesh(palmGeo, skin);
    palm.scale.set(1, 0.55, 1.25);
    const thumb = new THREE.Mesh(palmGeo, skin);
    thumb.scale.set(0.4, 0.4, 0.8);
    thumb.position.set(side === 'left' ? -0.04 : 0.04, 0.02, 0.03);
    palm.add(thumb);
    const arm = new THREE.Mesh(armGeo, skin);
    const sl = new THREE.Mesh(sleeveGeo, sleeve);
    group.add(palm, arm, sl);
    return { side, palm, arm, sl, elbow: spec.elbows[side] };
  });
  const v = new THREE.Vector3();
  const e = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const el = new THREE.Vector3();
  const s0 = new THREE.Vector3();
  const s1 = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const place = (mesh, a, b, from, to) => { // kapsul panjang 1 dari titik a ke b, dipotong ke bagian [from,to]
    const len = a.distanceTo(b);
    s0.copy(a).lerp(b, from);
    s1.copy(a).lerp(b, to);
    mid.copy(s0).lerp(s1, 0.5);
    mesh.position.copy(mid);
    mesh.scale.set(1, Math.max(0.01, len * (to - from) - 0.08), 1);
    mesh.quaternion.setFromUnitVectors(AX_Y, dir.copy(b).sub(a).normalize());
  };

  // jam di atas dasbor
  let clusterTex = null;
  let clusterCtx = null;
  const cl = spec.cluster;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    clusterCtx = canvas.getContext('2d');
    if (clusterCtx) {
      clusterTex = keep(new THREE.CanvasTexture(canvas));
      clusterTex.colorSpace = THREE.SRGBColorSpace;
    }
  }
  const clusterMat = keep(new THREE.MeshBasicMaterial({ map: clusterTex, color: clusterTex ? 0xffffff : 0x0a0c10 }));
  const clusterMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(cl.w, cl.h)), clusterMat);
  clusterMesh.position.set(cl.x, cl.y, cl.z);
  clusterMesh.quaternion.copy(facing(cl, spec.eye));
  group.add(clusterMesh);

  // spion: tengah dan dua samping. fov = sudut pandang VERTIKAL; spion tengah lebar (3:1) jadi sudut vertikalnya kecil agar gambar tidak melar.
  const mirrorDefs = [
    { cfg: spec.mirror, cam: { x: 0, y: 1.25, z: -car.spec.length / 2 + 0.3, yaw: 0, fov: 26 } },
    ...spec.sides.map((s) => ({ cfg: s, cam: { x: s.side * (car.spec.width / 2 + 0.05), y: 1.0, z: spec.eye.z + 0.3, yaw: -s.side * 0.22, fov: 40 } })),
  ];
  const glassDark = keep(new THREE.MeshBasicMaterial({ color: 0x10141a }));
  const mirrorList = mirrorDefs.map(({ cfg, cam }) => {
    const rtW = Math.max(64, Math.round((MIRROR_RT_H * cfg.w) / cfg.h)); // rasio tekstur = rasio kaca spion
    const rt = mirrors ? keep(new THREE.WebGLRenderTarget(rtW, MIRROR_RT_H)) : null;
    const geo = keep(new THREE.PlaneGeometry(cfg.w, cfg.h));
    geo.scale(-1, 1, 1); // bayangan cermin: kiri-kanan terbalik
    const mat = rt ? keep(new THREE.MeshBasicMaterial({ map: rt.texture, side: THREE.DoubleSide })) : glassDark;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.quaternion.copy(facing(cfg, spec.eye));
    const frame = new THREE.Mesh(keep(new THREE.PlaneGeometry(cfg.w + 0.02, cfg.h + 0.02)), keep(new THREE.MeshBasicMaterial({ color: 0x0b0c0f, side: THREE.DoubleSide })));
    frame.position.copy(mesh.position);
    frame.quaternion.copy(mesh.quaternion);
    frame.translateZ(-0.004);
    group.add(frame, mesh);
    return { mesh, rt, cam, camera: new THREE.PerspectiveCamera(cam.fov, cfg.w / cfg.h, 0.4, 900) };
  });

  let frameNo = 0;
  let lastDraw = -1;
  let active = false;
  const lastKey = { kmh: -1, rpm: -1, gear: null };

  return {
    group,
    spec,
    mirrors: mirrorList,
    setActive(on) { active = on; group.visible = on; },
    get active() { return active; },
    /** info = { wheelRot (rad), hud (hudInfo), time (dtk) }. Menggerakkan tangan, lengan, dan jam. */
    update({ wheelRot, hud, time = 0 }) {
      if (!active) return;
      const hp = handPositions(spec.wheel.r, wheelRot);
      for (const h of hands) {
        const p = hp[h.side];
        v.set(p.x, p.y, 0.0).applyAxisAngle(AX_X, spec.wheel.tilt).add(e.set(spec.wheel.x, spec.wheel.y, spec.wheel.z));
        h.palm.position.copy(v);
        h.palm.rotation.set(spec.wheel.tilt, 0, wheelRot);
        el.set(h.elbow.x, h.elbow.y, h.elbow.z);
        place(h.arm, el, v, 0.5, 1);
        place(h.sl, el, v, 0, 0.62);
      }
      const st = clusterState(car, hud);
      if (clusterCtx && (st.kmh !== lastKey.kmh || Math.abs(st.rpmFrac * 1000 - lastKey.rpm) > 8 || st.gear !== lastKey.gear) && time - lastDraw > 0.08) {
        drawCluster(clusterCtx, st);
        clusterTex.needsUpdate = true;
        lastDraw = time;
        lastKey.kmh = st.kmh;
        lastKey.rpm = st.rpmFrac * 1000;
        lastKey.gear = st.gear;
      }
    },
    /** Render satu spion (bergiliran tiap frame) ke tekstur kecilnya. Dipanggil sebelum render utama. */
    renderMirrors(renderer, scene) {
      if (!active || !mirrors) return;
      const m = mirrorList[frameNo++ % mirrorList.length];
      const c = m.cam;
      const p = localToWorld(car, { x: c.x, y: c.y, z: c.z });
      const yaw = car.heading + Math.PI + c.yaw;
      m.camera.position.set(p.x, p.y, p.z);
      m.camera.lookAt(p.x + Math.sin(yaw) * 60, p.y - 0.6, p.z + Math.cos(yaw) * 60);
      const prevTarget = renderer.getRenderTarget();
      const prevShadow = renderer.shadowMap.autoUpdate;
      group.visible = false; // kokpit sendiri tidak ikut terlihat di cermin
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(m.rt);
      renderer.render(scene, m.camera);
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadow;
      group.visible = true;
    },
    dispose() {
      entry.tilt.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  };
}

export { wheelAngle };
