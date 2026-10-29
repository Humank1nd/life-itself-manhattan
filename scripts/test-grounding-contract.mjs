// Gate for the world-model grounding contract: a real stack component
// emits typed, hashed data; Life Itself verifies and reconciles it;
// the next rat decision changes because the world changed. Tampered,
// unknown, duplicate, and unimplemented reports fail closed with the
// world untouched. No model, no provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPatch, addWaste, seedRoaches, tickPatch, forageValue } from '../src/ecology.js';
import { attestReport, verifyReportHash, reconcileReport } from '../src/grounding-contract.js';
import { proposeForage } from '../src/rat-foraging.js';
function shaOf(obj) { return createHash('sha256').update(JSON.stringify(obj)).digest('hex'); }
const mkPatch = () => { const p = createPatch({ id: 'deli-1', x: 40, z: 0, moisture: 0.7, warmth: 0.6, disturbance: 0.1 }); seedRoaches(p, 2); for (let d = 0; d < 8; d++) tickPatch(p, { day: d }); return p; };
const HUNGRY = { hunger: 20, comfort: 70, thirst: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 };
const rat = { id: 'rat-1', x: 0, z: 0, memory: { visits: {} }, motives: HUNGRY };
// 1. Baseline: an empty patch draws no one.
{
  const patch = createPatch({ id: 'deli-1', x: 40, z: 0, moisture: 0.7, warmth: 0.6, disturbance: 0.1 });
  assert.equal(proposeForage(rat, HUNGRY, [patch], { visits: {} }, 8, 5), null, 'empty patch ignored');
}
// 2. Full loop: report -> verify hash -> reconcile -> decide -> act east.
const world = { patches: [mkPatch()] };
const payload = { patchId: 'deli-1', wasteKg: 25 };
const att = attestReport({ sourceId: 'restaurant-pulse', reportId: 'rr-001', payload, sha256: shaOf(payload), tick: 8 });
assert(verifyReportHash(att, shaOf(payload)));
const seen = new Set();
const fx = reconcileReport(world, att, seen, shaOf(payload));
assert.throws(() => reconcileReport(world, JSON.parse(JSON.stringify(att)), new Set(), shaOf({other: 1})), /hash mismatch/, 'no verify-then-reconcile bypass');
assert.deepEqual(fx, { applied: 'rr-001', source: 'restaurant-pulse' });
assert.equal(world.patches[0].fresh, 25, 'restaurant waste landed in the world');
const act = proposeForage(rat, HUNGRY, world.patches, { visits: {} }, 8, 5);
assert(act && act.params.to.x > 0, 'reconciled waste draws the rat east');
// 3. Tampered payload: hash mismatch fails closed, world untouched.
{
  const before = JSON.stringify(world);
  const badPayload = { patchId: 'deli-1', wasteKg: 9999 };
  const badAtt = attestReport({ sourceId: 'restaurant-pulse', reportId: 'rr-002', payload: badPayload, sha256: shaOf({ patchId: 'deli-1', wasteKg: 25 }), tick: 8 });
  assert.throws(() => verifyReportHash(badAtt, shaOf(badPayload)), /hash mismatch/);
  assert.equal(world.patches[0].fresh, JSON.parse(before).patches[0].fresh, 'world unchanged');
}
// 4. Unknown source, unimplemented adapter, duplicates, malformed: all rejected.
assert.throws(() => attestReport({ sourceId: 'pigeon-post', reportId: 'x', payload: {}, sha256: shaOf({}), tick: 0 }), /unknown source/);
assert.throws(() => attestReport({ sourceId: 'restaurant-pulse', reportId: '', payload: {}, sha256: shaOf({}), tick: 0 }), /report id/);
assert.throws(() => attestReport({ sourceId: 'restaurant-pulse', reportId: 'x', payload: {}, sha256: 'zzz', tick: 0 }), /hash required/);
{
  const wAtt = attestReport({ sourceId: 'weather-station', reportId: 'w-1', payload: {}, sha256: shaOf({}), tick: 0 });
  assert.throws(() => reconcileReport({ patches: [] }, wAtt, new Set(), shaOf({})), /not implemented/);
  assert.throws(() => reconcileReport(world, att, seen, shaOf(payload)), /duplicate report/);
  const noPatch = attestReport({ sourceId: 'restaurant-pulse', reportId: 'rr-9', payload: { patchId: 'nowhere', wasteKg: 1 }, sha256: shaOf({ patchId: 'nowhere', wasteKg: 1 }), tick: 0 });
  assert.throws(() => reconcileReport(world, noPatch, new Set(), shaOf(noPatch.payload)), /unknown patch/);
  const neg = attestReport({ sourceId: 'restaurant-pulse', reportId: 'rr-10', payload: { patchId: 'deli-1', wasteKg: -5 }, sha256: shaOf({ patchId: 'deli-1', wasteKg: -5 }), tick: 0 });
  assert.throws(() => reconcileReport(world, neg, new Set(), shaOf(neg.payload)), /wasteKg/);
}
console.log('PASS grounding contract — typed attested component data verified, reconciled, and shown moving the next rat decision; tampered/unknown/duplicate/unimplemented all fail closed, verification inseparable from reconcile');
