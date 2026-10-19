import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LATCH_BREAK, PLAYER_R, SPEED, camYawOf, createPlayer, defaultScheme, knockBack, normalizeScheme, stepPlayer } from './horor-player.js';
import { angDiff } from './horor-core.js';
import { buildMansion, CAMS, PLAYER_START } from './horor-layout.js';

const DT = 1 / 60;
const idle = () => ({ x: 0, y: 0, mag: 0, analog: false, up: false, down: false, left: false, right: false, run: false });
const keys = (o) => ({ ...idle(), ...o });
// dorongan analog (joystick): x kanan, y maju
const stick = (x, y, run = false) => ({ x, y, mag: Math.min(1, Math.hypot(x, y)), analog: true, up: y > 0.5, down: y < -0.5, left: x < -0.5, right: x > 0.5, run });
// dorongan digital 8 arah (sudah dinormalkan seperti createHororInput)
const dig = (x, y, run = false) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l, mag: x || y ? 1 : 0, analog: false, up: y > 0, down: y < 0, left: x < 0, right: x > 0, run };
};
const run = (p, intent, secs, env) => {
  let steps = 0;
  for (let t = 0; t < secs; t += DT) if (stepPlayer(p, intent, DT, env).stepped) steps++;
  return steps;
};
const dist = (p, x, z) => Math.hypot(p.x - x, p.z - z);

test('tank: atas = maju searah rot (rot 0 = +z), kecepatan mendekati jalan', () => {
  const p = createPlayer({ x: 5, z: 5, rot: 0 });
  run(p, keys({ up: true }), 2, { scheme: 'tank' });
  assert.ok(p.z > 5 + 2.4 && p.z < 5 + 2.95, `z=${p.z}`);
  assert.ok(Math.abs(p.x - 5) < 1e-9);
  const q = createPlayer({ x: 0, z: 0, rot: Math.PI / 2 }); // menghadap +x
  run(q, keys({ up: true }), 1, { scheme: 'tank' });
  assert.ok(q.x > 1 && Math.abs(q.z) < 1e-6);
});

test('tank: kiri memutar rot naik, kanan turun; tanpa maju tidak bergeser', () => {
  const p = createPlayer({ rot: 0 });
  run(p, keys({ left: true }), 1, { scheme: 'tank' });
  assert.ok(p.rot > 2.7 && p.rot < 2.9, `rot=${p.rot}`);
  assert.ok(Math.hypot(p.x, p.z) < 1e-9);
  const q = createPlayer({ rot: 0 });
  run(q, keys({ right: true }), 1, { scheme: 'tank' });
  assert.ok(q.rot < -2.7);
});

test('tank: mundur lebih pelan dari jalan, lari lebih cepat dari jalan', () => {
  const walk = createPlayer();
  const back = createPlayer();
  const fast = createPlayer();
  run(walk, keys({ up: true }), 2, { scheme: 'tank' });
  run(back, keys({ down: true }), 2, { scheme: 'tank' });
  run(fast, keys({ up: true, run: true }), 2, { scheme: 'tank' });
  assert.ok(back.z < 0 && Math.abs(back.z) < walk.z * 0.7, `mundur ${back.z} vs jalan ${walk.z}`);
  assert.ok(fast.z > walk.z * 1.9, `lari ${fast.z} vs jalan ${walk.z}`);
  assert.ok(fast.z / 2 < SPEED.run + 1e-6);
});

test('tank + joystick analog: x memutar, y maju proporsional, y negatif mundur', () => {
  const p = createPlayer();
  run(p, stick(0, 1), 1, { scheme: 'tank' });
  const full = p.z;
  const h = createPlayer();
  run(h, stick(0, 0.5), 1, { scheme: 'tank' });
  assert.ok(h.z < full * 0.65 && h.z > full * 0.35, `setengah dorongan ${h.z} vs penuh ${full}`);
  const b = createPlayer();
  run(b, stick(0, -1), 1, { scheme: 'tank' });
  assert.ok(b.z < 0);
  const t = createPlayer();
  run(t, stick(1, 0), 1, { scheme: 'tank' });
  assert.ok(t.rot < -2, 'dorong kanan memutar searah kanan');
});

test('tank: berbelok sambil lari lebih lambat daripada saat berjalan', () => {
  const w = createPlayer();
  const r = createPlayer();
  run(w, keys({ up: true, left: true }), 0.3, { scheme: 'tank' });
  run(r, keys({ up: true, left: true, run: true }), 0.3, { scheme: 'tank' });
  assert.ok(w.rot > r.rot);
});

test('modern: dorong atas berjalan ke arah pandang kamera (kamera menghadap -z)', () => {
  const p = createPlayer({ x: 0, z: 10, rot: 0 });
  const camYaw = Math.PI; // kamera menghadap -z
  run(p, dig(0, 1), 3, { scheme: 'modern', camYaw });
  assert.ok(p.z < 10 - 2, `z=${p.z}`);
  assert.ok(Math.abs(p.x) < 0.3, `x=${p.x}`);
  assert.ok(Math.abs(angDiff(p.rot, Math.PI)) < 0.05);
});

