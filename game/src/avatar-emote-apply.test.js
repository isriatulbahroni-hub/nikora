import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyPose, createAvatar } from './avatar.js';
import { POSES, RIG, emotePose } from './avatar-emotes.js';

// Jalankan applyPose dengan jam palsu supaya elapsed emote tepat (performance.now dipakai avatar.js).
function withClock(fn) {
  const real = performance.now.bind(performance);
  let now = 50000;
  performance.now = () => now;
  try { return fn((ms) => { now += ms; }, () => now); } finally { performance.now = real; }
}
const settle = (g, frames = 90) => { for (let i = 0; i < frames; i += 1) applyPose(g, null, i / 60, 1 / 60); };
const handWorld = (g, side) => {
  g.updateMatrixWorld(true);
  const el = g.userData.elbows[side];
  const hand = el.children.find((c) => c.geometry?.type === 'SphereGeometry' && c.position.y < -0.2);
  return hand.getWorldPosition(new THREE.Vector3());
};

test('avatar punya siku, pivot badan atas, dan pivot kepala; gear ikut kepala', () => {
  const g = createAvatar({ color: 0x70c7a2, config: { o: 0, s: 0, h: 1, k: 1, a: 1 } });
  assert.deepEqual(Object.keys(g.userData.elbows).sort(), ['l', 'r']);
  assert.ok(g.userData.upper?.isGroup && g.userData.headPivot?.isGroup);
  assert.equal(g.userData.gear.parent, g.userData.headPivot);
  assert.equal(g.userData.face.parent, g.userData.headPivot);
  assert.equal(g.userData.arms.r.rotation.order, 'XZY');
});

test('emote doa: kedua tangan bertemu di depan dada (di dunia nyata, bukan hanya di data)', () => {
  withClock((advance) => {
    const g = createAvatar({ color: 0x70c7a2 });
    g.userData.emote = { id: 'pray', t0: performance.now() / 1000 - 1.2, dur: 2.4 };
    settle(g, 120);
    const r = handWorld(g, 'r');
    const l = handWorld(g, 'l');
    assert.ok(r.distanceTo(l) < 0.12, `tangan terpisah ${r.distanceTo(l).toFixed(3)}`);
    assert.ok(r.z < -0.1 && r.y > 1.0 && r.y < 1.4, `posisi tangan ${r.toArray().map((v) => v.toFixed(2))}`);
  });
});

test('emote menangis: tangan naik ke wajah; setelah selesai tangan kembali menggantung', () => {
  withClock((advance, now) => {
    const g = createAvatar({ color: 0x70c7a2 });
    const t0 = now() / 1000;
    g.userData.emote = { id: 'cry', t0, dur: 2.4 };
    advance(1200);
    settle(g, 120);
    assert.ok(handWorld(g, 'r').y > 1.4, 'tangan di wajah');
    g.userData.emote = null;
    settle(g, 120);
    assert.ok(handWorld(g, 'r').y < 0.9, 'tangan kembali ke bawah');
  });
});

test('emote tunduk hormat: badan atas membungkuk ke depan di pinggul, kepala ikut turun', () => {
  withClock((advance, now) => {
    const g = createAvatar({ color: 0x70c7a2 });
    g.userData.emote = { id: 'bow', t0: now() / 1000 - 1.2, dur: 2.4 };
    settle(g, 120);
    const head = new THREE.Vector3(0, 1.55, 0);
    g.updateMatrixWorld(true);
    g.userData.headPivot.localToWorld(head);
    assert.ok(head.z < -0.3 && head.y < 1.4, `kepala di ${head.toArray().map((v) => v.toFixed(2))}`);
    // kaki tetap menapak
    const foot = new THREE.Box3().setFromObject(g.userData.legs.r.hip).min.y;
    assert.ok(Math.abs(foot) < 0.05, `kaki di y=${foot}`);
  });
});

test('emote duduk: badan turun dan paha mendatar; berjalan menggagalkan emote', () => {
  withClock((advance, now) => {
    const g = createAvatar({ color: 0x70c7a2 });
    g.userData.emote = { id: 'sit', t0: now() / 1000 - 1.2, dur: 2.4 };
    settle(g, 120);
    assert.ok(g.userData.pivot.position.y < -0.3);
    assert.ok(g.userData.legs.r.hip.rotation.x > 1.3);
    const w = createAvatar({ color: 0x70c7a2 });
    w.userData.emote = { id: 'sit', t0: now() / 1000 - 1.2, dur: 2.4 };
    for (let i = 0; i < 120; i += 1) applyPose(w, null, i / 60, 1 / 60, 3); // berjalan 3 m/s
    assert.ok(w.userData.pivot.position.y > -0.2, 'berjalan menang atas emote');
  });
});

test('semua 32 emote: tidak ada NaN pada avatar, tangan di tempat wajar, dan tidak ada yang menembus kepala', () => {
  withClock((advance, now) => {
    for (const id of Object.keys(POSES)) {
      const g = createAvatar({ color: 0x70c7a2 });
      for (let f = 0; f < 150; f += 1) {
        g.userData.emote = { id, t0: 50000 / 1000, dur: 2.4 };
        advance(16);
        applyPose(g, null, f / 60, 1 / 60);
        g.updateMatrixWorld(true);
        for (const side of ['l', 'r']) {
          const p = handWorld(g, side);
          assert.ok(Number.isFinite(p.x + p.y + p.z), `${id} NaN`);
          assert.ok(p.y > 0.2 && p.y < 2.3 && Math.abs(p.x) < 0.8 && Math.abs(p.z) < 0.8, `${id} ${side} di ${p.toArray().map((v) => v.toFixed(2))}`);
        }
      }
    }
    assert.ok(RIG.headR > 0 && emotePose('wave', 1));
  });
});
