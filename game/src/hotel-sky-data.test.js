import test from 'node:test';
import assert from 'node:assert/strict';
import { blendSky } from './day-night.js';
import {
  GUESTS_PER_LEVEL, HOTEL_BUILDING, HOTEL_CAR_SPOTS, HOTEL_FORECOURT, HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_PARKING, HOTEL_TOP_Y,
  hotelFootprint, hotelLevelY, isGuestLevel, isSkyLobbyLevel,
} from './hotel-layout.js';
import {
  FACADE_NAME, GROUND_LAMP_HEIGHT, MAST_TIP, SKY_FRAMES, WINDOW_FACES, altitudeLevel, beaconLevel, beaconSpots, buildBeltLights, buildWindowLights, canopyLights,
  gateLights, groundLampSpots, helipadLights, horizonDip, lampLevel, nightLevel, shellFootprint, sunsetLevel, windowLevel, windowKindOf,
} from './hotel-sky-data.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

test('token langit: ketiga keyframe punya kunci yang sama dan blendSky tepat di ujung-ujungnya', () => {
  const keys = Object.keys(SKY_FRAMES.day).sort();
  assert.deepEqual(Object.keys(SKY_FRAMES.sunset).sort(), keys);
  assert.deepEqual(Object.keys(SKY_FRAMES.night).sort(), keys);
  const same = (blended, frame) => {
    for (const k of keys) {
      const a = [].concat(blended[k]);
      const b = [].concat(frame[k]);
      assert.equal(a.length, b.length, k);
      a.forEach((v, i) => assert.ok(close(v, b[i], 1e-12), `${k}[${i}]`));
    }
  };
  same(blendSky(SKY_FRAMES, -1), SKY_FRAMES.day);
  same(blendSky(SKY_FRAMES, 0), SKY_FRAMES.sunset);
  same(blendSky(SKY_FRAMES, 1), SKY_FRAMES.night);
});

test('token langit: siang tidak mengubah cahaya hotel yang lama (hemi 1,0 dan matahari 1,3)', () => {
  assert.equal(SKY_FRAMES.day.hemiI, 1.0);
  assert.equal(SKY_FRAMES.day.sunI, 1.3);
  for (const f of Object.values(SKY_FRAMES)) {
    for (const c of [f.fog, f.zenith, f.mid, f.sunColor, f.hemiSky, f.hemiGround, f.cloudLit, f.cloudShade]) {
      assert.equal(c.length, 3);
      for (const v of c) assert.ok(v >= 0 && v <= 1);
    }
    assert.ok(f.fogFar > f.fogNear && f.fogFar >= 2000, 'kabut cukup luas untuk menara 4,2 km');
  }
});

test('tingkat lampu, jendela, bintang, dan senja: batas dan urutan', () => {
  assert.equal(lampLevel(-1), 0);
  assert.equal(lampLevel(1), 1);
  assert.ok(lampLevel(-0.1) > 0 && lampLevel(-0.1) < 1);
  assert.equal(windowLevel(0), 0);
  assert.equal(windowLevel(1), 1);
  assert.equal(nightLevel(0), 0);
  assert.equal(nightLevel(1), 1);
  // lampu menyala lebih dulu daripada jendela, jendela lebih dulu daripada bintang
  for (const p of [-0.2, 0, 0.1, 0.3]) assert.ok(lampLevel(p) >= windowLevel(p) && windowLevel(p) >= nightLevel(p) - 1e-12, `phase ${p}`);
  assert.equal(sunsetLevel(0), 1);
  assert.equal(sunsetLevel(-1), 0);
  assert.equal(sunsetLevel(1), 0);
  assert.ok(beaconLevel(-1) > 0, 'lampu peringatan tetap terlihat di siang hari');
  assert.equal(beaconLevel(1), 1);
});

test('horizon turun menurut ketinggian dan ketinggian dinormalkan terhadap puncak menara', () => {
  assert.equal(horizonDip(0), 0);
  assert.equal(horizonDip(-50), 0);
  const top = horizonDip(HOTEL_TOP_Y);
  assert.ok(top > 0.034 && top < 0.038, `dip=${top}`);
  assert.equal(altitudeLevel(0), 0);
  assert.equal(altitudeLevel(HOTEL_TOP_Y), 1);
  assert.equal(altitudeLevel(HOTEL_TOP_Y * 3), 1);
});

