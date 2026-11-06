import test from 'node:test';
import assert from 'node:assert/strict';
import { createVenueHub } from './hotel-venues.js';

// Tempat acara palsu: terpasang di sepanjang x [x0, x1]; mencatat panggilan supaya delegasi penghubung bisa diperiksa.
function fake(id, x0, x1, { anchored = true } = {}) {
  const calls = [];
  const v = {
    id,
    zone: { id },
    carColliders: [],
    occluders: [{ id: `${id}-box` }],
    loaded: false,
    anchored,
    calls,
    inside: (p) => v.anchored && p.x >= x0 && p.x <= x1,
    active: (p) => v.inside(p),
    near: (p) => v.inside(p),
    toLocalPoint: (p) => ({ x: p.x - x0, y: p.y, z: p.z, from: id }),
    localYaw: (yaw) => yaw + (id === 'a' ? 1 : 2),
    walk: (p, dx, dz) => { calls.push(['walk', dx, dz]); return { from: id }; },
    constrain: (p) => { calls.push(['constrain']); return { x: p.x, z: p.z, from: id }; },
    assist: (p, move) => { calls.push(['assist']); return { x: move.x, z: move.z, from: id }; },
    place: (p) => (v.inside(p) ? { id: `${id}-tempat`, name: id } : null),
    update: (args) => calls.push(['update', args.delta]),
    release: () => { v.anchored = false; calls.push(['release']); },
    state: () => ({ anchored: v.anchored, loaded: v.loaded, failed: false, frame: null, id }),
  };
  return v;
}

test('penghubung meneruskan gerak ke tempat acara yang memuat posisi pemain', () => {
  const a = fake('a', 0, 100);
  const b = fake('b', 200, 300);
  const hub = createVenueHub([a, b]);
  assert.deepEqual(hub.walk({ x: 250, z: 0 }, 1, 2), { from: 'b' });
  assert.deepEqual(hub.walk({ x: 50, z: 0 }, 3, 4), { from: 'a' });
  assert.deepEqual(a.calls, [['walk', 3, 4]]);
  assert.deepEqual(b.calls, [['walk', 1, 2]]);
  assert.equal(hub.constrain({ x: 220, z: 5 }).from, 'b');
  assert.equal(hub.assist({ x: 10, z: 0 }, { x: 1, z: 1 }).from, 'a');
});

test('active hanya benar di dalam salah satu tempat acara yang terpasang', () => {
  const a = fake('a', 0, 100);
  const b = fake('b', 200, 300, { anchored: false });
  const hub = createVenueHub([a, b]);
  assert.equal(hub.active({ x: 50, z: 0 }), true);
  assert.equal(hub.active({ x: 250, z: 0 }), false); // b belum terpasang
  assert.equal(hub.active({ x: 150, z: 0 }), false);
  assert.equal(hub.anchored, true);
});

test('near memilih tempat acara dan penghalang kamera mengikutinya', () => {
  const a = fake('a', 0, 100);
  const b = fake('b', 200, 300);
  const hub = createVenueHub([a, b]);
  assert.deepEqual(hub.occluders, []); // belum ada yang dekat
  assert.equal(hub.near({ x: 250, z: 0 }), true);
  assert.equal(hub.occluders, b.occluders);
  assert.equal(hub.toLocalPoint({ x: 250, y: 1, z: 0 }).from, 'b');
  assert.equal(hub.localYaw(0), 2);
  assert.equal(hub.near({ x: 50, z: 0 }), true);
  assert.equal(hub.occluders, a.occluders);
  assert.equal(hub.localYaw(0), 1);
  assert.equal(hub.near({ x: 150, z: 0 }), false);
  assert.deepEqual(hub.occluders, []);
});

test('place memberi keterangan dari tempat acara yang memuat pemain, null di luar', () => {
  const hub = createVenueHub([fake('a', 0, 100), fake('b', 200, 300)]);
  assert.equal(hub.place({ x: 10, z: 0 }).id, 'a-tempat');
  assert.equal(hub.place({ x: 210, z: 0 }).id, 'b-tempat');
  assert.equal(hub.place({ x: 150, z: 0 }), null);
});

test('release membongkar semua tempat acara dan update diteruskan ke semuanya', () => {
  const a = fake('a', 0, 100);
  const b = fake('b', 200, 300);
  const hub = createVenueHub([a, b]);
  hub.update({ delta: 0.016 });
  assert.deepEqual(a.calls, [['update', 0.016]]);
  assert.deepEqual(b.calls, [['update', 0.016]]);
  hub.release();
  assert.equal(hub.anchored, false);
  assert.equal(a.anchored, false);
  assert.equal(b.anchored, false);
});

test('state mempertahankan bentuk lama (villa) dan menambah keadaan tiap tempat acara', () => {
  const hub = createVenueHub([fake('a', 0, 100), fake('b', 200, 300)]);
  const s = hub.state();
  assert.equal(s.anchored, true);
  assert.equal(s.failed, false);
  assert.equal(s.venues.a.id, 'a');
  assert.equal(s.venues.b.id, 'b');
  assert.deepEqual(Object.keys(hub.venues), ['a', 'b']);
});