test('modern: kanan layar = kanan menurut kamera, bukan sumbu dunia tetap', () => {
  // kamera menghadap +z: kanan layar = -x
  const a = createPlayer({ rot: 0 });
  run(a, dig(1, 0), 2, { scheme: 'modern', camYaw: 0 });
  assert.ok(a.x < -1, `kamera +z: x=${a.x}`);
  // kamera menghadap -z: kanan layar = +x
  const b = createPlayer({ rot: Math.PI });
  run(b, dig(1, 0), 2, { scheme: 'modern', camYaw: Math.PI });
  assert.ok(b.x > 1, `kamera -z: x=${b.x}`);
});

test('modern: tidak mundur; dorong ke belakang berbalik dulu baru berjalan', () => {
  const p = createPlayer({ rot: 0 });
  stepPlayer(p, dig(0, -1), DT, { scheme: 'modern', camYaw: 0 });
  assert.ok(p.z >= -1e-9, 'langkah pertama tidak mundur');
  run(p, dig(0, -1), 2, { scheme: 'modern', camYaw: 0 });
  assert.ok(p.z < -1.5, `akhirnya berjalan ke belakang layar: z=${p.z}`);
  assert.ok(Math.abs(angDiff(p.rot, Math.PI)) < 0.05);
});

test('modern: arah dikunci saat kamera berganti selama tombol ditahan (tidak berbalik arah di tengah jalan)', () => {
  const p = createPlayer({ rot: 0 });
  const intent = dig(0, 1);
  run(p, intent, 1, { scheme: 'modern', camYaw: 0 });
  const rotBefore = p.rot;
  run(p, intent, 1, { scheme: 'modern', camYaw: Math.PI }); // kamera ganti ke sisi berlawanan
  assert.ok(Math.abs(angDiff(p.rot, rotBefore)) < 0.01, 'arah tetap');
  assert.ok(p.z > 2.5, 'terus maju ke arah semula');
  // lepas tombol -> kunci dilepas; tekan lagi memakai kamera baru
  run(p, idle(), 0.2, { scheme: 'modern', camYaw: Math.PI });
  assert.equal(p.latch, null);
  const z0 = p.z;
  run(p, intent, 1.5, { scheme: 'modern', camYaw: Math.PI });
  assert.ok(p.z < z0, 'kamera baru dipakai setelah dilepas');
});

test('modern: perubahan arah dorongan besar melepas kunci kamera', () => {
  const p = createPlayer();
  stepPlayer(p, dig(0, 1), DT, { scheme: 'modern', camYaw: 0 });
  assert.equal(p.latch.yaw, 0);
  stepPlayer(p, dig(1, 0), DT, { scheme: 'modern', camYaw: 1 });
  assert.ok(Math.abs(angDiff(0, Math.PI / 2)) > LATCH_BREAK);
  assert.equal(p.latch.yaw, 1, 'kunci baru memakai kamera saat ini');
});

test('modern: dorongan kecil di bawah ambang diabaikan; magnitudo menskala kecepatan', () => {
  const p = createPlayer();
  run(p, stick(0, 0.03), 1, { scheme: 'modern', camYaw: 0 });
  assert.ok(Math.hypot(p.x, p.z) < 1e-9);
  const full = createPlayer();
  const half = createPlayer();
  run(full, stick(0, 1), 2, { scheme: 'modern', camYaw: 0 });
  run(half, stick(0, 0.5), 2, { scheme: 'modern', camYaw: 0 });
  assert.ok(half.z < full.z * 0.6 && half.z > 0);
});

test('tabrakan: dinding menahan pemain dan tidak ada tembus saat lari', () => {
  const wall = { x0: -5, x1: 5, z0: 3, z1: 3.2 };
  const p = createPlayer({ x: 0, z: 0, rot: 0 });
  run(p, keys({ up: true, run: true }), 3, { scheme: 'tank', colliders: [wall] });
  assert.ok(p.z <= 3 - PLAYER_R + 1e-6, `z=${p.z}`);
  assert.ok(p.z > 3 - PLAYER_R - 0.05);
});

test('frozen: tak ada kendali, tapi dorongan mundur sisa tetap meluruh', () => {
  const p = createPlayer();
  run(p, keys({ up: true }), 1, { scheme: 'tank', frozen: true });
  assert.equal(Math.hypot(p.x, p.z), 0);
  assert.equal(p.fwdIntent, false);
  knockBack(p, 2);
  const s = stepPlayer(p, keys({ up: true }), DT, { frozen: true });
  assert.ok(p.z < 0, 'terdorong mundur');
  run(p, idle(), 2, { frozen: true });
  assert.ok(Math.hypot(p.kx, p.kz) < 1e-6 && s.amp >= 0);
});

