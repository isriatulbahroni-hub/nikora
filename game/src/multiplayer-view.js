import * as THREE from 'three';
import { NetClient } from './net-client.js';

const SMOOTHING = 12; // semakin besar, semakin cepat avatar mengejar posisi server
const SEND_INTERVAL_MS = 50;
const PALETTE = [0xf2a65a, 0x6ab8e8, 0xc77dff, 0xf25f5c, 0x70c1b3, 0xffe066];

/** Baca ?server=ws://host:port dari query string. Hanya ws:// atau wss://. */
export function resolveServerUrl(search) {
  const value = new URLSearchParams(search ?? '').get('server');
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function colorFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function makeLabel(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = 2.05;
  return sprite;
}

function shortestAngle(from, to) {
  const diff = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + diff;
}

/** Menampilkan pemain lain (bukan pemain lokal) di scene. */
export function createRemotePlayers(scene) {
  const avatars = new Map();

  function build(p) {
    const color = colorFor(p.id);
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.55, 5, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
    );
    body.position.y = 0.75;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), new THREE.MeshStandardMaterial({ color: 0xf1e3d3 }));
    head.position.y = 1.37;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), new THREE.MeshStandardMaterial({ color }));
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.83, -0.48);
    group.add(body, head, nose);
    const label = makeLabel(p.name);
    if (label) group.add(label);
    group.position.set(p.x, 0, p.z);
    group.rotation.y = p.rot;
    scene.add(group);
    return { group, target: { x: p.x, z: p.z, rot: p.rot } };
  }

  return {
    get count() {
      return avatars.size;
    },
    sync(players, selfId) {
      const seen = new Set();
      for (const p of players) {
        if (p.id === selfId) continue;
        seen.add(p.id);
        const existing = avatars.get(p.id);
        if (existing) existing.target = { x: p.x, z: p.z, rot: p.rot };
        else avatars.set(p.id, build(p));
      }
      for (const [id, avatar] of avatars) {
        if (seen.has(id)) continue;
        scene.remove(avatar.group);
        avatar.group.traverse((o) => {
          o.geometry?.dispose();
          o.material?.map?.dispose();
          o.material?.dispose();
        });
        avatars.delete(id);
      }
    },
    update(delta) {
      const k = 1 - Math.exp(-SMOOTHING * Math.max(0, delta));
      for (const { group, target } of avatars.values()) {
        group.position.x += (target.x - group.position.x) * k;
        group.position.z += (target.z - group.position.z) * k;
        group.rotation.y += (shortestAngle(group.rotation.y, target.rot) - group.rotation.y) * k;
      }
    },
    getAvatar(id) {
      return avatars.get(id)?.group;
    },
    dispose() {
      this.sync([], null);
    },
  };
}

/** Sambung ke server jika ?server= ada. Tidak pernah melempar error; game offline tetap jalan. */
export async function startMultiplayer({ scene, search, name = 'Tamu', NetClientImpl = NetClient }) {
  const url = resolveServerUrl(search);
  if (!url) return null;
  const view = createRemotePlayers(scene);
  const net = new NetClientImpl();
  net.on('state', (msg) => view.sync(msg.players, net.id));
  net.on('welcome', (msg) => view.sync(msg.players, msg.id));
  net.on('left', () => {});
  try {
    await net.connect(url, name);
  } catch (error) {
    console.warn('[multiplayer] gagal terhubung, lanjut offline:', error?.message ?? error);
    view.dispose();
    return null;
  }
  let lastSent = 0;
  return {
    net,
    view,
    sendInput(x, z, rot, nowMs) {
      if (nowMs - lastSent < SEND_INTERVAL_MS) return;
      lastSent = nowMs;
      net.sendInput(x, z, rot);
    },
    dispose() {
      net.close();
      view.dispose();
    },
  };
}
