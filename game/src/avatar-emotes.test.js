import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARM, POSES, REST, RIG, armFK, emotePose, emoteWeight } from './avatar-emotes.js';

const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;

// Rantai sendi yang sama persis dengan yang dibangun avatar.js: bahu (Euler XZY) -> siku (rotation.x) -> tangan.
function threeHand({ x, z, e, t }, side = 1) {
  const shoulder = new THREE.Object3D();
  shoulder.rotation.order = 'XZY';
  shoulder.position.set(side * RIG.shoulderX, RIG.shoulderY, 0);
  shoulder.rotation.set(x, side * t, side * z);
  const elbow = new THREE.Object3D();
  elbow.position.y = -RIG.upper;
  elbow.rotation.x = e;
  const hand = new THREE.Object3D();
  hand.position.y = -RIG.fore;
  shoulder.add(elbow);
  elbow.add(hand);
  shoulder.updateMatrixWorld(true);
  return hand.getWorldPosition(new THREE.Vector3()).toArray();
}

test('armFK sama dengan rantai sendi THREE (lengan kanan dan kiri dicerminkan)', () => {
  for (const key of Object.keys(ARM)) {
    const a = ARM[key];
    const mine = armFK(a).hand;
    assert.ok(near(mine, threeHand(a), 1e-6), `${key} kanan`);
    const left = threeHand(a, -1);
    assert.ok(near([-mine[0], mine[1], mine[2]], left, 1e-6), `${key} kiri = cermin kanan`);
  }
});

test('setiap sudut ARM menempatkan tangan tepat di targetnya (galat < 5 mm)', () => {
  for (const [key, a] of Object.entries(ARM)) assert.ok(near(armFK(a).hand, a.T, 0.005), `${key}: ${armFK(a).hand.map((v) => v.toFixed(3))} vs ${a.T}`);
});

test('semua target berada dalam jangkauan lengan dan sudutnya wajar secara anatomi', () => {
  const reach = RIG.upper + RIG.fore;
  for (const [key, a] of Object.entries(ARM)) {
    const d = Math.hypot(a.T[0] - RIG.shoulderX, a.T[1] - RIG.shoulderY, a.T[2]);
    assert.ok(d <= reach, `${key} di luar jangkauan (${d.toFixed(2)} > ${reach.toFixed(2)})`);
    assert.ok(a.e >= 0 && a.e <= 2.75, `${key} siku`);
    assert.ok(a.x >= -0.5 && a.x <= 3.2 && a.z >= -1.3 && a.z <= 1.8 && Math.abs(a.t) <= 1.8, `${key} sudut bahu`);
  }
  assert.deepEqual(Object.keys(REST).sort(), ['e', 'x', 'z', 't'].sort());
});

test('katalog pose: 32 pose, kunci lengan ada, tidak ada nilai aneh', () => {
  assert.equal(Object.keys(POSES).length, 32);
  for (const [id, p] of Object.entries(POSES)) {
    for (const k of [p.r, p.l]) assert.ok(k === null || ARM[k], `${id}: kunci lengan ${k}`);
    assert.equal(p.head.length, 3, id);
    assert.ok(Math.abs(p.spine) <= 0.8, id);
    for (const [ch, amp, f] of p.anim) {
      assert.ok(['rx', 'rz', 're', 'rt', 'lx', 'lz', 'le', 'lt', 'spine', 'hp', 'hy', 'hr', 'dip', 'hipR', 'hipL', 'kneeR', 'kneeL'].includes(ch), `${id}: kanal ${ch}`);
      assert.ok(Number.isFinite(amp) && amp <= 0.4 && f > 0 && f <= 14, `${id}: ${ch}`);
    }
  }
});

test('emoteWeight: nol di awal dan akhir, penuh di tengah, tidak pernah di luar 0..1', () => {
  assert.equal(emoteWeight(0, 2.4), 0);
  assert.equal(emoteWeight(2.4, 2.4), 0);
  assert.equal(emoteWeight(1.2, 2.4), 1);
  for (let t = -1; t < 4; t += 0.05) { const w = emoteWeight(t, 2.4); assert.ok(w >= 0 && w <= 1); }
});

test('emotePose: id tak dikenal = null; hasil selalu terbatas dan tanpa NaN selama 2,4 detik', () => {
  assert.equal(emotePose('???', 1), null);
  for (const id of Object.keys(POSES)) {
    for (let t = 0; t <= 2.4; t += 0.05) {
      const p = emotePose(id, t);
      const flat = [p.w, p.spine, p.headPitch, p.headYaw, p.headRoll, p.dip, ...[p.r, p.l].filter(Boolean).flatMap((a) => [a.x, a.z, a.e, a.t]), ...(p.legs ? Object.values(p.legs) : [])];
      for (const v of flat) assert.ok(Number.isFinite(v), `${id} @ ${t}`);
      for (const a of [p.r, p.l].filter(Boolean)) assert.ok(a.e >= 0 && a.e <= 2.75, `${id} siku @ ${t}`);
      assert.ok(Math.abs(p.dip) <= 0.4 && Math.abs(p.spine) <= 0.95, `${id} @ ${t}`);
    }
  }
});

// Tangan dan siku tidak boleh menembus kepala atau badan sepanjang gerakan (termasuk gerak kepala).
test('tangan dan siku tidak menembus kepala/badan sepanjang emote', () => {
  for (const id of Object.keys(POSES)) {
    for (let t = 0; t <= 2.4; t += 0.04) {
      const pose = emotePose(id, t);
      const head = new THREE.Vector3(0, RIG.headY - RIG.neckY, 0).applyEuler(new THREE.Euler(-pose.headPitch, pose.headYaw, pose.headRoll, 'XYZ')).add(new THREE.Vector3(0, RIG.neckY, 0));
      for (const [arm, side] of [[pose.r, 1], [pose.l, -1]]) {
        if (!arm) continue;
        const { elbow, hand } = armFK(arm);
        const e = new THREE.Vector3(side * elbow[0], elbow[1], elbow[2]);
        const h = new THREE.Vector3(side * hand[0], hand[1], hand[2]);
        assert.ok(h.distanceTo(head) >= RIG.headR + 0.03, `${id} tangan masuk kepala @ ${t.toFixed(2)} (${h.distanceTo(head).toFixed(3)})`);
        assert.ok(e.distanceTo(head) >= RIG.headR + 0.03, `${id} siku masuk kepala @ ${t.toFixed(2)}`);
        const ell = (q, m) => (q.x / (0.195 + m)) ** 2 + ((q.y - 1.08) / (0.27 + m)) ** 2 + (q.z / (0.1275 + m)) ** 2;
        assert.ok(ell(h, 0.02) >= 1, `${id} tangan masuk badan @ ${t.toFixed(2)}`);
        assert.ok(ell(e, -0.02) >= 1, `${id} siku masuk badan @ ${t.toFixed(2)}`);
      }
    }
  }
});
