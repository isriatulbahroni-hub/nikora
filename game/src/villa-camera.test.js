import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCameraOccluders, chooseCameraPose, forwardLookBlend, rayBoxDistance, resolveCameraDistance } from './villa-camera.js';
import { LEVEL_HEIGHT, ROOFS, ROOMS, WALL_HEIGHT, getVillaWorld, levelY } from './villa-layout.js';

const world = getVillaWorld();
const boxes = buildCameraOccluders(world);
const box = { minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: 5, maxZ: 6 };
const unit = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};
/** Posisi kamera untuk avatar di (x,z) pada lantai `level`, arah putar `yaw`, pitch dan jarak yang diinginkan. */
function cameraAt(x, z, level, yaw, pitch, desired) {
  const origin = { x, y: levelY(level) + 1.45, z };
  const dir = unit(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const r = resolveCameraDistance(origin, dir, desired, boxes);
  return { ...r, pos: { x: origin.x + dir.x * r.dist, y: origin.y + dir.y * r.dist, z: origin.z + dir.z * r.dist } };
}

test('rayBoxDistance: kena, meleset, dan titik awal di dalam kotak', () => {
  assert.ok(Math.abs(rayBoxDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box) - 5) < 1e-9);
  assert.equal(rayBoxDistance({ x: 3, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box), Infinity);
  assert.equal(rayBoxDistance({ x: 0, y: 1, z: 5.5 }, { x: 0, y: 0, z: 1 }, box), Infinity);
  assert.equal(rayBoxDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box), Infinity); // menjauh
  assert.equal(rayBoxDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box, 4), Infinity); // di luar jangkauan
});

test('resolveCameraDistance: tanpa penghalang jarak penuh, dengan penghalang berhenti sebelum dinding', () => {
  const free = resolveCameraDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 8, [box]);
  assert.equal(free.dist, 8);
  assert.equal(free.blocked, false);
  const hit = resolveCameraDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 8, [box], { margin: 0.4 });
  assert.ok(Math.abs(hit.dist - 4.6) < 1e-9);
  assert.equal(hit.blocked, true);
  const tight = resolveCameraDistance({ x: 0, y: 1, z: 4.9 }, { x: 0, y: 0, z: 1 }, 8, [box], { margin: 0.4, minDist: 0.5 });
  assert.equal(tight.dist, 0.5); // tidak pernah lebih pendek dari minDist
});

const insideSolid = (p) => boxes.find((b) => p.x > b.minX + 1e-6 && p.x < b.maxX - 1e-6 && p.y > b.minY + 1e-6 && p.y < b.maxY - 1e-6 && p.z > b.minZ + 1e-6 && p.z < b.maxZ - 1e-6);

test('di dalam kamar kamera tidak pernah berada di dalam benda padat ke segala arah dan pitch', () => {
  const rooms = ['guest_1', 'guest_5', 'main_suite', 'bridal_room', 'restaurant', 'lobby', 'spa', 'wedding_hall'].map((id) => ROOMS.find((r) => r.id === id).rect);
  let n = 0;
  for (const room of rooms) {
    for (const [fx, fz] of [[0.3, 0.3], [0.5, 0.5], [0.8, 0.6]]) {
      const x = room[0] + (room[2] - room[0]) * fx;
      const z = room[1] + (room[3] - room[1]) * fz;
      for (let k = 0; k < 24; k++) {
        for (const pitch of [0.1, 0.3, 0.7, 1.1, 1.5]) {
          for (const desired of [4, 9, 25]) {
            const c = cameraAt(x, z, 0, (k / 24) * Math.PI * 2, pitch, desired);
            const hit = insideSolid(c.pos);
            assert.ok(!hit, `kamera di dalam benda padat di (${c.pos.x.toFixed(2)}, ${c.pos.y.toFixed(2)}, ${c.pos.z.toFixed(2)}) ruang ${room} yaw ${k} pitch ${pitch}`);
            assert.ok(c.pos.y > 0.2, 'kamera di bawah lantai');
            n++;
          }
        }
      }
    }
  }
  assert.ok(n > 5000);
});

