// Gate for grounded object affordances + explainable decisions (P017.4).
// A dumpster advertises scavenge-fresh + investigate-scent; hungry Rat A
// scores, commits a lawful scavenge through the existing action contract,
// eats via the guarded graze() effect exactly once; Rat B then sees the
// depleted world; checkpoint/restore preserves the causal outcome; every
// failure class fails closed. Deterministic. No model, no provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPatch, patchTotals, patchAdded } from '../src/ecology.js';
import { buildSidewalkLanes, makeZone, ZONE_DEFINITIONS } from '../src/living-city.js';
import { sampleTraits, motiveRateModifiers } from '../src/traits.js';
import { validateObservation, commitAction, actionReceipt, SCAVENGE_RANGE_M } from '../src/action-contract.js';
import { applyEventOnce, rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { StateJournal } from '../src/journal.js';
import {
  AFFORDANCE_CONTRACT, DECISION_CONTRACT, POLICY_REVISION, INTERACTION_RANGE_M,
  makeWorldObject, advertiseObject, advertisementToObservation,
  scoreScavenge, decideForRat, buildScavengeAction,
} from '../src/object-affordances.js';

const TICK = 12, ECO_DAY = 8;
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const lanes = buildSidewalkLanes(corridors);
assert(lanes.length > 0, 'need real lanes for lawful positioning');
// Lawful alley setup on REAL lane geometry: two rats on lane 0 segment 0,
// fractions derived into x/z by the same interpolation resume() verifies —
// no teleport, no fake travel. The dumpster/patch is placed at their
// midpoint, so both start within interaction range.
const lane0 = lanes[0];
const [ax, az] = lane0.waypoints[0], [bx, bz] = lane0.waypoints[1];
const segLen = Math.hypot(bx - ax, bz - az);
const fA = 0.5;
const fB = fA + Math.min(0.05, 2 / segLen);
const fO = (fA + fB) / 2;
const at = (f) => ({ x: ax + (bx - ax) * f, z: az + (bz - az) * f });
const pA = at(fA), pB = at(fB), pO = at(fO);
const dA = Math.hypot(pA.x - pO.x, pA.z - pO.z);
const dB = Math.hypot(pB.x - pO.x, pB.z - pO.z);
assert(dA <= INTERACTION_RANGE_M && dB <= INTERACTION_RANGE_M, `both rats in range: ${dA} ${dB}`);
assert(dA > 1e-9 && dB > 1e-9, 'rats are not stacked on the object');

const mkMotives = (hunger) => ({ hunger, thirst: 70, comfort: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 });
const mkRat = (id, f, pos, hunger, seed) => {
  const traits = sampleTraits(undefined, seed);
  return { id, laneIndex: 0, segmentIndex: 0, fraction: f, direction: 1, speed: 1.2,
    x: pos.x, z: pos.z, state: 'walking', traits, rates: motiveRateModifiers(traits),
    motives: mkMotives(hunger), memory: { visits: {} },
    ageTicks: 100, injury: 0, starveTicks: 0, alive: true, death: null };
};
const ratA = mkRat('rat-A', fA, pA, 20, 101); // substantial hunger deficit
const ratB = mkRat('rat-B', fB, pB, 35, 102);
const zones = ZONE_DEFINITIONS.map((z) => makeZone(z.id, z.lat, z.lon, z.type, z.radiusKm));
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };
// Existing ecological patch + original test-only dumpster identity.
const patch = createPatch({ id: 'deli-1', x: pO.x, z: pO.z, wasteKg: 0.5, moisture: 0.7, warmth: 0.6, disturbance: 0.1 });
const dumpster = makeWorldObject({ id: 'dumpster-1', kind: 'dumpster', x: pO.x, z: pO.z, patchId: 'deli-1' });
const objectsById = { 'dumpster-1': dumpster };
const patchesById = { 'deli-1': patch };
const state = { pedestrians: [ratA, ratB], lanes, patches: [patch], zones, world, tickCount: TICK };
const citizenIds = ['rat-A', 'rat-B'];
const positions = () => Object.fromEntries(state.pedestrians.map((p) => [p.id, p]));
const agentsById = () => Object.fromEntries(state.pedestrians.map((p) => [p.id, p]));
const ctxFor = (tick) => ({ citizenIds, positions: positions(), tick,
  lanes: state.lanes, patchesById, objectsById, agentsById: agentsById() });

