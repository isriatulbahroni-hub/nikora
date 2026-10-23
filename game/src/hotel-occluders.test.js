import test from 'node:test';
import assert from 'node:assert/strict';
import { exteriorOccluders } from './hotel-occluders.js';
import { resolveCameraDistance } from './villa-camera.js';

const args = {
  building: [-30, 430, 30, 470], podiumLevels: 5, podiumTopY: 20, topY: 4000,
  canopy: { rect: [-14, 420, 14, 432], height: 6, pillars: [[-12, 421], [12, 421]] },
  fountain: { x: 0, z: 400, r: 5 },
};

test('di lantai dasar: badan menara, kanopi, dua tiang, kolam, dan tugu menghalang', () => {
  const boxes = exteriorOccluders({ ...args, level: 0 });
  assert.equal(boxes.length, 1 + 1 + 2 + 2);
  assert.deepEqual(boxes[0], { minX: -30, maxX: 30, minY: 20, maxY: 4000, minZ: 430, maxZ: 470 });
});

test('di podium lantai atas: hanya badan menara; di lantai menara: tidak ada tambahan', () => {
  assert.equal(exteriorOccluders({ ...args, level: 3 }).length, 1);
  assert.equal(exteriorOccluders({ ...args, level: 5 }).length, 0);
  assert.equal(exteriorOccluders({ ...args, level: 400 }).length, 0);
});

test('kamera yang mengorbit ke arah kanopi dipendekkan, tidak menembusnya', () => {
  const boxes = exteriorOccluders({ ...args, level: 0 });
  const eye = { x: 0, y: 2.2, z: 426 }; // di bawah kanopi, kamera mau naik tegak lurus menembus pelat kanopi
  const dir = { x: 0, y: 1, z: 0 };
  const r = resolveCameraDistance(eye, dir, 11, boxes);
  assert.equal(r.blocked, true);
  assert.ok(eye.y + r.dist < 6 - 0.2, `kamera berhenti di bawah pelat kanopi (y=${eye.y + r.dist})`);
});

test('kamera yang mengorbit ke dalam menara dari halaman dipendekkan', () => {
  const boxes = exteriorOccluders({ ...args, level: 0 });
  const eye = { x: 0, y: 25, z: 410 };
  const dir = { x: 0, y: 0, z: 1 };
  const r = resolveCameraDistance(eye, dir, 40, boxes);
  assert.equal(r.blocked, true);
  assert.ok(eye.z + r.dist < 430, 'kamera berhenti sebelum dinding menara');
});

test('badan menara meruncing dan menara pendamping: kotak tambahan hanya di lantai dasar dan podium', () => {
  const towerBoxes = [{ minX: -30, maxX: 30, minY: 20, maxY: 200, minZ: 430, maxZ: 470 }, { minX: -25, maxX: 25, minY: 200, maxY: 400, minZ: 433, maxZ: 467 }];
  const satellites = [{ minX: 60, maxX: 90, minY: 0, maxY: 900, minZ: 440, maxZ: 470 }];
  const lantai0 = exteriorOccluders({ ...args, level: 0, towerBoxes, satellites });
  assert.equal(lantai0.length, 2 + 1 + 2 + 2 + 1, 'dua zona menara + satu pendamping + kanopi, dua tiang, kolam, tugu');
  assert.deepEqual(lantai0.slice(0, 2), towerBoxes);
  assert.equal(exteriorOccluders({ ...args, level: 3, towerBoxes, satellites }).length, 3);
  assert.equal(exteriorOccluders({ ...args, level: 5, towerBoxes, satellites }).length, 0);
  assert.equal(exteriorOccluders({ ...args, level: 400, towerBoxes, satellites }).length, 0);
});