test('di kamar tertutup tanpa jalan keluar kamera tetap di dalam ruangan', () => {
  // guest_8 pintunya di z=15 (sisi utara); kamera mengarah ke sisi selatan/timur/barat tidak boleh keluar
  const room = ROOMS.find((r) => r.id === 'guest_8').rect;
  const x = (room[0] + room[2]) / 2;
  const z = room[3] - 1.5;
  for (const yaw of [Math.PI / 2, -Math.PI / 2, 0]) {
    const c = cameraAt(x, z, 0, yaw, 0.3, 12);
    assert.ok(c.pos.x > room[0] && c.pos.x < room[2] && c.pos.z > room[1] && c.pos.z < room[3], `keluar ruangan: ${JSON.stringify(c.pos)}`);
  }
});

test('di lantai atas kamera tidak menembus pelat lantai di atas maupun di bawah', () => {
  const room = world.levels[1].rooms.find((r) => r.id === 'exec_suite').rect;
  const cx = (room[0] + room[2]) / 2;
  const cz = (room[1] + room[3]) / 2;
  for (const pitch of [0.2, 0.8, 1.45]) {
    const c = cameraAt(cx, cz, 1, 0.7, pitch, 20);
    assert.ok(c.pos.y < levelY(1) + WALL_HEIGHT && c.pos.y > levelY(1), `y=${c.pos.y}`);
  }
});

test('di aula yang tinggi kamera boleh naik tetapi tidak menembus atap', () => {
  const hall = ROOFS.find((r) => r.id === 'hall');
  const c = cameraAt(0, -11, 0, 0, 1.45, 30);
  assert.ok(c.pos.y < hall.base, `kamera menembus atap aula: y=${c.pos.y}`);
  assert.ok(c.pos.y > 5, 'di aula tinggi kamera seharusnya bisa naik cukup tinggi');
});

test('di halaman terbuka kamera tidak terhalang saat melihat bangunan dari selatan', () => {
  const c = cameraAt(0, 12, 0, 0, 0.35, 6);
  assert.equal(c.blocked, false);
  assert.equal(c.dist, 6);
});

test('naik tangga: kamera tidak menembus anak tangga', () => {
  const s = world.stairs.find((q) => q.id === 'tower_w_a');
  const z = (s.zBottom + s.zTop) / 2;
  const x = (s.x1 + s.x2) / 2;
  const y = levelY(0) + LEVEL_HEIGHT / 2;
  const origin = { x, y: y + 1.45, z };
  const r = resolveCameraDistance(origin, unit(0, -0.6, 0.8), 6, boxes);
  const end = { y: origin.y - 0.6 * r.dist };
  assert.ok(end.y > 0, 'kamera di bawah tanah');
});

test('semua ruangan berdinding punya langit-langit atau atap', () => {
  const covered = (level, rect) => {
    const cx = (rect[0] + rect[2]) / 2;
    const cz = (rect[1] + rect[3]) / 2;
    if (ROOFS.some((r) => cx > r.rect[0] && cx < r.rect[2] && cz > r.rect[1] && cz < r.rect[3] && Math.abs(r.base - (levelY(level) + (level === 0 && r.id === 'hall' ? 6.6 : WALL_HEIGHT))) < 1.5)) return true;
    const above = world.levels[level + 1];
    return !!above && above.rooms.some((r) => {
      const q = r.kind === 'stair' ? r.landing : r.rect;
      return q && cx > q[0] && cx < q[2] && cz > q[1] && cz < q[3];
    });
  };
  for (const level of world.levels) {
    for (const r of level.rooms) {
      if (r.kind === 'terrace') continue;
      const rect = r.kind === 'stair' && level.level > 0 ? r.landing : r.rect;
      if (!rect) continue;
      if (r.kind === 'stair') continue; // menara: atap ada di puncak (diuji terpisah)
      assert.ok(covered(level.level, rect), `${r.name} (lantai ${level.level + 1}) tidak beratap`);
    }
  }
  assert.ok(ROOFS.filter((r) => r.id.endsWith('_roof')).length === 4, 'tiap menara tangga beratap');
});

