import test from 'node:test';
import assert from 'node:assert/strict';
import { Fleet, defaultCars, carSitId, parseCarSit, CAR_SIT_BASE } from './vehicle-fleet.js';
import { surfaceAt } from './hotel-layout.js';

// Dua klien tersambung lewat bus sederhana (setiap pesan dikirim ke semua klien lain).
function pair() {
  let t = 0;
  const now = () => t;
  const clients = {};
  const make = (id) => new Fleet({ selfId: id, now, send: (msg) => { for (const [other, f] of Object.entries(clients)) if (other !== id) f.receive(id, JSON.parse(JSON.stringify(msg))); } });
  clients.ani = make('ani');
  clients.budi = make('budi');
  return { ani: clients.ani, budi: clients.budi, advance: (ms) => { t += ms; }, clients, now };
}
const DT = 1 / 30;

test('armada awal: 6 mobil di parkir depan villa + 8 di hotel, id unik, indeks = urutan', () => {
  const cars = defaultCars();
  assert.equal(cars.length, 14);
  assert.equal(cars.filter((c) => c.id.startsWith('villa_')).length, 6);
  assert.equal(cars.filter((c) => c.id.startsWith('hotel_')).length, 8);
  assert.equal(new Set(cars.map((c) => c.id)).size, cars.length);
  assert.ok(cars.length <= 125, 'indeks mobil muat di id duduk');
});

test('id duduk jaringan: bolak-balik indeks+kursi, dan id kursi villa biasa tidak dianggap mobil', () => {
  assert.equal(parseCarSit(carSitId(5, 2)).index, 5);
  assert.equal(parseCarSit(carSitId(5, 2)).seat, 2);
  assert.equal(parseCarSit(12), null);
  assert.equal(parseCarSit(CAR_SIT_BASE - 1), null);
  assert.equal(parseCarSit(null), null);
});

test('naik: kursi kosong terdekat, pengemudi dulu; tidak bisa naik dari jauh; satu mobil per orang', () => {
  const { ani, budi } = pair();
  const c0 = ani.cars[0];
  assert.equal(ani.board({ x: 100, z: 100 }), null, 'jauh');
  const r = ani.board({ x: c0.x + 1, z: c0.z });
  assert.equal(r.seat, 0);
  assert.equal(ani.driving, c0);
  assert.equal(ani.sitId, carSitId(0, 0));
  assert.equal(ani.board({ x: c0.x, z: c0.z }), null, 'sudah di mobil');
  assert.equal(budi.cars[0].seats[0], 'ani', 'budi tahu ani pengemudi');
  const r2 = budi.board({ x: c0.x + 1, z: c0.z });
  assert.equal(r2.seat, 1, 'budi dapat kursi penumpang depan');
  assert.equal(ani.cars[0].seats[1], 'budi');
});

test('berkendara: pose pengemudi sampai ke pemain lain (interpolasi) dan penumpang ikut', () => {
  const { ani, budi, advance } = pair();
  ani.env = { colliders: [], surfaceAt: () => 'road' };
  const c0 = ani.cars[0];
  ani.board({ x: c0.x, z: c0.z });
  budi.board({ x: c0.x, z: c0.z });
  for (let i = 0; i < 90; i++) { advance(33); ani.drive({ throttle: 1, steer: 0 }, DT); budi.update(DT); }
  const moved = Math.hypot(ani.cars[0].x - c0.home.x, ani.cars[0].z - c0.home.z);
  assert.ok(moved > 15, `mobil melaju: ${moved}`);
  for (let i = 0; i < 20; i++) { advance(33); ani.drive({ throttle: 1, steer: 0 }, DT); budi.update(DT); }
  const gap = Math.hypot(budi.cars[0].x - ani.cars[0].x, budi.cars[0].z - ani.cars[0].z);
  assert.ok(gap < 5, `budi melihat mobil dekat posisi asli (selisih ${gap.toFixed(2)} m)`);
  const pa = ani.seatPose(carSitId(0, 1));
  const pb = budi.seatPose(carSitId(0, 1));
  assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) < 6, 'pose penumpang konsisten');
});

test('turun: kursi bebas di semua klien; pengemudi turun = mesin mati dan mobil terparkir di pose akhir', () => {
  const { ani, budi, advance } = pair();
  ani.env = { colliders: [], surfaceAt: () => 'road' };
  const c0 = ani.cars[0];
  ani.board({ x: c0.x, z: c0.z });
  for (let i = 0; i < 60; i++) { advance(33); ani.drive({ throttle: 1 }, DT); }
  const end = { x: ani.cars[0].x, z: ani.cars[0].z };
  const out = ani.leave();
  assert.ok(out && Number.isFinite(out.x));
  assert.equal(ani.driving, null);
  assert.equal(budi.cars[0].seats[0], null);
  assert.equal(budi.cars[0].engine, false);
  assert.ok(Math.hypot(budi.cars[0].x - end.x, budi.cars[0].z - end.z) < 0.02, 'pose akhir sama');
});

