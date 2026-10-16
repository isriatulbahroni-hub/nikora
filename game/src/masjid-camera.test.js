import assert from 'node:assert/strict';
import test from 'node:test';
import { getMasjidWorld } from './masjid-layout.js';
import { resolveCameraDistance } from './villa-camera.js';

const world = getMasjidWorld();

test('tiang aula menghalangi kamera (dulu kamera bisa menembus tiang)', () => {
  const col = world.props.find((p) => p.type === 'column' && p.h > 20);
  assert.ok(col, 'tiang aula tidak ditemukan');
  // pemain 4 m di selatan tiang, kamera ditarik lurus ke utara (menembus tiang)
  const eye = { x: col.x, y: 1.45, z: col.z + 4 };
  const boxes = world.occludersNear(eye.x, eye.z, 20);
  const r = resolveCameraDistance(eye, { x: 0, y: 0, z: -1 }, 8, boxes);
  assert.ok(r.blocked, 'kamera seharusnya terhalang tiang');
  assert.ok(r.dist < 4, `lengan kamera harus dipendekkan sebelum tiang, dist=${r.dist}`);
});

test('tiang ruang rendah memakai tinggi aslinya, bukan 28 m', () => {
  const low = world.props.find((p) => p.type === 'column' && p.h > 9 && p.h < 12);
  assert.ok(low, 'tiang ruang rendah tidak ditemukan');
  const boxes = world.occludersNear(low.x, low.z, 2).filter((b) => b.minY === 0 && b.minX <= low.x && b.maxX >= low.x && b.minZ <= low.z && b.maxZ >= low.z);
  assert.ok(boxes.some((b) => Math.abs(b.maxY - low.h) < 1e-9), 'kotak penghalang tiang harus setinggi tiang');
  assert.ok(boxes.every((b) => b.maxY < 12), 'tidak boleh ada penghalang bayangan setinggi aula di ruang rendah');
});
