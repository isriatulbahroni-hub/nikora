import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT } from '../activities/badminton.js';
import { PLAYER_BOUNDS, PLAYER_START, aimFromInput, courtLineSegments, createProjector, stepPlayer } from './court-view.js';

const hl = COURT.length / 2;
const hw = COURT.width / 2;

test('stepPlayer: bergerak menurut input dan tidak keluar dari sisinya', () => {
  const right = stepPlayer(PLAYER_START, { x: 1, z: 0 }, 10);
  assert.equal(right.x, PLAYER_BOUNDS.maxX);
  assert.equal(right.z, PLAYER_START.z);
  const forward = stepPlayer(PLAYER_START, { x: 0, z: 1 }, 10);
  assert.equal(forward.z, PLAYER_BOUNDS.maxZ, 'tidak boleh melewati net');
  assert.ok(forward.z < 0);
  const back = stepPlayer(PLAYER_START, { x: 0, z: -1 }, 10);
  assert.equal(back.z, PLAYER_BOUNDS.minZ);
});

test('stepPlayer: diagonal tidak lebih cepat, input rusak diabaikan', () => {
  const p = stepPlayer({ x: 0, z: -3 }, { x: 1, z: 1 }, 0.1);
  assert.ok(Math.abs(Math.hypot(p.x, p.z + 3) - 0.5) < 1e-9, 'laju 5 m/s x 0,1 s = 0,5 m');
  const same = stepPlayer({ x: 1, z: -3 }, { x: NaN, z: undefined }, 1);
  assert.deepEqual(same, { x: 1, z: -3 });
});

test('aimFromInput dibatasi -1..1', () => {
  assert.equal(aimFromInput({ x: 5 }), 1);
  assert.equal(aimFromInput({ x: -5 }), -1);
  assert.equal(aimFromInput({ x: 0.3 }), 0.3);
  assert.equal(aimFromInput(null), 0);
});

test('garis lapangan sesuai ukuran resmi BWF', () => {
  const segs = courtLineSegments();
  assert.equal(segs.length, 13);
  const zs = segs.flatMap((s) => [s[1], s[3]]);
  const xs = segs.flatMap((s) => [s[0], s[2]]);
  assert.ok(Math.abs(Math.max(...zs) - 6.7) < 1e-9, 'panjang 13,4 m');
  assert.ok(Math.abs(Math.max(...xs) - 3.05) < 1e-9, 'lebar 6,1 m');
  assert.ok(segs.some((s) => Math.abs(s[0] - 2.59) < 1e-9 && s[0] === s[2]), 'samping tunggal 5,18 m');
  assert.ok(segs.some((s) => Math.abs(Math.abs(s[1]) - 1.98) < 1e-9 && s[1] === s[3]), 'servis pendek 1,98 m dari net');
  assert.ok(segs.some((s) => Math.abs(Math.abs(s[1]) - 5.94) < 1e-9 && s[1] === s[3]), 'servis belakang ganda 0,76 m dari garis belakang');
  assert.ok(segs.some((s) => s[1] === 0 && s[3] === 0), 'garis net');
});

for (const [w, h] of [[390, 700], [800, 360], [1200, 800]]) {
  test(`createProjector ${w}x${h}: seluruh lapangan muat di kanvas dan perspektifnya benar`, () => {
    const { project } = createProjector(w, h);
    for (const [x, z] of [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]) {
      const p = project(x, 0, z);
      assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h, `sudut (${x},${z}) di luar kanvas: ${p.x},${p.y}`);
    }
    const near = project(0, 0, -hl);
    const far = project(0, 0, hl);
    assert.ok(near.y > far.y, 'sisi pemain di bawah layar, sisi bot di atas');
    assert.ok(near.s > far.s, 'yang dekat tampak lebih besar');
    assert.ok(Math.abs(project(0, 0, 0).x - w / 2) < 1e-6, 'tengah lapangan di tengah layar');
    assert.ok(project(1, 0, -3).x > project(-1, 0, -3).x, 'x positif ke kanan');
    assert.ok(project(0, 2, -3).y < project(0, 0, -3).y, 'makin tinggi, makin naik di layar');
    assert.ok(project(0, 0, -hl).y < h * 0.8, 'ada ruang untuk kontrol di bawah lapangan');
  });
}