test('berebut kursi: id yang lebih besar mengalah', () => {
  const { clients } = pair();
  const a = clients.ani;
  const b = clients.budi;
  let evicted = 0;
  b.onEvicted = () => { evicted++; };
  // keduanya mengklaim kursi 1 tanpa tahu satu sama lain (pesan tersilang)
  const c = a.cars[3];
  c.seats[1] = 'ani';
  a.mine = { index: 3, seat: 1 };
  b.cars[3].seats[1] = 'budi';
  b.mine = { index: 3, seat: 1 };
  a.receive('budi', { t: 'v', k: 'b', c: 3, s: 1 });
  b.receive('ani', { t: 'v', k: 'b', c: 3, s: 1 });
  assert.equal(a.cars[3].seats[1], 'ani', 'ani (id lebih kecil) menang');
  assert.equal(a.mine?.seat, 1);
  assert.equal(b.cars[3].seats[1], 'ani');
  assert.equal(b.mine, null, 'budi mengalah');
  assert.equal(evicted, 1);
});

test('pemain keluar dunia: kursi kosong, mobil berhenti; pendatang baru menerima snapshot mobil yang bergeser', () => {
  const { ani, budi, advance } = pair();
  ani.env = { colliders: [], surfaceAt: () => 'road' };
  const c0 = ani.cars[0];
  ani.board({ x: c0.x, z: c0.z });
  for (let i = 0; i < 40; i++) { advance(33); ani.drive({ throttle: 1 }, DT); }
  ani.leave();
  const snap = budi.snapshot();
  assert.equal(snap.length, 1);
  assert.equal(snap[0].c, 0);
  // pendatang baru
  const citra = new Fleet({ selfId: 'citra', now: () => 0 });
  citra.receive('budi', { t: 'v', k: 'n', cars: snap });
  assert.ok(Math.hypot(citra.cars[0].x - ani.cars[0].x, citra.cars[0].z - ani.cars[0].z) < 0.02);
  assert.equal(citra.snapshot().length, 1);
  // pemain keluar
  const { ani: a2, budi: b2 } = pair();
  const k = a2.cars[1];
  a2.board({ x: k.x, z: k.z });
  b2.board({ x: k.x, z: k.z });
  b2.dropPlayer('ani');
  assert.equal(b2.cars[1].seats[0], null);
  assert.equal(b2.cars[1].engine, false);
  assert.equal(b2.cars[1].seats[1], 'budi');
});

test('keamanan pesan: state dari pemain yang bukan pengemudi diabaikan bila kursi pengemudi milik kita; angka rusak ditolak', () => {
  const { ani, budi } = pair();
  const c = ani.cars[0];
  ani.board({ x: c.x, z: c.z }); // ani pengemudi
  const x0 = ani.cars[0].x;
  ani.receive('budi', { t: 'v', k: 's', c: 0, x: 999, z: 999, h: 0, v: 0, e: 1 });
  assert.equal(ani.cars[0].x, x0, 'tidak bisa membajak mobil yang kita kemudikan');
  budi.receive('x', { t: 'v', k: 's', c: 99, x: 1, z: 1, h: 0, v: 0 });
  budi.receive('x', { t: 'v', k: 's', c: 2, x: NaN, z: 1, h: 0, v: 0 });
  budi.receive('x', { t: 'v', k: 'b', c: 2, s: 77 });
  assert.equal(budi.cars[2].target, null);
  assert.ok(budi.cars[2].seats.every((s) => s === null));
});

test('fisika lokal memakai env: mobil dari parkir depan villa naik ke jalan raya tanpa menabrak', async () => {
  const { getVillaWorld } = await import('./villa-layout.js');
  const { getHotelWorld } = await import('./hotel-layout.js');
  const colliders = [...getVillaWorld().colliders, ...getHotelWorld().levels[0].colliders];
  const f = new Fleet({ selfId: 'ani', now: () => 0, env: { colliders, surfaceAt } });
  const car = f.cars[0]; // villa_0 di (-11, 94) menghadap selatan
  f.board({ x: car.x, z: car.z });
  let steps = 0;
  let hits = 0;
  // maju sambil membelok ke kanan (ke arah jalan di x ~ 0), lalu lurus ke selatan
  while (car.z < 150 && steps++ < 900) {
    const toRoad = -3 - car.x; // lajur kiri jalan
    f.drive({ throttle: 0.8, steer: car.z < 120 ? Math.max(-1, Math.min(1, toRoad * -0.4)) * -1 : 0 }, DT);
    hits += car.hit > 0 ? 1 : 0;
  }
  assert.ok(car.z >= 150, `sampai di jalan (z=${car.z.toFixed(1)})`);
  assert.equal(hits, 0);
});
