import * as THREE from 'three';
import { applyPose, createAvatar, setAvatarConfig } from './avatar.js';
import { configFromId, sameConfig } from './avatar-config.js';
import { HALL } from './hall-layout.js';
import { NetClient } from './net-client.js';
import { LiveKitNet } from './livekit-net.js';

const SMOOTHING = 12; // semakin besar, semakin cepat avatar mengejar posisi server
const SEND_INTERVAL_MS = 50;

/** Baca ?server=ws://host:port dari query string, atau VITE_SERVER_URL saat build. Hanya ws:// atau wss://. */
export function resolveServerUrl(search, fallback = import.meta.env?.VITE_SERVER_URL) {
  const value = new URLSearchParams(search ?? '').get('server') || fallback;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:' ? url.toString() : null;
  } catch {
    return null;
  }
}



function shortestAngle(from, to) {
  const diff = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + diff;
}

/** Menampilkan pemain lain (bukan pemain lokal) di scene. */
export function createRemotePlayers(scene) {
  const avatars = new Map();

  function build(p) {
    const config = p.av ?? configFromId(p.id); // tampilan sementara sampai avatar asli diterima
    const group = createAvatar({ config, name: p.name });
    group.position.set(p.x, p.sit == null ? 0 : HALL.seatedDrop, p.z);
    group.rotation.y = p.rot;
    scene.add(group);
    return { group, config, act: p.act ?? null, target: { x: p.x, z: p.z, rot: p.rot, sit: p.sit ?? null } };
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
        if (existing) {
          existing.target = { x: p.x, z: p.z, rot: p.rot, sit: p.sit ?? null };
          existing.act = p.act ?? null;
          if (p.av && !sameConfig(p.av, existing.config)) {
            existing.config = p.av;
            setAvatarConfig(existing.group, p.av);
          }
        }
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
    update(delta, time = performance.now() / 1000) {
      const k = 1 - Math.exp(-SMOOTHING * Math.max(0, delta));
      for (const avatar of avatars.values()) {
        const { group, target } = avatar;
        const speed = Math.hypot(target.x - group.position.x, target.z - group.position.z) / Math.max(delta, 1e-3);
        applyPose(group, avatar.act ?? (speed > 0.8 ? 'walk' : null), time, delta);
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
export async function startMultiplayer({ scene, search, name = 'Tamu', world, NetClientImpl = NetClient, LiveKitImpl = LiveKitNet, useLiveKit = !import.meta.env?.VITE_DISABLE_LIVEKIT, onError = () => {} }) {
  // ?server=ws://... memakai server WebSocket sendiri; selain itu coba LiveKit lewat /api/token (cukup Vercel).
  const url = resolveServerUrl(search);
  if (!url && !useLiveKit) return null;
  const view = createRemotePlayers(scene);
  const net = url ? new NetClientImpl() : new LiveKitImpl(world ? { world } : undefined);
  net.on('state', (msg) => view.sync(msg.players, net.id));
  net.on('welcome', (msg) => view.sync(msg.players, msg.id));
  net.on('left', () => {});
  try {
    await net.connect(url, name);
  } catch (error) {
    console.warn('[multiplayer] gagal terhubung, lanjut offline:', error?.message ?? error);
    onError(String(error?.message ?? error).slice(0, 40));
    view.dispose();
    return null;
  }
  let lastSent = 0;
  return {
    net,
    view,
    sendChat(text) {
      net.sendChat(text);
    },
    sendInput(x, z, rot, nowMs, sit, pos) {
      if (nowMs - lastSent < SEND_INTERVAL_MS) return;
      lastSent = nowMs;
      net.sendInput(x, z, rot, sit, pos);
    },
    dispose() {
      net.close();
      view.dispose();
    },
  };
}
