// Gate for the world-model grounding contract: a real stack component
// emits typed, hashed data; Life Itself verifies and reconciles it;
// the next rat decision changes because the world changed. Tampered,
// unknown, duplicate, and unimplemented reports fail closed with the
// world untouched. No model, no provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPatch, addWaste, seedRoaches, tickPatch, forageValue, patchTotals, patchAdded } from '../src/ecology.js';
import { attestReport, verifyReportHash, reconcileReport } from '../src/grounding-contract.js';
import { restaurantPulse, sanitationDue, reportIdFor } from '../src/grounding-producer.js';
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
// 2. Full loop: producer emits -> hash -> attest -> verify -> reconcile -> decide east.
const world = { patches: [mkPatch()] };
const payload = restaurantPulse({ patchId: 'deli-1', wasteKg: 25, day: 8, seq: 1 });
const att = attestReport({ sourceId: 'restaurant-pulse', reportId: reportIdFor('restaurant-pulse', 8, 1), payload, sha256: shaOf(payload), tick: 8 });
assert(verifyReportHash(att, shaOf(payload)));
const seen = new Set();
const fx = reconcileReport(world, att, seen, shaOf(payload));
assert.throws(() => reconcileReport(world, JSON.parse(JSON.stringify(att)), new Set(), shaOf({other: 1})), /hash mismatch/, 'no verify-then-reconcile bypass');
assert.deepEqual(fx, { applied: 'restaurant-pulse-d8-1', source: 'restaurant-pulse' });
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
assert.deepEqual(sanitationDue(7), true);
assert.deepEqual(sanitationDue(8), false);
assert.throws(() => restaurantPulse({ patchId: '', wasteKg: 1, day: 0, seq: 0 }), /patchId/);
assert.throws(() => sanitationDue(-1), /non-negative/);
  const noPatch = attestReport({ sourceId: 'restaurant-pulse', reportId: 'rr-9', payload: { patchId: 'nowhere', wasteKg: 1 }, sha256: shaOf({ patchId: 'nowhere', wasteKg: 1 }), tick: 0 });
  assert.throws(() => reconcileReport(world, noPatch, new Set(), shaOf(noPatch.payload)), /unknown patch/);
  const neg = attestReport({ sourceId: 'restaurant-pulse', reportId: 'rr-10', payload: { patchId: 'deli-1', wasteKg: -5 }, sha256: shaOf({ patchId: 'deli-1', wasteKg: -5 }), tick: 0 });
  assert.throws(() => reconcileReport(world, neg, new Set(), shaOf(neg.payload)), /wasteKg/);
}
// 5. Sanitation adapter: verified, reconciled, mass-accounted; every
// malformed class fails closed. The producer stays simulation-labeled.
{
  const { sanitationPulse, sanitationReportId } = await import('../src/grounding-producer.js');
  assert.throws(() => sanitationPulse({ patchId: '', day: 7, seq: 0 }), /patchId/);
  assert.throws(() => sanitationPulse({ patchId: 'deli-1', day: 0, seq: 0 }), /positive integer/);
  const mkWorldAt = (day) => {
    const p = createPatch({ id: 'deli-1', x: 0, z: 0, moisture: 0.8, warmth: 0.7, disturbance: 0.1 });
    addWaste(p, 4); seedRoaches(p, 2);
    for (let d = 0; d <= day; d++) tickPatch(p, { day: d });
    return { patches: [p] };
  };
  const payload = sanitationPulse({ patchId: 'deli-1', day: 7, seq: 0 });
  assert.deepEqual(payload.provenance, 'simulated', 'no real-world claim smuggled in');
  const id = sanitationReportId(7, 'deli-1');
  const att = attestReport({ sourceId: 'sanitation-schedule', reportId: id, payload, sha256: shaOf(payload), tick: 7 });
  const w = mkWorldAt(7);
  const before = patchTotals(w.patches[0]);
  assert(w.patches[0].fresh > 0 || w.patches[0].rot > 0 || w.patches[0].biomass > 0, 'fixture carries mass to remove');
  const bioBefore = w.patches[0].biomass;
  const seen = new Set();
  const fx = reconcileReport(w, att, seen, shaOf(payload));
  assert.deepEqual(fx, { applied: id, source: 'sanitation-schedule' });
  assert.equal(w.patches[0].fresh, 0, 'fresh cleared');
  assert.equal(w.patches[0].rot, 0, 'rot cleared');
  assert(w.patches[0].biomass >= 0 && w.patches[0].biomass < bioBefore, 'refuge fraction survives, smaller than before');
  assert(Math.abs(patchTotals(w.patches[0]) - patchAdded(w.patches[0])) < 1e-9, 'removal conserves: mass booked to removedKg');
  assert(seen.has(id), 'report id recorded');
  // Duplicates, tampering, unknown patches, day violations: all rejected.
  assert.throws(() => reconcileReport(w, att, seen, shaOf(payload)), /duplicate report/);
  const tampered = { ...JSON.parse(JSON.stringify(att)) };
  assert.throws(() => reconcileReport(mkWorldAt(7), tampered, new Set(), shaOf({ other: 1 })), /hash mismatch/);
  const ghost = sanitationPulse({ patchId: 'ghost', day: 7, seq: 0 });
  const gAtt = attestReport({ sourceId: 'sanitation-schedule', reportId: sanitationReportId(7, 'ghost'), payload: ghost, sha256: shaOf(ghost), tick: 7 });
  assert.throws(() => reconcileReport(mkWorldAt(7), gAtt, new Set(), shaOf(ghost)), /unknown patch/);
  const mkDay = (day) => {
    const q = sanitationPulse({ patchId: 'deli-1', day, seq: 0 });
    return attestReport({ sourceId: 'sanitation-schedule', reportId: 'sanitation-schedule-d' + day + '-deli-1', payload: q, sha256: shaOf(q), tick: day });
  };
  assert.throws(() => reconcileReport(mkWorldAt(7), mkDay(6), new Set(), shaOf(mkDay(6).payload)), /stale sanitation report/);
  assert.throws(() => reconcileReport(mkWorldAt(7), mkDay(9), new Set(), shaOf(mkDay(9).payload)), /future sanitation report/);
  const unsched = sanitationPulse({ patchId: 'deli-1', day: 8, seq: 0 });
  const uAtt = attestReport({ sourceId: 'sanitation-schedule', reportId: sanitationReportId(8, 'deli-1'), payload: unsched, sha256: shaOf(unsched), tick: 8 });
  assert.throws(() => reconcileReport(mkWorldAt(8), uAtt, new Set(), shaOf(unsched)), /unscheduled/);
  const alias = sanitationPulse({ patchId: 'deli-1', day: 7, seq: 0 });
  const aAtt = attestReport({ sourceId: 'sanitation-schedule', reportId: 'sanitation-schedule-d7-deli-1-ALIAS', payload: alias, sha256: shaOf(alias), tick: 7 });
  assert.throws(() => reconcileReport(mkWorldAt(7), aAtt, new Set(), shaOf(alias)), /canonical/);
  const noground = { patchId: 'deli-1', day: 7, seq: 0, provenance: 'grounded' };
  const nAtt = attestReport({ sourceId: 'sanitation-schedule', reportId: sanitationReportId(7, 'deli-1'), payload: noground, sha256: shaOf(noground), tick: 7 });
  assert.throws(() => reconcileReport(mkWorldAt(7), nAtt, new Set(), shaOf(noground)), /simulation-labeled/);
}
console.log('PASS grounding contract — typed attested component data verified, reconciled, and shown moving the next rat decision; tampered/unknown/duplicate/unimplemented all fail closed, verification inseparable from reconcile');
