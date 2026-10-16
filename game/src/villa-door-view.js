// Tampilan pintu kamar villa: daun pintu muncul (terkunci) bagi yang tidak boleh masuk, dan lampu status di samping pintu:
// hijau = kosong, biru = kamarmu, merah = terkunci, kuning = berpenghuni tetapi terbuka bagimu.
import * as THREE from 'three';
import { levelY } from './villa-layout.js';

const LAMP = { free: 0x39d98a, mine: 0x4aa3ff, locked: 0xe23b3b, open: 0xf0b030 };

export function createDoorView({ scene, rooms, getDoors }) {
  const group = new THREE.Group();
  group.name = 'room-doors';
  scene.add(group);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x6e4b2e, roughness: 0.7, metalness: 0.05 });
  const lampMats = Object.fromEntries(Object.entries(LAMP).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c })]));
  const lampGeo = new THREE.SphereGeometry(0.075, 12, 8);
  const geos = [lampGeo];
  const entries = [];
  for (const room of rooms) {
    for (const d of room.doors) {
      const y = levelY(room.level);
      const horizontal = d.orient === 'h';
      const leafGeo = new THREE.BoxGeometry(horizontal ? d.width - 0.04 : 0.1, 2.2, horizontal ? 0.1 : d.width - 0.04);
      geos.push(leafGeo);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(d.x, y + 1.1, d.z);
      leaf.visible = false;
      leaf.castShadow = true;
      const lamp = new THREE.Mesh(lampGeo, lampMats.free);
      const tx = horizontal ? 1 : 0;
      const tz = horizontal ? 0 : 1;
      lamp.position.set(d.x + tx * (d.width / 2 + 0.18) - d.nx * 0.2, y + 1.55, d.z + tz * (d.width / 2 + 0.18) - d.nz * 0.2);
      group.add(leaf, lamp);
      entries.push({ room, leaf, lamp, mode: 'free' });
    }
  }
  return {
    /** Murah dipanggil tiap frame: hanya menyentuh mesh bila status kamar berubah. */
    update() {
      const ctl = getDoors();
      const me = ctl?.selfId();
      for (const e of entries) {
        const s = ctl?.locks.state.get(e.room.id);
        let mode = 'free';
        if (s?.owner) mode = s.owner === me ? 'mine' : s.locked && !ctl.locks.canEnter(me, s) ? 'locked' : 'open';
        if (mode === e.mode) continue;
        e.mode = mode;
        e.leaf.visible = mode === 'locked';
        e.lamp.material = lampMats[mode];
      }
    },
    dispose() {
      scene.remove(group);
      for (const g of geos) g.dispose();
      leafMat.dispose();
      for (const m of Object.values(lampMats)) m.dispose();
    },
  };
}
