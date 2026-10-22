import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_DURATION_S, buildJourney, frameAt, journeyIds } from './journey.js';
import { ARRIVE_WITHIN, LAT_ACCEL, startState, stepDrive } from './journey-drive.js';

for (const venue of journeyIds()) {
  test(`autopilot ${venue}: tiba dalam 20-30 menit, nyaman di tikungan, berhenti di area penurunan`, () => {
    const j = buildJourney(venue);
    const st = startState(0);
    const dt = 1 / 20;
    let maxLat = 0;
    let steps = 0;
    while (!st.arrived && st.t < 3600) {
      stepDrive(j, st, dt);
      maxLat = Math.max(maxLat, st.v * st.v * Math.abs(frameAt(j, st.s).curvature));
      steps++;
    }
    assert.ok(st.arrived, `${venue} tidak tiba`);
    assert.ok(st.t >= MIN_DURATION_S, `${venue}: ${(st.t / 60).toFixed(1)} menit`);
    assert.ok(st.t <= 30 * 60, `${venue}: ${(st.t / 60).toFixed(1)} menit`);
    assert.ok(maxLat <= LAT_ACCEL * 1.35, `${venue}: percepatan menyamping ${maxLat.toFixed(2)}`);
    assert.ok(j.length - st.s < ARRIVE_WITHIN);
    assert.ok(steps > 0);
  });
}
