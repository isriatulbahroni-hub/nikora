import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { HALL } from './hall-layout.js';
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


function shortestAngle(from, to) {
  const diff = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + diff;
}

/** Menampilkan pemain lain (bukan pemain lokal) di scene. */
export function createRemotePlayers(scene) {
  const avatars = new Map();

  function build(p) {
    const group = createAvatar({ color: colorFor(p.id), name: p.name });
    group.position.set(p.x, p.sit == null ? 0 : HALL.seatedDrop, p.z);
    group.rotation.y = p.rot;
    scene.add(group);
    return { group, target: { x: p.x, z: p.z, rot: p.rot, sit: p.sit ?? null } };
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
        if (existing) existing.target = { x: p.x, z: p.z, rot: p.rot, sit: p.sit ?? null };
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
        group.position.y += ((target.sit === null ? 0 : HALL.seatedDrop) - group.position.y) * k;
      }
    },
    avatarGroups() {
      return [...avatars.values()].map((a) => a.group);
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
    sendInput(x, z, rot, nowMs, sit) {
      if (nowMs - lastSent < SEND_INTERVAL_MS) return;
      lastSent = nowMs;
      net.sendInput(x, z, rot, sit);
    },
    dispose() {
      net.close();
      view.dispose();
    },
  };
}
