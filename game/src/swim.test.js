import assert from 'node:assert/strict';
import test from 'node:test';
import { POSE_KEYS } from './masjid-posture-data.js';
import { LAGOON_POOL, LAGOON_SHELVES, PIER, lagoonFloorY } from './hotel-lagoon-data.js';
import {
  HIP_REF, SPEED_MUL, SWIM_POSE_NAME, WADE_DEPTH, actionLabel, createSwimmer, isSwimPose, poolAt, stepSwimmer, swimParams, toggleAction,
} from './swim.js';

const DEEP = { x: 120, z: 520 }; // air dalam, jauh dari tepi
const SHELF = { x: 104, z: 520 }; // tanning ledge barat (dangkal)
const DECK = { x: 92, z: 535 };
const run = (st, input, seconds, dt = 1 / 30) => {
  let out;
  for (let t = 0; t < seconds; t += dt) out = stepSwimmer(st, { dt, ...input });
  return out;
};

test('kedalaman: dek bukan air, ledge dangkal, tengah kolam dalam, dermaga bukan air', () => {
  assert.equal(poolAt(DECK.x, DECK.z), null);
  assert.equal(poolAt((PIER.x0 + PIER.x1) / 2, 535), null, 'di atas dermaga = darat');
  const shelf = poolAt(SHELF.x, SHELF.z);
  assert.ok(shelf && shelf.depth > 0.3 && shelf.depth <= WADE_DEPTH, `ledge ${shelf?.depth}`);
  const deep = poolAt(DEEP.x, DEEP.z);
  assert.ok(deep && deep.depth > 2, `tengah ${deep?.depth}`);
  assert.equal(lagoonFloorY(104, 520), LAGOON_POOL.shelfY);
  assert.equal(lagoonFloorY(120, 520), LAGOON_POOL.floorY);
  for (const r of LAGOON_SHELVES) assert.ok(r[0] >= LAGOON_POOL.rect[0] && r[2] <= LAGOON_POOL.rect[2] && r[1] >= LAGOON_POOL.rect[1] && r[3] <= LAGOON_POOL.rect[3]);
});

test('masuk dari darat ke air dalam: percikan sekali, lalu berenang di permukaan', () => {
  const st = createSwimmer();
  const land = stepSwimmer(st, { ...DECK, dt: 1 / 30 });
  assert.equal(land.mode, null);
  assert.equal(land.active, false);
  assert.equal(land.y, 0);
  const first = stepSwimmer(st, { ...DEEP, moving: true, dt: 1 / 30 });
  assert.ok(first.entered && first.splash && first.splash.strength > 0.5, 'percikan besar saat terjun');
  assert.equal(first.splash.x, DEEP.x);
  const later = run(st, { ...DEEP, moving: true }, 2);
  assert.equal(later.mode, 'crawl');
  assert.equal(later.pose, 'renang');
  assert.ok(!later.entered && !later.splash);
  // badan tengkurap di permukaan: panggul hampir sejajar permukaan air
  assert.ok(Math.abs(later.y + HIP_REF - (LAGOON_POOL.waterY - 0.06)) < 0.02, `panggul ${later.y + HIP_REF}`);
});

test('diam di air dalam: tegak mengayuh; kepala di atas air; apung telentang lewat tombol aksi', () => {
  const st = createSwimmer();
  const out = run(st, { ...DEEP }, 3);
  assert.equal(out.mode, 'tread');
  assert.equal(out.pose, 'tegak_air');
  assert.equal(out.speedMul, 0);
  const head = out.y + 1.7;
  assert.ok(head > LAGOON_POOL.waterY, 'kepala di atas air');
  assert.equal(actionLabel(st, { ...DEEP, moving: false }), 'Apung');
  assert.ok(toggleAction(st, { ...DEEP, moving: false }));
  const fl = run(st, { ...DEEP }, 2);
  assert.equal(fl.mode, 'float');
  assert.equal(fl.pose, 'mengapung');
  assert.equal(actionLabel(st, { ...DEEP, moving: false }), 'Berenang');
  // bergerak membatalkan apung
  assert.equal(run(st, { ...DEEP, moving: true }, 1).mode, 'crawl');
  assert.equal(st.floating, false);
});

test('menyelam: tahan = turun sampai dekat dasar (tidak menembus), lepas = naik ke permukaan', () => {
  const st = createSwimmer();
  run(st, { ...DEEP }, 1);
  const down = run(st, { ...DEEP, dive: true }, 5);
  assert.equal(down.mode, 'dive');
  assert.equal(down.pose, 'selam');
  const hip = down.y + HIP_REF;
  assert.ok(hip < LAGOON_POOL.waterY - 1.2, `cukup dalam: ${hip}`);
  assert.ok(hip > LAGOON_POOL.floorY + 0.3, `tidak menembus dasar: ${hip}`);
  const up = run(st, { ...DEEP }, 4);
  assert.equal(up.mode, 'tread');
  assert.ok(up.y + HIP_REF > LAGOON_POOL.waterY - 0.7, 'kembali ke permukaan');
});

