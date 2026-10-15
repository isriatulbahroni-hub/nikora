import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAIT, blockedSwing, doorAssist, extraCameraOccluders, forwardBlend, gaitPose, inflateBoxes, joystickAnchor, joystickVector, labelMetrics, stepGait, turnToward, wrapAngle,
} from './villa-motion.js';

test('wrapAngle menjaga sudut di (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9 || Math.abs(wrapAngle(Math.PI * 3) + Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(-0.5 - Math.PI * 2) + 0.5) < 1e-9);
});

test('turnToward memilih jalur terpendek dan tidak melompat', () => {
  // dari 170 derajat ke -170 derajat: jalur terpendek hanya 20 derajat melewati 180, bukan 340
  const cur = (170 * Math.PI) / 180;
  const target = (-170 * Math.PI) / 180;
  const next = turnToward(cur, target, 1 / 60);
  const moved = Math.abs(wrapAngle(next - cur));
  assert.ok(moved > 0 && moved < 0.2, `bergerak ${moved}`);
  assert.ok(wrapAngle(next - cur) > 0, 'arah putar lewat 180 derajat');
});

test('turnToward dibatasi laju maksimum dan konvergen', () => {
  let a = 0;
  const first = turnToward(0, Math.PI, 1 / 60);
  assert.ok(first <= 11 / 60 + 1e-9, 'tidak memutar balik seketika');
  for (let i = 0; i < 120; i++) a = turnToward(a, 1, 1 / 60);
  assert.ok(Math.abs(a - 1) < 1e-3);
});

test('stepGait: diam tetap diam, bergerak menaikkan amplitudo, berhenti meluruh halus', () => {
  let g = { phase: 0, amp: 0 };
  g = stepGait(g, 0, 1 / 60);
  assert.deepEqual(g, { phase: 0, amp: 0 });
  for (let i = 0; i < 60; i++) g = stepGait(g, GAIT.maxSpeed, 1 / 60);
  assert.ok(g.amp > 0.95);
  const phaseMoving = g.phase;
  g = stepGait(g, GAIT.maxSpeed, 1 / 60);
  assert.notEqual(g.phase, phaseMoving);
  // berhenti: amplitudo menurun bertahap, bukan langsung nol
  const a1 = stepGait(g, 0, 1 / 60).amp;
  assert.ok(a1 < g.amp && a1 > 0.5 * g.amp);
  for (let i = 0; i < 200; i++) g = stepGait(g, 0, 1 / 60);
  assert.deepEqual(g, { phase: 0, amp: 0 });
});

test('stepGait: laju nol karena menabrak dinding menghentikan kaki walau input ditekan', () => {
  let g = { phase: 1, amp: 1 };
  for (let i = 0; i < 120; i++) g = stepGait(g, 0.05, 1 / 60);
  assert.ok(g.amp < 0.1);
});

test('gaitPose: kaki berlawanan fase, lengan berlawanan dengan kaki sisi sama, tanpa amplitudo = diam', () => {
  const p = gaitPose(Math.PI / 2, 1);
  assert.ok(Math.abs(p.hipR + p.hipL) < 1e-9);
  assert.ok(p.hipR > 0 && p.armR < 0, 'kaki kanan maju, lengan kanan mundur');
  assert.ok(p.dip < 0 && p.lean < 0);
  const still = gaitPose(1.2, 0);
  for (const v of Object.values(still)) assert.equal(Math.abs(v), 0);
  const swing = gaitPose(0, 1); // kaki bersilangan: tidak ada penurunan badan
  assert.ok(Math.abs(swing.dip) < 1e-9);
});

const doorH = { x: 20, z: 12, orient: 'h', width: 1.6 }; // dinding sepanjang x, dilalui sepanjang z

test('doorAssist menggeser ke tengah pintu saat melaju ke arahnya', () => {
  // pemain di x=19.5, z=14.5, berjalan ke utara (-z): pintu di x=20 -> perlu bergeser ke +x
  const out = doorAssist({ x: 19.5, z: 14.5 }, { x: 0, z: -1 }, [doorH]);
  assert.ok(out.x > 0, `x=${out.x}`);
  assert.ok(Math.hypot(out.x, out.z) <= 1 + 1e-9);
  assert.ok(out.z < 0, 'tetap maju');
});

test('doorAssist: tidak aktif jauh dari pintu, menjauh, sejajar dinding, atau arah mengarah ke dinding lain', () => {
  assert.deepEqual(doorAssist({ x: 19.5, z: 30 }, { x: 0, z: -1 }, [doorH]), { x: 0, z: -1 }); // terlalu jauh
  assert.deepEqual(doorAssist({ x: 19.5, z: 14.5 }, { x: 0, z: 1 }, [doorH]), { x: 0, z: 1 }); // menjauhi pintu
  assert.deepEqual(doorAssist({ x: 19.5, z: 14.5 }, { x: 1, z: 0 }, [doorH]), { x: 1, z: 0 }); // sejajar dinding
  assert.deepEqual(doorAssist({ x: 25, z: 14.5 }, { x: 0, z: -1 }, [doorH]), { x: 0, z: -1 }); // jauh ke samping pintu
});

