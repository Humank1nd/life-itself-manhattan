// Gate for the Pacejka MF96 tire core (slice 4 bonus port — verbatim
// physics, property-tested since GEV carries no numeric fixtures).
import assert from 'node:assert/strict';
import { LONG_COEFFS, LAT_COEFFS, PROFILE_MU, magicFormula, wetGripFactor, evalTires, slipAngleDeg } from '../src/pacejka.js';
// Formula is odd in slip: F(-x) == -F(x).
for (const x of [0.05, 0.15, 0.5]) {
  assert(Math.abs(magicFormula(-x, LONG_COEFFS) + magicFormula(x, LONG_COEFFS)) < 1e-12, 'odd ' + x);
  assert(Math.abs(magicFormula(-x, LAT_COEFFS) + magicFormula(x, LAT_COEFFS)) < 1e-12, 'odd-lat ' + x);
}
// Longitudinal peak near real tire values.
{
  const peak = magicFormula(0.15, LONG_COEFFS);
  assert(peak > 0.9 && peak < 1.2, 'peak ' + peak);
}
// Dry reference: full grip, no hydroplaning.
assert.deepEqual(evalTires({}), { muScale: 1, muUtilPct: 0, slipDeg: 0, hydroplaning: false, wetMu: 1.05 });
// Wet at speed: degraded grip, hydroplaning flagged.
assert.deepEqual(evalTires({ waterMm: 2.5, speedKmh: 100 }),
  { muScale: 0.4, muUtilPct: 0, slipDeg: 0, hydroplaning: true, wetMu: 0.42 });
// Unknown profile defaults to trim 1.
assert.equal(evalTires({ profileId: 'hovercraft' }).muScale, 1);
// Standing still has no slip angle; pure lateral slide reads 90 deg.
assert.equal(slipAngleDeg(0, 0, 0), 0);
assert.equal(slipAngleDeg(10, 0, 0), 0);
assert.equal(slipAngleDeg(0, 10, 0), -90);
// Sports trim grips harder than truck trim.
assert(evalTires({ slipRatio: 0.15, profileId: 'sports' }).wetMu > evalTires({ slipRatio: 0.15, profileId: 'truck' }).wetMu);
assert(PROFILE_MU.sedan === 1.0 && PROFILE_MU.truck === 0.9, 'profile trims');
console.log('PASS pacejka — odd formula, realistic peak, dry reference, wet hydroplaning, profile trims');
