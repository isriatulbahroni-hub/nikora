import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_CANOPY, HOTEL_FORECOURT, HOTEL_PARKING, HOTEL_SITE, hotelFootprint } from './hotel-layout.js';
import { wingReach } from './hotel-tower-shape.js';
import { SATELLITES, SATELLITE_PAD, SATELLITE_ZONES, satelliteColliders, satelliteRect, satelliteRing, satelliteRings, satelliteScale, satelliteSpire } from './hotel-satellites.js';

const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

test('menara pendamping: empat menara dengan id unik dan tinggi berbeda-beda, lebih rendah dari menara utama', () => {
  assert.equal(SATELLITES.length, 4);
  assert.equal(new Set(SATELLITES.map((s) => s.id)).size, 4);
  assert.ok(new Set(SATELLITES.map((s) => s.height)).size >= 3, 'tingginya bervariasi');
  for (const s of SATELLITES) assert.ok(s.height > 500 && s.height < 4200, `${s.id} setinggi ${s.height}`);
});

test('menara pendamping: di dalam tapak hotel, tidak menimpa bangunan, sayap podium, halaman, parkir, dan saling terpisah', () => {
  const b = hotelFootprint(0);
  const r = wingReach(b);
  const wings = [b[0] - r.w, b[1] - r.n, b[2] + r.e, b[3] + r.s];
  for (const s of SATELLITES) {
    const rect = satelliteRect(s, SATELLITE_PAD);
    assert.ok(rect[0] >= HOTEL_SITE.minX && rect[2] <= HOTEL_SITE.maxX && rect[1] >= HOTEL_SITE.minZ && rect[3] <= HOTEL_SITE.maxZ, `${s.id} di dalam tapak`);
    for (const [nama, area] of [['bangunan', b], ['sayap podium', wings], ['halaman', HOTEL_FORECOURT], ['parkir', HOTEL_PARKING], ['kanopi', HOTEL_CANOPY.rect]]) assert.ok(!overlap(rect, area), `${s.id} tidak menimpa ${nama}`);
  }
  for (let i = 0; i < SATELLITES.length; i++) for (let j = i + 1; j < SATELLITES.length; j++) assert.ok(!overlap(satelliteRect(SATELLITES[i], 2), satelliteRect(SATELLITES[j], 2)), `${SATELLITES[i].id} dan ${SATELLITES[j].id} terpisah`);
});

test('menara pendamping: kulit meruncing ke atas, segi delapan, dari tanah sampai tinggi menara', () => {
  for (const s of SATELLITES) {
    const rings = satelliteRings(s);
    assert.equal(rings.length, SATELLITE_ZONES + 1);
    assert.equal(rings[0].y, 0);
    assert.equal(rings.at(-1).y, s.height);
    const lebar = (ring) => Math.max(...ring.pts.map((p) => p[0])) - Math.min(...ring.pts.map((p) => p[0]));
    for (let i = 1; i < rings.length; i++) {
      assert.equal(rings[i].pts.length, 8);
      assert.ok(rings[i].y > rings[i - 1].y);
      assert.ok(lebar(rings[i]) < lebar(rings[i - 1]), `cincin ${i} lebih sempit`);
    }
    assert.ok(Math.abs(lebar(rings[0]) - 2 * s.hx) < 1e-9, 'dasar selebar tapak');
    assert.ok(Math.abs(satelliteScale(s, 1) - (1 - s.taper)) < 1e-12);
    // titik cincin tidak keluar dari persegi tapak dasar, jadi penghalang menutup seluruh menara
    const r = satelliteRect(s);
    for (const ring of rings) for (const [x, z] of ring.pts) assert.ok(x >= r[0] - 1e-9 && x <= r[2] + 1e-9 && z >= r[1] - 1e-9 && z <= r[3] + 1e-9);
  }
  assert.deepEqual(satelliteRing(SATELLITES[0], 0).pts, satelliteRings(SATELLITES[0])[0].pts);
});

test('menara pendamping: jarum puncak di atas atap dan penghalang mengelilingi tiap menara', () => {
  for (const s of SATELLITES) {
    const sp = satelliteSpire(s);
    assert.equal(sp.baseY, s.height);
    assert.ok(sp.tipY > s.height && sp.height > 50);
    assert.equal(sp.x, s.x);
    assert.equal(sp.z, s.z);
  }
  const cols = satelliteColliders();
  assert.equal(cols.length, SATELLITES.length);
  cols.forEach((c, i) => {
    const s = SATELLITES[i];
    assert.ok(c.minX < s.x - s.hx && c.maxX > s.x + s.hx && c.minZ < s.z - s.hz && c.maxZ > s.z + s.hz);
  });
});
