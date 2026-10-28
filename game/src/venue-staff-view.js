// Menggambar karyawan tempat acara yang dekat pemain sebagai avatar sederhana (avatar.js). Ratusan karyawan lain tidak digambar:
// hanya yang ada di lantai pemain, dalam radius, dan paling dekat (paling banyak STAFF_VIEW_MAX) yang mendapat avatar.
// Avatar dipakai ulang dari kolam supaya tidak membuat dan membuang mesh tiap kali karyawan masuk atau keluar jangkauan.
// Siapa berada di mana dihitung venue-staff.js (murni, diuji); berkas ini hanya urusan THREE dan pose. Sama dengan hotel-staff-view.js.
import * as THREE from 'three';
import { applyPose, createAvatar, setAvatarConfig } from './avatar.js';
import { turnToward } from './villa-motion.js';
import { hoursAt, zoneFromSearch } from './day-night.js';
import { STAFF_VIEW_MAX, STAFF_VIEW_RADIUS, pickNearby, staffActFor, staffConfig, staffOnLevel } from './venue-staff.js';

/** Jam (pecahan 0..24) di zona waktu acara (?tz=, bawaan WIB): sama dengan jam yang dipakai langit siang-malam. */
export const venueHourNow = (search = '') => {
  const zone = zoneFromSearch(search);
  return () => hoursAt(Date.now(), zone);
};

/**
 * `venue` = 'villa' | 'royal' | 'hall' | 'masjid'. `hourNow()` mengembalikan jam permainan pecahan (0..24).
 * `groundY(x, z, level)` = tinggi permukaan tempat karyawan berdiri (bawaan 0). `me` = { x, z, level } pemain. Panggil update() tiap frame.
 */
export function createVenueStaffView({ scene, venue, hourNow, groundY = () => 0 }) {
  const group = new THREE.Group();
  group.name = `staff-${venue}`;
  scene.add(group);
  const active = new Map(); // id karyawan -> { av, x, z, facing, shown, speed }
  const spare = []; // avatar yang tidak dipakai (disembunyikan), menunggu dipakai karyawan lain

  const acquire = (state) => {
    const cfg = staffConfig(state);
    let av = spare.pop();
    if (av) {
      setAvatarConfig(av, cfg);
    } else {
      av = createAvatar({ config: cfg });
      av.rotation.order = 'YXZ';
      group.add(av);
    }
    av.visible = true;
    return av;
  };

  return {
    update(me, delta, timeSec) {
      const near = pickNearby(staffOnLevel(venue, me.level ?? 0, hourNow()), me, STAFF_VIEW_RADIUS, STAFF_VIEW_MAX);
      const keep = new Set(near.map((s) => s.id));
      for (const [id, e] of active) {
        if (keep.has(id)) continue;
        e.av.visible = false;
        spare.push(e.av);
        active.delete(id);
      }
      const dt = Math.max(delta, 1e-3);
      for (const s of near) {
        let e = active.get(s.id);
        if (!e) {
          e = { av: acquire(s), x: s.x, z: s.z, facing: Math.PI, shown: Math.PI, speed: 0 }; // karyawan diam menghadap selatan (ke tamu)
          active.set(s.id, e);
        }
        const dx = s.x - e.x;
        const dz = s.z - e.z;
        const step = Math.hypot(dx, dz);
        const jumped = step > 3; // baru muncul atau pindah lantai: bukan berlari
        e.speed = jumped ? 0 : e.speed + (step / dt - e.speed) * (1 - Math.exp(-8 * dt));
        if (!jumped && step > 1e-3) e.facing = Math.atan2(-dx, -dz); // 0 = utara (-z), sama dengan pemain
        e.x = s.x;
        e.z = s.z;
        e.shown = turnToward(e.shown, e.facing, delta);
        e.av.position.set(s.x, groundY(s.x, s.z, s.level), s.z);
        e.av.rotation.y = e.shown;
        applyPose(e.av, staffActFor(s.task), timeSec, delta, e.speed);
      }
    },
    /** Untuk pengujian dan debug: jumlah dan id karyawan yang sedang digambar. */
    stats: () => ({ visible: active.size, pooled: spare.length, ids: [...active.keys()] }),
    dispose() {
      scene.remove(group);
      active.clear();
      spare.length = 0;
    },
  };
}
