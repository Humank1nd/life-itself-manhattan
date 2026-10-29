// Gate for the cinematic tour (Extraction 017, slice 3).
// Waypoint order, ENU grounding, durations/holds, targets below the
// camera, determinism. No WebGL: pure waypoint math.
import assert from 'node:assert/strict';
import { tourLegs, tourDurationMs } from '../src/camera-tour.js';
import { wgs84ToEnu } from '../src/streets.js';
const legs = tourLegs();
assert.equal(legs.length, 6);
assert.deepEqual(legs.map((l) => l.id),
  ['fidi-harbor', 'wall-street', 'soho-village', 'midtown-skyline', 'times-square', 'central-park-south']);
assert.deepEqual(tourLegs(), legs);
assert.equal(tourDurationMs(), legs.reduce((s, l) => s + l.durMs + l.holdMs, 0));
assert(tourDurationMs() > 45000 && tourDurationMs() < 60000, 'tour length');
// First/last legs match the surveyed endpoints through the verified transform.
{
  const [e0, n0] = wgs84ToEnu(40.7032, -74.0165);
  assert.deepEqual(legs[0].toPos, [e0, 560, n0]);
  const [e5, n5] = wgs84ToEnu(40.7660, -73.9770);
  assert.deepEqual(legs[5].toPos, [e5, 780, n5]);
}
// Look targets sit below the camera on the same vertical.
for (const l of legs) {
  assert(l.toTgt[1] < l.toPos[1], 'target below camera: ' + l.id);
  assert.equal(l.toTgt[0], l.toPos[0]);
  assert.equal(l.toTgt[2], l.toPos[2]);
  assert(l.durMs >= 6000 && l.holdMs >= 2000, 'leg timing: ' + l.id);
}
console.log(`PASS camera tour — 6 surveyed legs FiDi to Central Park South, ${(tourDurationMs() / 1000).toFixed(1)}s with holds, ENU-grounded, deterministic`);