test('jendela: satu per kamar per lantai dan jumlah per sisi sama dengan denah', () => {
  assert.equal(2 * WINDOW_FACES.ns + 2 * WINDOW_FACES.we, GUESTS_PER_LEVEL);
  const w = buildWindowLights();
  assert.equal(w.perLevel, GUESTS_PER_LEVEL);
  assert.equal(w.count, HOTEL_LEVEL_COUNT * GUESTS_PER_LEVEL);
  assert.equal(w.positions.length, w.count * 3);
  assert.equal(w.seeds.length, w.count);
  assert.equal(w.kinds.length, w.count);
  for (let i = 0; i < w.count; i++) {
    assert.ok(w.seeds[i] >= 0 && w.seeds[i] < 1, `seed ${i}`);
    assert.ok(w.kinds[i] === 0 || w.kinds[i] === 1 || w.kinds[i] === 2, `kind ${i}`);
  }
});

// Memeriksa bahwa jendela satu lantai berada tepat 0,3 m di luar persegi `fp` dan di dalam tinggi lantainya.
function assertWindowsOutsideRect(w, l, fp, label) {
  const y0 = hotelLevelY(l);
  for (let k = 0; k < w.perLevel; k++) {
    const i = l * w.perLevel + k;
    const x = w.positions[i * 3];
    const y = w.positions[i * 3 + 1];
    const z = w.positions[i * 3 + 2];
    assert.ok(y > y0 && y < y0 + HOTEL_LEVEL_HEIGHT, `${label} lantai ${l} y=${y}`);
    const dx = Math.max(fp[0] - x, 0, x - fp[2]);
    const dz = Math.max(fp[1] - z, 0, z - fp[3]);
    assert.ok(Math.abs(Math.max(dx, dz) - 0.3) < 1e-3, `${label} lantai ${l} jarak ${Math.max(dx, dz)}`);
    assert.ok(Math.min(dx, dz) < 1e-3, `${label} lantai ${l} titik di sudut`);
  }
}

test('jendela: bentuk meruncing menaruh titik tepat 0,3 m di luar tapak tiap lantai', () => {
  const w = buildWindowLights();
  for (const l of [0, 3, 4, 49, 50, 120, 500, 997, 998, 999]) assertWindowsOutsideRect(w, l, hotelFootprint(l), 'taper');
  // menara meruncing: lantai teratas lebih sempit daripada podium
  const widthAt = (l) => hotelFootprint(l)[2] - hotelFootprint(l)[0];
  assert.ok(widthAt(997) < widthAt(0));
});

test('jendela: bentuk kotak (fasad bertekstur) menaruh titik 0,3 m di luar kotak bangunan pada lantai fasad', () => {
  assert.equal(FACADE_NAME, 'hotel-facade');
  const w = buildWindowLights({ shell: 'box' });
  assert.equal(w.count, HOTEL_LEVEL_COUNT * GUESTS_PER_LEVEL);
  for (const l of [4, 49, 50, 500, 997, 998]) assertWindowsOutsideRect(w, l, HOTEL_BUILDING, 'box');
  // podium dan Sky Level tidak tertutup fasad: tetap mengikuti tapak lantainya
  for (const l of [0, 3, 999]) assertWindowsOutsideRect(w, l, hotelFootprint(l), 'box');
  assert.equal(shellFootprint(500, 'box'), HOTEL_BUILDING);
  assert.equal(shellFootprint(500, 'taper'), hotelFootprint(500));
  assert.equal(shellFootprint(999, 'box'), hotelFootprint(999));
  assert.equal(shellFootprint(2, 'box'), hotelFootprint(2));
});

test('jendela: lantai publik menyala semua, lantai tamu acak dengan sebagian kecil berlampu televisi', () => {
  const w = buildWindowLights();
  let tv = 0;
  let guest = 0;
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    assert.equal(windowKindOf(l), isGuestLevel(l) ? 0 : 1);
    for (let k = 0; k < w.perLevel; k++) {
      const kind = w.kinds[l * w.perLevel + k];
      if (isGuestLevel(l)) {
        assert.ok(kind === 0 || kind === 2, `lantai ${l}`);
        guest++;
        if (kind === 2) tv++;
      } else assert.equal(kind, 1, `lantai ${l}`);
    }
  }
  assert.ok(isSkyLobbyLevel(50) && windowKindOf(50) === 1);
  const share = tv / guest;
  assert.ok(share > 0.05 && share < 0.11, `bagian televisi=${share}`);
});