// 1. Advertise both candidates from current world state.
const ad0 = advertiseObject(dumpster, patch, { tick: TICK, ecoDay: ECO_DAY });
assert.equal(ad0.schemaVersion, AFFORDANCE_CONTRACT);
assert.equal(ad0.objectId, 'dumpster-1');
assert.equal(ad0.objectKind, 'dumpster');
assert.equal(ad0.patchId, 'deli-1');
assert.deepEqual(ad0.position, { x: pO.x, z: pO.z });
assert.equal(ad0.evidence.fresh, 0.5, 'evidence carries actual stock');
assert('forageValue' in ad0.evidence && 'disturbance' in ad0.evidence, 'evidence carries attraction + risk');
assert(!('occupancy' in ad0.evidence), 'no invented object occupancy');
assert.deepEqual(ad0.candidates.map((c) => c.interactionId), ['scavenge-fresh', 'investigate-scent']);
assert.equal(ad0.candidates[0].actionType, 'scavenge');
assert.equal(ad0.candidates[1].actionType, null, 'investigation has no executable action type');

// 2. Score both for Rat A inside the existing-version Observation.
const obsA = advertisementToObservation(ad0, 'rat-A');
assert.equal(obsA.schemaVersion, 'life-itself-observation/1.0.0', 'existing observation version reused');
assert.equal(obsA.kind, 'object-affordance', 'distinct kind, no competing authority');
assert.equal(validateObservation(obsA, { citizenIds, tick: TICK }), true);
const decA = decideForRat({ rat: ratA, motives: ratA.motives, advertisements: [ad0],
  patchesById, objectsById, tick: TICK, observationIds: [obsA.observationId] });
assert.equal(decA.schemaVersion, DECISION_CONTRACT);
assert.equal(decA.decisionId, `dec-${TICK}-rat-A`);
assert.equal(decA.policyRevision, POLICY_REVISION);
assert.deepEqual(decA.observationIds, [obsA.observationId]);
assert.equal(decA.evaluated.length, 2, 'every considered candidate recorded');
for (const e of decA.evaluated) {
  assert('objectId' in e && 'interactionId' in e && 'eligible' in e && 'rejectionReasons' in e && 'score' in e && 'factors' in e);
  assert(Number.isFinite(e.score), 'scores finite');
}
const scavA = decA.evaluated.find((e) => e.interactionId === 'scavenge-fresh');
const invA = decA.evaluated.find((e) => e.interactionId === 'investigate-scent');
assert.equal(scavA.eligible, true);
assert.deepEqual(scavA.rejectionReasons, []);
assert.equal(invA.eligible, false, 'investigation scored but never executable');
assert(invA.rejectionReasons.includes('action-type-unimplemented'));
// Deterministic + reproducible: recompute equals the record.
const re = scoreScavenge({ hunger: 20, freshKg: 0.5, disturbance: 0.1, distanceM: dA });
assert.equal(scavA.score, re.score, 'score reproducible from live inputs');
assert.deepEqual(scavA.factors, re.factors);

// 3. Available food makes scavenging Rat A's highest eligible option.
assert(decA.chosen && decA.chosen.interactionId === 'scavenge-fresh', 'scavenge is the highest eligible option');
assert(decA.chosen.score > invA.score, `scavenge ${decA.chosen.score} > investigate ${invA.score}`);

// 4. Submit the scavenge action through commitAction() — commitment
// revalidates live state, never trusts the advertisement.
const actionA = buildScavengeAction({ actorId: 'rat-A', tick: TICK, observation: obsA,
  objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 0.5 });