test('air dangkal: berjalan di air (lambat), tidak bisa menyelam, mandi hanya saat diam', () => {
  const st = createSwimmer();
  const w = run(st, { ...SHELF, moving: true, dive: true }, 2);
  assert.equal(w.mode, 'wade');
  assert.equal(w.pose, null, 'wade memakai animasi jalan');
  assert.ok(w.speedMul > 0.3 && w.speedMul < 0.85, `lambat: ${w.speedMul}`);
  assert.ok(Math.abs(w.y - LAGOON_POOL.shelfY) < 0.02, 'kaki menapak ledge');
  assert.equal(actionLabel(st, { ...SHELF, moving: true }), '');
  assert.equal(toggleAction(st, { ...SHELF, moving: true }), false);
  assert.equal(actionLabel(st, { ...SHELF, moving: false }), 'Mandi');
  assert.ok(toggleAction(st, { ...SHELF, moving: false }));
  const b = run(st, { ...SHELF }, 1);
  assert.equal(b.mode, 'bathe');
  assert.equal(b.pose, 'mandi');
  assert.equal(b.speedMul, 0);
  assert.equal(run(st, { ...SHELF, moving: true }, 0.2).mode, 'wade', 'berjalan menghentikan mandi');
});

test('keluar ke darat: naik halus ke tinggi tanah, lalu tidak aktif lagi', () => {
  const st = createSwimmer();
  run(st, { ...DEEP }, 2);
  const first = stepSwimmer(st, { ...DECK, dt: 1 / 30 });
  assert.ok(first.exited);
  assert.equal(first.mode, null);
  assert.equal(first.active, true, 'masih naik ke tepi');
  assert.ok(first.y < 0, 'belum sampai tanah');
  const end = run(st, { ...DECK }, 2);
  assert.equal(end.active, false);
  assert.equal(end.y, 0);
  assert.ok(!end.exited, 'exited hanya sekali');
});

test('riak: muncul berkala saat di air, tidak saat menyelam', () => {
  const st = createSwimmer();
  let n = 0;
  for (let i = 0; i < 90; i++) if (stepSwimmer(st, { ...DEEP, moving: true, dt: 1 / 30 }).ripple) n++;
  assert.ok(n >= 4 && n <= 8, `riak ${n}`);
  const d = createSwimmer();
  run(d, { ...DEEP }, 1);
  let m = 0;
  for (let i = 0; i < 120; i++) if (stepSwimmer(d, { ...DEEP, dive: true, dt: 1 / 30 }).ripple) m++;
  assert.ok(m <= 2, `menyelam tanpa riak, dapat ${m}`);
});

test('pengali kecepatan wajar: tidak ada yang lebih cepat dari berjalan', () => {
  for (const [mode, v] of Object.entries(SPEED_MUL)) assert.ok(v >= 0 && v <= 1, mode);
});

test('parameter gerak: lengkap, berhingga, berulang, dan nama jaringan valid', () => {
  for (const [mode, name] of Object.entries(SWIM_POSE_NAME)) {
    assert.match(name, /^[a-z_]{1,16}$/, 'cocok dengan POSE_NAME jaringan');
    assert.ok(isSwimPose(name), mode);
    for (const t of [0, 0.37, 1.9, 12.5, 99.9]) {
      const p = swimParams(name, t);
      for (const k of POSE_KEYS) assert.ok(Number.isFinite(p[k]), `${name}.${k}`);
      for (const k of ['armFwdR', 'armFwdL', 'hipFlexR', 'hipFlexL', 'kneeR', 'kneeL', 'armHangR', 'armHangL']) if (k in p) assert.ok(Number.isFinite(p[k]), `${name}.${k}`);
      assert.ok(p.knee >= 0 && (p.kneeR ?? 0) >= 0 && (p.kneeL ?? 0) >= 0 && (p.kneeR ?? 0) < Math.PI, `${name} lutut`);
    }
  }
  assert.equal(swimParams('sujud', 0), null);
  assert.equal(isSwimPose('sujud'), false);
  assert.equal(isSwimPose(null), false);
  // gaya bebas: lengan kiri dan kanan berselisih setengah putaran
  const p = swimParams('renang', 0.3);
  const d = (((p.armFwdR - p.armFwdL) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  assert.ok(Math.abs(d - Math.PI) < 1e-6, `selisih ${d}`);
  // tengkurap: badan condong ke depan; telentang: ke belakang; tegak: tidak miring
  assert.ok(swimParams('renang', 0).hipTilt > 1.2);
  assert.ok(swimParams('selam', 0).hipTilt > 1.2);
  assert.ok(swimParams('mengapung', 0).hipTilt < -1.2);
  assert.equal(swimParams('tegak_air', 0).hipTilt, 0);
  assert.equal(swimParams('mandi', 0).hipTilt, 0);
});