test('turnOnly dan slow: tidak maju / diperlambat 55%', () => {
  const t = createPlayer();
  run(t, keys({ up: true, left: true }), 1, { scheme: 'tank', turnOnly: true });
  assert.ok(Math.hypot(t.x, t.z) < 1e-9 && t.rot > 0);
  const n = createPlayer();
  const s = createPlayer();
  run(n, keys({ up: true }), 2, { scheme: 'tank' });
  run(s, keys({ up: true }), 2, { scheme: 'tank', slow: true });
  assert.ok(s.z < n.z * 0.5);
});

test('fwdIntent hanya menyala saat benar-benar maju (dipakai pembuka pintu)', () => {
  const p = createPlayer();
  stepPlayer(p, keys({ up: true }), DT, { scheme: 'tank' });
  assert.equal(p.fwdIntent, true);
  stepPlayer(p, keys({ down: true }), DT, { scheme: 'tank' });
  assert.equal(p.fwdIntent, false);
  stepPlayer(p, idle(), DT, { scheme: 'tank' });
  assert.equal(p.fwdIntent, false);
});

test('langkah kaki: berbunyi sesuai jarak, lari lebih rapat, berhenti saat diam', () => {
  const w = createPlayer();
  const walkSteps = run(w, keys({ up: true }), 4, { scheme: 'tank' });
  const r = createPlayer();
  const runSteps = run(r, keys({ up: true, run: true }), 4, { scheme: 'tank' });
  assert.ok(walkSteps >= 6 && walkSteps <= 12, `jalan ${walkSteps}`);
  assert.ok(runSteps > walkSteps, `lari ${runSteps}`);
  assert.equal(run(createPlayer(), idle(), 3, { scheme: 'tank' }), 0);
});

test('ketinggian lantai diikuti halus (floorY)', () => {
  const p = createPlayer();
  run(p, idle(), 1, { floorY: () => 0.4 });
  assert.ok(Math.abs(p.y - 0.4) < 0.01);
});

test('skema: bawaan menurut perangkat dan normalisasi nilai asing', () => {
  assert.equal(defaultScheme(true), 'modern');
  assert.equal(defaultScheme(false), 'tank');
  assert.equal(normalizeScheme('modern'), 'modern');
  assert.equal(normalizeScheme('apa-saja'), 'tank');
  assert.equal(normalizeScheme(undefined), 'tank');
});

test('camYawOf: larik dan objek memberi arah yang sama; null aman', () => {
  assert.equal(camYawOf(null), 0);
  const arr = camYawOf({ pos: [0, 2, 0], look: [3, 1, 4] });
  const obj = camYawOf({ pos: { x: 0, y: 2, z: 0 }, look: { x: 3, y: 1, z: 4 } });
  assert.ok(Math.abs(arr - Math.atan2(3, 4)) < 1e-12 && arr === obj);
});

test('di mansion sungguhan: dari lobi, maju ke utara menembus lubang ke lorong, tetapi gerbang terkunci menahan', () => {
  const room = buildMansion();
  const env = { scheme: 'tank', colliders: room.colliders, floorY: (x, z) => room.floorY(x, z) };
  const p = createPlayer(PLAYER_START);
  assert.ok(Math.abs(angDiff(p.rot, Math.PI)) < 1e-9, 'mulai menghadap utara (-z)');
  // lubang lobi-lorong di x=18, z=16: jalan lurus ke utara
  run(p, keys({ up: true }), 8, env);
  assert.ok(p.z < 14.5, `masuk lorong: z=${p.z}`);
  assert.ok(Math.abs(p.x - 18) < 0.3);
  // menuju gerbang perpustakaan (x=6, z=10) ditutup
  const q = createPlayer({ x: 6, z: 13, rot: Math.PI });
  run(q, keys({ up: true }), 4, env);
  assert.ok(q.z > 10.3, `gerbang menahan: z=${q.z}`);
  room.setShutter('lorong-pustaka', false);
  const q2 = createPlayer({ x: 6, z: 13, rot: Math.PI });
  run(q2, keys({ up: true }), 4, { ...env, colliders: room.colliders });
  assert.ok(q2.z < 9, `gerbang terbuka: z=${q2.z}`);
  room.dispose();
});

test('di mansion sungguhan: kamera tetap tiap zona memberi arah yang masuk akal untuk skema modern', () => {
  for (const c of CAMS) {
    const yaw = camYawOf(c);
    assert.ok(Number.isFinite(yaw), c.room);
    const p = createPlayer({ x: (c.zone[0] + c.zone[2]) / 2, z: (c.zone[1] + c.zone[3]) / 2 });
    const x0 = p.x;
    const z0 = p.z;
    run(p, dig(0, 1), 0.4, { scheme: 'modern', camYaw: yaw });
    const moved = Math.atan2(p.x - x0, p.z - z0);
    assert.ok(Math.abs(angDiff(moved, yaw)) < 0.35, `${c.room}: bergerak ${moved.toFixed(2)} vs arah kamera ${yaw.toFixed(2)}`);
    assert.ok(dist(p, x0, z0) > 0.1);
  }
});