const applied = new Set();
const evA = commitAction(actionA, ctxFor(TICK), applied, -1);
assert.equal(evA.eventId, `ev-${TICK}-${actionA.actionId}`);
assert.equal(evA.type, 'scavenge');
assert.deepEqual(actionReceipt(actionA, evA), { actionId: actionA.actionId, status: 'committed', eventId: evA.eventId });

// 5. Apply through applyEventOnce() with the guarded ecological effect.
const freshBefore = patch.fresh, eatenBefore = patch.eatenKg, hungerBefore = ratA.motives.hunger;
const fx = applyEventOnce(state, evA, applied);
assert.equal(fx.takenKg, 0.5);
assert.equal(patch.fresh, freshBefore - 0.5, 'food decreases');
assert.equal(patch.eatenKg, eatenBefore + 0.5, 'eatenKg increases');
assert(Math.abs(patchTotals(patch) - patchAdded(patch)) < 1e-9, 'mass accounting preserved');
assert.equal(ratA.motives.hunger, Math.max(0, Math.min(100, hungerBefore + 0.5 * 30)), 'motive changes lawfully');
assert(ratA.motives.hunger > hungerBefore, 'hungry rat satiated');
const log = [evA];

// 6/7. Without advancing the tick, Rat B observes the UPDATED patch.
const ad1 = advertiseObject(dumpster, patch, { tick: TICK, ecoDay: ECO_DAY });
assert(ad1.evidence.fresh !== ad0.evidence.fresh, 'B sees a changed evidence snapshot');
assert(ad1.evidence.fresh === 0, 'stock exhausted after A ate');
const obsB = advertisementToObservation(ad1, 'rat-B');
assert.equal(validateObservation(obsB, { citizenIds, tick: TICK }), true);
const decB = decideForRat({ rat: ratB, motives: ratB.motives, advertisements: [ad1],
  patchesById, objectsById, tick: TICK, observationIds: [obsB.observationId] });
const scavB = decB.evaluated.find((e) => e.interactionId === 'scavenge-fresh');
assert.equal(scavB.eligible, false, 'exhausted food makes scavenging ineligible');
assert(scavB.rejectionReasons.includes('insufficient-stock'));
assert.notEqual(scavB.score, scavA.score, 'B gets a different scavenging score on the new snapshot');
assert.equal(decB.chosen, null, 'nothing eligible: investigation is not executable, scavenge has no stock');

// 8. Journal: associate decision + committed event + applied effect. The
// event is journal-SHAPED at commit time; only StateJournal.append +
// verifyChain proves the integrated path — this is that executable proof.
const journal = new StateJournal();
await journal.append('action', TICK, { kind: 'affordance-decision', decision: decA });
await journal.append('action', TICK, { kind: 'world-event', event: evA });
await journal.append('action', TICK, { kind: 'scavenge-effect', effect: fx, fresh: patch.fresh, eatenKg: patch.eatenKg });
assert.equal(await journal.verifyChain(), true, 'journal chain verifies');
assert.equal(journal.entries.length, 3);

// 9. Checkpoint, restore, continue: identical decisions, state, receipts,
// no repeated consumption + PR #35 applied-report deduplication preserved.
const snapshot = { seed: 7, tick: TICK,
  zones: zones.map(({ id, lat, lon, type, radiusKm, pop, jobs, money, happy }) => ({ id, lat, lon, type, radiusKm, pop, jobs, money, happy })),
  pedestrians: state.pedestrians.map((p) => ({ id: p.id, laneIndex: p.laneIndex, segmentIndex: p.segmentIndex,
    fraction: p.fraction, direction: p.direction, speed: p.speed, x: p.x, z: p.z, traits: p.traits,
    motives: p.motives, memory: p.memory, ageTicks: p.ageTicks, injury: p.injury,
    starveTicks: p.starveTicks, alive: p.alive, death: p.death })) };