test('sabuk emas: hanya di Sky Lobby, di dalam tinggi lantainya, dan mengelilingi tapak', () => {
  const b = buildBeltLights();
  assert.equal(b.length % 3, 0);
  assert.ok(b.length / 3 > 19 * 100, 'ratusan lampu per Sky Lobby');
  const lobbies = Array.from({ length: HOTEL_LEVEL_COUNT }, (_, l) => l).filter(isSkyLobbyLevel);
  assert.equal(lobbies.length, 19);
  for (let i = 0; i < b.length / 3; i += 37) {
    const x = b[i * 3];
    const y = b[i * 3 + 1];
    const z = b[i * 3 + 2];
    const l = Math.floor(y / HOTEL_LEVEL_HEIGHT);
    assert.ok(isSkyLobbyLevel(l), `y=${y} bukan Sky Lobby`);
    const fp = hotelFootprint(l);
    assert.ok(x >= fp[0] - 0.95 && x <= fp[2] + 0.95 && z >= fp[1] - 0.95 && z <= fp[3] + 0.95, `titik (${x}, ${z}) di dekat tapak`);
  }
});

test('sabuk emas: bentuk kotak mengelilingi kotak bangunan penuh di semua Sky Lobby', () => {
  const b = buildBeltLights({ shell: 'box' });
  const taper = buildBeltLights();
  assert.ok(b.length > taper.length, 'kotak penuh lebih panjang daripada tapak yang meruncing');
  const B = HOTEL_BUILDING;
  for (let i = 0; i < b.length / 3; i += 29) {
    const x = b[i * 3];
    const y = b[i * 3 + 1];
    const z = b[i * 3 + 2];
    assert.ok(isSkyLobbyLevel(Math.floor(y / HOTEL_LEVEL_HEIGHT)), `y=${y}`);
    assert.ok(x >= B[0] - 0.95 && x <= B[2] + 0.95 && z >= B[1] - 0.95 && z <= B[3] + 0.95, `titik (${x}, ${z}) di dekat kotak bangunan`);
  }
});

test('mahkota: lima lampu peringatan dan cincin helipad melingkar', () => {
  const spots = beaconSpots();
  assert.equal(spots.length, 5);
  for (const s of spots.slice(0, 4)) {
    assert.ok(s[0] >= HOTEL_BUILDING[0] && s[0] <= HOTEL_BUILDING[2] && s[2] >= HOTEL_BUILDING[1] && s[2] <= HOTEL_BUILDING[3], 'tiang sudut berada di atas atap');
    assert.ok(s[1] > HOTEL_TOP_Y);
  }
  assert.deepEqual(spots[4], [MAST_TIP.x, MAST_TIP.y, MAST_TIP.z]);
  assert.deepEqual(beaconSpots({ x: 1, y: 2, z: 3 })[4], [1, 2, 3]);
  const center = { x: 0, y: HOTEL_TOP_Y + 1, z: 448 };
  const ring = helipadLights(center, 9.6, 24);
  assert.equal(ring.length, 72);
  for (let i = 0; i < 24; i++) {
    const d = Math.hypot(ring[i * 3] - center.x, ring[i * 3 + 2] - center.z);
    assert.ok(Math.abs(d - 9.6) < 1e-3, `titik ${i}`);
    assert.ok(ring[i * 3 + 1] > center.y);
  }
});

test('lampu halaman: di drop-off atau parkir, jauh dari mobil, bangunan, air mancur, dan kanopi', () => {
  const spots = groundLampSpots();
  assert.equal(spots.length, 10);
  for (const p of spots) {
    assert.ok(inRect(HOTEL_FORECOURT, p.x, p.z) || inRect(HOTEL_PARKING, p.x, p.z), `(${p.x}, ${p.z}) di drop-off atau parkir`);
    assert.ok(!inRect(HOTEL_BUILDING, p.x, p.z), 'bukan di dalam bangunan');
    assert.ok(Math.hypot(p.x - 0, p.z - 429) > 3.2 + 1, 'bukan di air mancur');
    assert.ok(!(p.x > -18.5 && p.x < 18.5 && p.z > 438.5 && p.z < 453.5), 'bukan di bawah kanopi');
    for (const c of HOTEL_CAR_SPOTS) assert.ok(Math.hypot(p.x - c.x, p.z - c.z) >= 2.5, `jauh dari ${c.id}`);
  }
  assert.ok(GROUND_LAMP_HEIGHT > 5);
});

test('lampu kanopi dan gerbang: terbatas, terhingga, dan di ketinggian yang benar', () => {
  const c = canopyLights();
  assert.equal(c.length, 10 * 3);
  for (let i = 0; i < c.length / 3; i++) assert.ok(c[i * 3 + 1] < 6.4 && c[i * 3 + 1] > 5, 'di bawah pelat kanopi');
  const g = gateLights();
  assert.ok(g.length > 0 && g.length % 3 === 0);
  for (let i = 0; i < g.length / 3; i++) {
    assert.ok(Number.isFinite(g[i * 3]) && Number.isFinite(g[i * 3 + 2]));
    assert.ok(Math.abs(g[i * 3 + 1] - 13.6) < 1e-4);
  }
});
