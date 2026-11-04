import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE_HITBOX } from './hotel-life-data.js';
import { MASS, shapesFrom } from './hotel-traffic-sim.js';

// Satu sumber ukuran badan: tabrakan pejalan kaki (hitVehicle) dan tabrakan mobil pemain (hotel-traffic-sim.js) memakai VEHICLE_HITBOX yang sama.
test('shapesFrom(VEHICLE_HITBOX): semua jenis kendaraan punya bentuk dan massa, ukuran konsisten dengan kotak tabrak', () => {
  const shapes = shapesFrom(VEHICLE_HITBOX);
  for (const [kind, box] of Object.entries(VEHICLE_HITBOX)) {
    const s = shapes[kind];
    assert.ok(s, kind);
    assert.ok(Math.abs(s.halfL * 2 - (box.front + box.back)) < 1e-9);
    assert.ok(Math.abs(s.off + s.halfL - box.front) < 1e-9, 'ujung depan sama');
    assert.equal(s.halfW, box.half);
    assert.equal(s.mass, MASS[kind]);
  }
  assert.ok(shapes.bus.mass > shapes.car.mass && shapes.car.mass > shapes.motor.mass);
});