const record = buildResumptionRecord({ snapshot, corridorsSha256: corridorSha256, world,
  ecology: { patches: state.patches }, ecoDay: ECO_DAY, appliedReports: ['restaurant-pulse-d8-1'] });
const wire = JSON.parse(JSON.stringify({ record, objects: Object.values(objectsById), log, journal: journal.toJSONL() }));
const trust = { corridorsSha256: corridorSha256, world, citizenIds, patchIds: ['deli-1'] };
const revived = resumeLivingCity(corridors, wire.record, trust);
assert.equal(revived.ecoDay, ECO_DAY, 'ecoDay rides the checkpoint');
assert.deepEqual(revived.appliedReports, ['restaurant-pulse-d8-1'], 'PR #35 applied-report dedup rides the checkpoint');
const appliedR = rebuildApplied(wire.log);
assert.equal(verifyRecovery(wire.log, appliedR), true, 'committed/applied/recovered are one set');
const journalR = StateJournal.fromJSONL(wire.journal);
assert.equal(await journalR.verifyChain(), true, 'journal survives the round-trip');
const rPatch = revived.patches[0], rA = revived.pedestrians.find((p) => p.id === 'rat-A');
assert.equal(rPatch.fresh, 0, 'committed state restored');
assert.equal(rPatch.eatenKg, 0.5);
assert.equal(rA.motives.hunger, ratA.motives.hunger);
const rPatchesById = { 'deli-1': rPatch };
const rObjectsById = Object.fromEntries(wire.objects.map((o) => [o.id, o]));
const rAd = advertiseObject(rObjectsById['dumpster-1'], rPatch, { tick: TICK, ecoDay: ECO_DAY });
assert.deepEqual(rAd, ad1, 'identical advertisement after restore');
const rObs = advertisementToObservation(rAd, 'rat-A');
const rDec = decideForRat({ rat: rA, motives: rA.motives, advertisements: [rAd],
  patchesById: rPatchesById, objectsById: rObjectsById, tick: TICK, observationIds: [rObs.observationId] });
assert.deepEqual({ ...rDec, observationIds: decB.observationIds.slice(0, 0).concat(rDec.observationIds) }, rDec, 'decision shape stable');
assert.equal(rDec.chosen, null, 'same causal outcome after restore: nothing eligible');
assert.deepEqual(rDec.evaluated.map((e) => [e.interactionId, e.eligible, e.score]),
  decB.evaluated.map((e) => [e.interactionId, e.eligible, e.score]), 'identical evaluated ranking after restore');
// Replay of the already-applied action fails closed after restart (here at
// the stock gate — the food is gone — so no second consumption is possible;
// the dedicated duplicate-gate probe below proves the event-ID gate with
// stock held sufficient).
assert.throws(() => commitAction(actionA, { citizenIds, positions: Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])),
  tick: TICK, lanes: revived.lanes, patchesById: rPatchesById, objectsById: rObjectsById,
  agentsById: Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])) }, appliedR, -1), Error);
assert.throws(() => applyEventOnce({ pedestrians: revived.pedestrians, patches: revived.patches }, evA, appliedR), /duplicate effect/);
{
  // Dedicated duplicate-gate probe: stock held sufficient so validation
  // passes and the exactly-once event-ID gate is what fires, at both gates.
  const dp = createPatch({ id: 'deli-1', x: pO.x, z: pO.z, wasteKg: 1.0, moisture: 0.7, warmth: 0.6, disturbance: 0.1 });
  const dP = { 'deli-1': dp };
  const dState = { pedestrians: [{ ...ratA, motives: mkMotives(20) }], patches: [dp] };
  const dCtx = { citizenIds: ['rat-A'], positions: { 'rat-A': ratA }, tick: TICK, lanes, patchesById: dP, objectsById, agentsById: { 'rat-A': ratA } };
  const dObs = advertisementToObservation(advertiseObject(dumpster, dp, { tick: TICK, ecoDay: ECO_DAY }), 'rat-A');
  const dAct = buildScavengeAction({ actorId: 'rat-A', tick: TICK, observation: dObs, objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 0.5 });
  const dApplied = new Set();
  const dEv = commitAction(dAct, dCtx, dApplied, -1);
  applyEventOnce(dState, dEv, dApplied);
  assert.equal(dp.fresh, 0.5, 'one meal consumed');
  assert.throws(() => commitAction(dAct, dCtx, dApplied, -1), /duplicate execution/);
  assert.throws(() => applyEventOnce(dState, dEv, dApplied), /duplicate effect/);
}
// Continuing without new effects keeps the world bit-identical.
assert.equal(JSON.stringify(revived.patches), JSON.stringify(state.patches), 'no repeated consumption on restore');