test('ambang pintu menghalangi kamera: dari dalam aula kamera tidak keluar lewat atas pintu', () => {
  const c = cameraAt(0, -7, 0, 0, 0.28, 5.6); // kamera di belakang avatar, menghadap pintu utama aula di z=-3
  assert.ok(c.pos.z < -3.1, `kamera keluar dari aula: z=${c.pos.z}`);
  const east = cameraAt(8, -11, 0, Math.PI / 2, 0.28, 8); // ke arah pintu lobi (x=14, setinggi bukaan)
  assert.ok(east.pos.x < 14 || east.pos.y < 2.4, `kamera menembus ambang pintu aula-lobi: ${JSON.stringify(east.pos)}`);
});

test('chooseCameraPose: di ruang terbuka sudut tidak berubah', () => {
  const p = chooseCameraPose({ x: 0, y: 1.45, z: 12 }, 0, 0.28, 5.6, boxes);
  assert.equal(p.pitch, 0.28);
  assert.equal(p.dist, 5.6);
  assert.equal(p.raised, false);
});

test('chooseCameraPose: dinaikkan hanya bila hasilnya memberi jarak orang ketiga yang layak', () => {
  // kamar tamu 1, avatar dekat dinding timur-selatan; kamera di belakang terhalang tetapi ada ruang ke atas bila jarak lengan cukup
  const eye = { x: 17.5, y: 1.45, z: 8.2 };
  const pose = chooseCameraPose(eye, 0, 0.28, 5.6, boxes);
  const cp = Math.cos(pose.pitch);
  const pos = { x: eye.x, y: eye.y + Math.sin(pose.pitch) * pose.dist, z: eye.z + cp * pose.dist };
  assert.ok(!insideSolid(pos), 'kamera di dalam benda padat');
  assert.ok(pos.y < WALL_HEIGHT, 'kamera menembus langit-langit');
  if (pose.raised) assert.ok(pose.dist >= 2.2, `dinaikkan tetapi lengan masih pendek: ${pose.dist}`);
});

test('chooseCameraPose: menempel dinding belakang tidak dipaksa menjadi pandangan dari atas', () => {
  const eye = { x: 20.6, y: 1.45, z: 10.45 }; // 0,55 m dari dinding selatan kamar (z = 11)
  const pose = chooseCameraPose(eye, 0, 0.28, 5.6, boxes);
  assert.equal(pose.pitch, 0.28);
  assert.equal(pose.raised, false);
  assert.ok(pose.dist < 1.3);
});

test('forwardLookBlend: 0 saat lengan panjang, 1 saat sangat pendek, monoton', () => {
  assert.equal(forwardLookBlend(5), 0);
  assert.equal(forwardLookBlend(1.7), 0);
  assert.equal(forwardLookBlend(0.7), 1);
  assert.equal(forwardLookBlend(0.5), 1);
  let last = 0;
  for (let a = 1.8; a >= 0.4; a -= 0.1) {
    const b = forwardLookBlend(a);
    assert.ok(b >= last - 1e-9, 'tidak monoton');
    last = b;
  }
  assert.ok(Math.abs(forwardLookBlend(1.2) - 0.5) < 1e-9);
});

test('chooseCameraPose: di semua ruangan hasilnya tidak di dalam benda padat dan tidak menembus langit-langit', () => {
  const ids = ['guest_1', 'guest_4', 'guest_5', 'main_suite', 'bridal_room', 'spa', 'lobby'];
  for (const id of ids) {
    const r = ROOMS.find((q) => q.id === id).rect;
    for (const [fx, fz] of [[0.2, 0.2], [0.5, 0.5], [0.8, 0.85], [0.15, 0.9]]) {
      const x = r[0] + (r[2] - r[0]) * fx;
      const z = r[1] + (r[3] - r[1]) * fz;
      for (let k = 0; k < 16; k++) {
        const yaw = (k / 16) * Math.PI * 2;
        const eye = { x, y: 1.45, z };
        const pose = chooseCameraPose(eye, yaw, 0.28, 5.6, boxes);
        const cp = Math.cos(pose.pitch);
        const pos = { x: x + Math.sin(yaw) * cp * pose.dist, y: eye.y + Math.sin(pose.pitch) * pose.dist, z: z + Math.cos(yaw) * cp * pose.dist };
        assert.ok(!insideSolid(pos), `kamera di dalam benda padat di ${id} (${fx},${fz}) yaw ${k}`);
        assert.ok(pos.y < WALL_HEIGHT, `menembus langit-langit di ${id}`);
      }
    }
  }
});
