import test from 'node:test';
import assert from 'node:assert/strict';
import { Fleet, carSitId, defaultCars } from './vehicle-fleet.js';

test('armada hotel: mobil mewah bermodel, kursi sesuai model, cat salinan kedua berbeda', () => {
  const cars = defaultCars().filter((c) => c.id.startsWith('hotel_'));
  assert.ok(cars.every((c) => ['royale', 'noir', 'argent', 'rubis', 'nikora'].includes(c.model)));
  assert.notEqual(cars[0].color, cars[4].color, 'model sama, cat berbeda');
  const f = new Fleet({ specs: cars, selfId: 'ani' });
  const rubis = f.cars.find((c) => c.model === 'rubis');
  const royale = f.cars.find((c) => c.model === 'royale');
  assert.equal(rubis.seats.length, 4);
  assert.equal(royale.seats.length, 2);
  assert.equal(f.seatPose(carSitId(royale.index, 3)), null, 'kursi 3 tidak ada di mobil 2 kursi');
  assert.ok(f.seatPose(carSitId(rubis.index, 3)));
});

function pair() {
  let t = 0;
  const now = () => t;
  const specs = defaultCars().filter((c) => c.id.startsWith('hotel_'));
  const ani = new Fleet({ specs, selfId: 'ani', now, send: (m) => budi.receive('ani', m) });
  const budi = new Fleet({ specs, selfId: 'budi', now, send: () => {} });
  return { ani, budi, advance: (ms) => { t += ms; } };
}

test('klakson: pengemudi menyiarkan, pemain lain mendengar; bukan-pengemudi diabaikan; dibatasi laju', () => {
  const { ani, budi, advance } = pair();
  const heard = [];
  budi.onHorn = (car, local) => heard.push([car.id, local]);
  assert.equal(ani.honk(), false, 'belum mengemudi');
  const c = ani.cars[0];
  ani.board({ x: c.x, z: c.z });
  assert.equal(ani.honk(), true);
  assert.equal(ani.honk(), false, 'terlalu cepat');
  advance(300);
  assert.equal(ani.honk(), true);
  assert.deepEqual(heard, [[c.id, false], [c.id, false]]);
  budi.receive('cici', { t: 'v', k: 'h', c: c.index });
  assert.equal(heard.length, 2, 'bukan pemegang kursi pengemudi: diabaikan');
});

test('sub-langkah: mobil cepat tidak menembus dinding tipis saat frame lambat', () => {
  const f = new Fleet({ specs: [{ id: 'm', x: 0, z: 0, heading: 0, model: 'argent' }], selfId: 'ani', env: { surfaceAt: () => 'road', colliders: [{ minX: -5, maxX: 5, minZ: 20, maxZ: 20.3 }] } });
  f.board({ x: 0, z: 0 });
  let maxZ = 0;
  for (let i = 0; i < 200; i++) { f.drive({ throttle: 1, steer: 0 }, 0.1); maxZ = Math.max(maxZ, f.cars[0].z); }
  assert.ok(maxZ < 20.3 + 1.2, `tidak menembus: z maks ${maxZ}`);
});

test('sub-langkah: NIKORA W16 pada 420 km/j (116 m/s) tidak menembus dinding tipis walau frame lambat', () => {
  const f = new Fleet({ specs: [{ id: 'n', x: 0, z: 0, heading: 0, model: 'nikora' }], selfId: 'ani', env: { surfaceAt: () => 'road', colliders: [{ minX: -8, maxX: 8, minZ: 700, maxZ: 700.3 }] } });
  f.board({ x: 0, z: 0 });
  let maxZ = 0;
  for (let i = 0; i < 1200; i++) { f.drive({ throttle: 1, steer: 0 }, 0.05); maxZ = Math.max(maxZ, f.cars[0].z); }
  assert.ok(f.cars[0].speed > 0, 'masih melaju atau sudah berhenti di dinding');
  assert.ok(maxZ < 700.3 + 1.5, `tidak menembus: z maks ${maxZ}`);
});