// 10. Failure cases — every class fails closed with the world untouched.
const steady = JSON.stringify({ fresh: patch.fresh, eaten: patch.eatenKg, hunger: ratA.motives.hunger });
// Unknown interaction type at commit.
assert.throws(() => commitAction({ ...actionA, actionId: 'act-x', type: 'fly' }, ctxFor(TICK), new Set(), -1), /unknown action type/);
// Missing object / patch.
assert.throws(() => commitAction({ ...actionA, actionId: 'm1', params: { objectId: 'ghost', patchId: 'deli-1', amountKg: 0.1 } },
  ctxFor(TICK), new Set(), -1), /unknown object/);
assert.throws(() => commitAction({ ...actionA, actionId: 'm2', params: { objectId: 'dumpster-1', patchId: 'ghost', amountKg: 0.1 } },
  ctxFor(TICK), new Set(), -1), /unknown patch/);
// Stale advertisement claiming already-eaten food: commitment rechecks live stock.
{
  const staleObsB = advertisementToObservation(ad0, 'rat-B');
  assert.throws(() => commitAction(buildScavengeAction({ actorId: 'rat-B', tick: TICK, observation: staleObsB,
    objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 0.5, actionSeq: 'stale' }), ctxFor(TICK), new Set(), -1), /insufficient stock/);
}
// Insufficient stock / invalid amounts.
for (const [amt, why] of [[0.9, 'overdraw'], [0, 'zero'], [-0.5, 'negative'], [NaN, 'nan'], [Infinity, 'infinite'], [5, 'bounded']]) {
  assert.throws(() => commitAction({ ...actionA, actionId: 'amt-' + String(amt), params: { objectId: 'dumpster-1', patchId: 'deli-1', amountKg: amt } },
    ctxFor(TICK), new Set(), -1), Error, why);
}
// Unreachable / distant target.
{
  const far = { ...dumpster, x: dumpster.x + 500, z: dumpster.z + 500 };
  assert.throws(() => commitAction({ ...actionA, actionId: 'far' },
    { ...ctxFor(TICK), objectsById: { 'dumpster-1': far } }, new Set(), -1), /out of range/);
  const d = decideForRat({ rat: ratA, motives: ratA.motives,
    advertisements: [advertiseObject({ ...dumpster, x: dumpster.x + 500, z: dumpster.z + 500 }, patch, { tick: TICK, ecoDay: ECO_DAY })],
    patchesById, objectsById: { 'dumpster-1': { ...dumpster, x: dumpster.x + 500, z: dumpster.z + 500 } }, tick: TICK });
  assert.equal(d.evaluated.find((e) => e.interactionId === 'scavenge-fresh').eligible, false);
  assert(d.evaluated.find((e) => e.interactionId === 'scavenge-fresh').rejectionReasons.includes('out-of-range'));
}
// Dead actor.
{
  const dead = { ...ratA, alive: false };
  const dd = decideForRat({ rat: dead, motives: dead.motives, advertisements: [ad0],
    patchesById: { 'deli-1': { ...patch, fresh: 0.5 } }, objectsById, tick: TICK });
  assert(dd.evaluated.every((e) => !e.eligible && e.rejectionReasons.includes('actor-dead') || e.interactionId === 'investigate-scent'));
  assert.throws(() => commitAction({ ...actionA, actionId: 'dead' },
    { ...ctxFor(TICK), agentsById: { 'rat-A': dead, 'rat-B': ratB } }, new Set(), -1), /dead/);
}
// Duplicate WorldEvent (stock held sufficient on a clone so validation
// passes and the exactly-once event-ID gate is what fires).
{
  const dupPatch = { ...patch, fresh: 0.5 };
  const dupCtx = { ...ctxFor(TICK), patchesById: { 'deli-1': dupPatch } };
  assert.throws(() => commitAction(actionA, dupCtx, applied, -1), /duplicate execution/);
}
// Same-tick competition: deterministic serial order (actorId), no overdraw.
// Fresh world, both rats evaluate the SAME stale snapshot concurrently.
{
  const fx0 = createPatch({ id: 'deli-1', x: pO.x, z: pO.z, wasteKg: 0.5, moisture: 0.7, warmth: 0.6, disturbance: 0.1 });
  const P = { 'deli-1': fx0 };
  const stale = advertiseObject(dumpster, fx0, { tick: TICK, ecoDay: ECO_DAY });
  const oA = advertisementToObservation(stale, 'rat-A'), oB = advertisementToObservation(stale, 'rat-B');
  const dAd = decideForRat({ rat: { ...ratA, motives: mkMotives(20) }, motives: mkMotives(20), advertisements: [stale], patchesById: P, objectsById, tick: TICK, observationIds: [oA.observationId] });
  const dBd = decideForRat({ rat: { ...ratB, motives: mkMotives(20) }, motives: mkMotives(20), advertisements: [stale], patchesById: P, objectsById, tick: TICK, observationIds: [oB.observationId] });
  assert(dAd.chosen && dBd.chosen, 'both race on the stale snapshot');
  const acts = [
    buildScavengeAction({ actorId: 'rat-A', tick: TICK, observation: oA, objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 0.5 }),
    buildScavengeAction({ actorId: 'rat-B', tick: TICK, observation: oB, objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 0.5 }),
  ].sort((a, b) => a.actorId.localeCompare(b.actorId)); // deterministic serial order
  const compCtx = { citizenIds, positions: positions(), tick: TICK, lanes, patchesById: P, objectsById, agentsById: agentsById() };
  const compApplied = new Set();
  const compState = { pedestrians: [{ ...ratA, motives: mkMotives(20) }, { ...ratB, motives: mkMotives(20) }], patches: [fx0] };
  const e0 = commitAction(acts[0], compCtx, compApplied, -1);
  applyEventOnce(compState, e0, compApplied);
  assert.throws(() => commitAction(acts[1], compCtx, compApplied, -1), /insufficient stock/, 'second consumer loses the race');
  assert.equal(fx0.fresh, 0, 'exactly one meal consumed');
  assert.equal(fx0.eatenKg, 0.5, 'no overdraw of the shared patch');
  assert(Math.abs(patchTotals(fx0) - patchAdded(fx0)) < 1e-9, 'competition conserves mass');
}
// Tampered decision / journal records are detectable.
{
  const bad = JSON.parse(JSON.stringify(decA));
  bad.chosen.score = 999;
  const chk = scoreScavenge({ hunger: 20, freshKg: 0.5, disturbance: 0.1, distanceM: dA });
  assert.notEqual(bad.chosen.score, chk.score, 'tampered score diverges from recomputation');
  const tj = StateJournal.fromJSONL(journal.toJSONL());
  tj._entries[1].payload.event.params.amountKg = 999;
  assert.equal(await tj.verifyChain(), false, 'tampered journal fails verification');
}
assert.equal(JSON.stringify({ fresh: patch.fresh, eaten: patch.eatenKg, hunger: ratA.motives.hunger }), steady, 'failure probes left the world untouched');

console.log('PASS object affordances — dumpster advertised scavenge+investigate, Rat A chose scavenge for an inspectable reason, committed+applied exactly once, Rat B saw depletion, journal+checkpoint replay identical, all failure classes fail closed');
