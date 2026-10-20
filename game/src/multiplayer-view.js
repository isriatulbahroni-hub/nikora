import * as THREE from 'three';
import { applyPose, auraSpecFor, createAvatar, setAvatarAura, setAvatarConfig } from './avatar.js';
import { configFromId, sameConfig } from './avatar-config.js';
import { HALL } from './hall-layout.js';
import { NetClient } from './net-client.js';
import { LiveKitNet } from './livekit-net.js';
import { VideoCall } from './video-call.js';
import { parseEventParams } from './event-context.js';

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
export function createRemotePlayers(scene, { poseFor } = {}) {
  const avatars = new Map();

  function build(p) {
    const config = p.av ?? configFromId(p.id); // tampilan sementara sampai avatar asli diterima
    const group = createAvatar({ config, name: p.name });
    if (p.au != null) setAvatarAura(group, auraSpecFor(p.name, p.au));
    group.rotation.order = 'YXZ'; // miring (tidur) dulu, lalu arah hadap
    group.position.set(p.x, (p.y ?? 0) + (p.sit == null ? 0 : HALL.seatedDrop), p.z);
    group.rotation.y = p.rot;
    scene.add(group);
    return { group, config, aura: p.au ?? null, act: p.act ?? null, target: { x: p.x, z: p.z, y: p.y ?? 0, rot: p.rot, sit: p.sit ?? null } };
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
          existing.target = { x: p.x, z: p.z, y: p.y ?? 0, rot: p.rot, sit: p.sit ?? null };
          existing.act = p.act ?? null;
          if (p.au != null && p.au !== existing.aura) {
            existing.aura = p.au;
            setAvatarAura(existing.group, auraSpecFor(p.name, p.au));
          }
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
        const pose = target.sit != null && poseFor ? poseFor(target.sit) : null; // vila: duduk atau berbaring
        const tx = pose ? pose.x : target.x;
        const tz = pose ? pose.z : target.z;
        const speed = Math.hypot(tx - group.position.x, tz - group.position.z) / Math.max(delta, 1e-3);
        // duduk: pose duduk (tilt 0) atau, tanpa poseFor (aula), titik duduk apa pun; berbaring (tilt != 0) bukan duduk
        group.userData.seated = pose ? pose.tilt === 0 : target.sit != null;
        applyPose(group, avatar.act ?? (speed > 0.8 ? 'walk' : null), time, delta);
        const kp = pose?.snap ? 1 : k; // kursi mobil yang melaju: tempel ke kursi (interpolasi akan membuat penumpang tertinggal di luar mobil)
        group.position.x += (tx - group.position.x) * kp;
        group.position.z += (tz - group.position.z) * kp;
        group.rotation.y += (shortestAngle(group.rotation.y, pose ? pose.rotY : target.rot) - group.rotation.y) * kp;
        // applyPose menulis rotation.x (membungkuk) tiap frame: tambahkan kemiringan tidur sesudahnya
        group.userData.tilt = (group.userData.tilt ?? 0) + ((pose ? pose.tilt : 0) - (group.userData.tilt ?? 0)) * k;
        group.rotation.x += group.userData.tilt;
        group.position.y += ((pose ? pose.y : (target.y ?? 0) + (target.sit == null ? 0 : HALL.seatedDrop)) - group.position.y) * kp;
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
export async function startMultiplayer({ scene, search, name = 'Tamu', world, poseFor, roleKey, NetClientImpl = NetClient, LiveKitImpl = LiveKitNet, useLiveKit = !import.meta.env?.VITE_DISABLE_LIVEKIT, useVideoCall = typeof document !== 'undefined' && !import.meta.env?.VITE_DISABLE_VIDEO, onError = () => {} }) {
  // ?server=ws://... memakai server WebSocket sendiri; selain itu coba LiveKit lewat /api/token (cukup Vercel).
  const url = resolveServerUrl(search);
  if (!url && !useLiveKit) return null;
  const view = createRemotePlayers(scene, { poseFor });
  const net = url ? new NetClientImpl() : new LiveKitImpl({ world, event: parseEventParams(search).slug, key: roleKey });
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
  // Video call (kamera) hanya lewat LiveKit: Room-nya sama dengan posisi/chat/suara. Gagal memasangnya tidak boleh mengganggu game.
  let videoCall = null;
  if (useVideoCall && net.room && typeof document !== 'undefined') {
    try {
      videoCall = await new VideoCall().attach(net.room);
      videoCall.mount();
    } catch (error) {
      console.warn('[video] panggilan video tidak tersedia:', error?.message ?? error);
      videoCall?.dispose();
      videoCall = null;
    }
  }
  let lastSent = 0;
  return {
    net,
    view,
    videoCall,
    sendChat(text) {
      net.sendChat(text);
    },
    sendInput(x, z, rot, nowMs, sit, pos) {
      if (nowMs - lastSent < SEND_INTERVAL_MS) return;
      lastSent = nowMs;
      net.sendInput(x, z, rot, sit, pos);
      videoCall?.tick(net.self, net.players);
    },
    dispose() {
      videoCall?.dispose();
      net.close();
      view.dispose();
    },
  };
}