test('doorAssist: sudah di tengah tidak ditarik; input kecil tidak diubah; pintu tegak (v) bekerja di sumbu z', () => {
  const centered = doorAssist({ x: 20, z: 14.5 }, { x: 0, z: -1 }, [doorH]);
  assert.deepEqual(centered, { x: 0, z: -1 });
  assert.deepEqual(doorAssist({ x: 19.5, z: 14.5 }, { x: 0, z: -0.1 }, [doorH]), { x: 0, z: -0.1 });
  const doorV = { x: 14, z: -11, orient: 'v', width: 3 };
  const out = doorAssist({ x: 16, z: -9.8 }, { x: -1, z: 0 }, [doorV], { reach: 3 });
  assert.ok(out.z < 0, `z=${out.z}`); // pintu di z=-11, pemain di -9.8: geser ke -z
});

test('doorAssist memandu lurus saat berada di ambang pintu', () => {
  const out = doorAssist({ x: 19.7, z: 12.1 }, { x: 0.2, z: -1 }, [doorH]);
  assert.ok(out.x > 0.2, 'ditarik ke tengah');
  assert.ok(Math.hypot(out.x, out.z) <= Math.hypot(0.2, -1) + 1e-9);
});

test('joystickVector: zona mati, kurva, dan arah', () => {
  assert.deepEqual(joystickVector(2, 1, 60), { x: 0, z: 0, mag: 0 });
  const half = joystickVector(30, 0, 60);
  const full = joystickVector(80, 0, 60);
  assert.ok(half.mag > 0 && half.mag < 0.5);
  assert.ok(Math.abs(full.mag - 1) < 1e-9 && Math.abs(full.x - 1) < 1e-9);
  const down = joystickVector(0, 60, 60);
  assert.ok(down.z > 0.99 && Math.abs(down.x) < 1e-9);
});

test('joystickAnchor menjaga pusat tetap di dalam zona', () => {
  const zone = { left: 0, right: 400, top: 500, bottom: 900 };
  assert.deepEqual(joystickAnchor({ x: 5, y: 890 }, zone, 60), { x: 74, y: 826 });
  assert.deepEqual(joystickAnchor({ x: 200, y: 700 }, zone, 60), { x: 200, y: 700 });
});

test('labelMetrics: ukuran layar tetap, dibatasi, memudar saat terlalu dekat atau jauh', () => {
  const mid = labelMetrics(6, 48);
  const farther = labelMetrics(8, 48);
  assert.ok(farther.height >= mid.height);
  assert.ok(labelMetrics(0.5, 48).height <= 0.26 + 1e-9, 'tidak membesar saat kamera menempel');
  assert.equal(labelMetrics(0.8, 48).opacity, 0);
  assert.equal(labelMetrics(6, 48).opacity, 1);
  assert.equal(labelMetrics(30, 48).opacity, 0);
  const fading = labelMetrics(14, 48).opacity;
  assert.ok(fading > 0 && fading < 1);
});

test('extraCameraOccluders memuat batang pohon, air mancur, dan pagar; inflateBoxes memperbesar', () => {
  const world = { allProps: [{ type: 'palm', x: 1, z: 2 }, { type: 'tree', x: 50, z: 60, s: 2 }, { type: 'bed', x: 0, z: 0 }], bounds: { minX: -42, maxX: 42, minZ: -26, maxZ: 42 } };
  const boxes = extraCameraOccluders(world);
  assert.equal(boxes.length, 2 + 1 + 5);
  const tree = boxes.find((b) => b.minX === 50 - 0.35);
  assert.ok(tree.maxY > 8);
  const big = inflateBoxes([{ minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }], 0.3)[0];
  assert.deepEqual(big, { minX: -0.3, maxX: 1.3, minY: -0.3, maxY: 1.3, minZ: -0.3, maxZ: 1.3 });
  // celah gerbang tetap terbuka
  const south = boxes.filter((b) => b.minZ >= 41.5);
  assert.ok(south.every((b) => b.maxX <= -3.2 || b.minX >= 3.2));
});

test('blockedSwing dan forwardBlend', () => {
  assert.equal(blockedSwing({ arm: 5, want: 5.6, moving: true, dragging: false, pitch: 0.3 }), 0);
  assert.equal(blockedSwing({ arm: 1, want: 5.6, moving: true, dragging: false, pitch: 0.3 }), 1);
  assert.equal(blockedSwing({ arm: 1, want: 5.6, moving: false, dragging: false, pitch: 0.3 }), 0);
  assert.equal(blockedSwing({ arm: 1, want: 5.6, moving: true, dragging: true, pitch: 0.3 }), 0);
  assert.equal(blockedSwing({ arm: 1, want: 5.6, moving: true, dragging: false, pitch: 1.2 }), 0);
  assert.equal(forwardBlend(2), 0);
  assert.equal(forwardBlend(0.5), 1);
  assert.ok(forwardBlend(0.95) > 0 && forwardBlend(0.95) < 1);
});
