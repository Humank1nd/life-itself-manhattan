// Gate for persistent object identity + multi-object decisions (P017.5).
// Two dumpsters on different patches: the rat prefers the richer, safer,
// nearer one for an inspectable reason; lawful consumption of that patch
// reverses the ranking toward the second dumpster. The world-object roster
// (with revisions) rides the checkpoint alongside patches and applied
// reports; missing, substituted, revised, or patch-link-broken objects are
// rejected on restore. Deterministic. No model, no provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPatch, patchTotals, patchAdded } from '../src/ecology.js';
import { buildSidewalkLanes, makeZone, ZONE_DEFINITIONS } from '../src/living-city.js';
import { sampleTraits, motiveRateModifiers } from '../src/traits.js';
import { validateObservation, commitAction, actionReceipt } from '../src/action-contract.js';
import { applyEventOnce, rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { StateJournal } from '../src/journal.js';
import {
  INTERACTION_RANGE_M, makeWorldObject, reviseObject,
  advertiseObject, advertisementToObservation,
  decideForRat, buildScavengeAction,
} from '../src/object-affordances.js';

const TICK = 21, ECO_DAY = 9;
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const lanes = buildSidewalkLanes(corridors);
assert(lanes.length > 0, 'need real lanes for lawful positioning');
// Lawful alley on REAL lane geometry: one rat on lane 0 segment 0, two
// dumpsters straddling it — near/rich/safe east, farther/poorer/noisier
// west — both within interaction range, no teleport, no fake travel.
const lane0 = lanes[0];
const [ax, az] = lane0.waypoints[0], [bx, bz] = lane0.waypoints[1];
const segLen = Math.hypot(bx - ax, bz - az);
assert(segLen > 8, 'segment must fit rat + two dumpsters in range');
const fR = 0.5;
const fE = fR + 1 / segLen;    // ~1 m east
const fW = fR - 2.5 / segLen;  // ~2.5 m west
assert(fW > 0, 'west dumpster stays on-segment');
const at = (f) => ({ x: ax + (bx - ax) * f, z: az + (bz - az) * f });
const pR = at(fR), pE = at(fE), pW = at(fW);
const dE = Math.hypot(pR.x - pE.x, pR.z - pE.z);
const dW = Math.hypot(pR.x - pW.x, pR.z - pW.z);
assert(dE <= INTERACTION_RANGE_M && dW <= INTERACTION_RANGE_M, `both dumpsters in range: ${dE} ${dW}`);

const traits = sampleTraits(undefined, 201);
const rat = { id: 'rat-A', laneIndex: 0, segmentIndex: 0, fraction: fR, direction: 1, speed: 1.2,
  x: pR.x, z: pR.z, state: 'walking', traits, rates: motiveRateModifiers(traits),
  motives: { hunger: 20, thirst: 70, comfort: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 },
  memory: { visits: {} }, ageTicks: 100, injury: 0, starveTicks: 0, alive: true, death: null };
const zones = ZONE_DEFINITIONS.map((z) => makeZone(z.id, z.lat, z.lon, z.type, z.radiusKm));
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };
// deli-1: rich, quiet; deli-2: poorer, noisier. Both grounded patch state.
const deli1 = createPatch({ id: 'deli-1', x: pE.x, z: pE.z, wasteKg: 1.0, moisture: 0.7, warmth: 0.6, disturbance: 0.1 });
const deli2 = createPatch({ id: 'deli-2', x: pW.x, z: pW.z, wasteKg: 0.6, moisture: 0.7, warmth: 0.6, disturbance: 0.5 });
const dump1 = makeWorldObject({ id: 'dumpster-1', kind: 'dumpster', x: pE.x, z: pE.z, patchId: 'deli-1' });
const dump2 = makeWorldObject({ id: 'dumpster-2', kind: 'dumpster', x: pW.x, z: pW.z, patchId: 'deli-2' });
assert.equal(dump1.rev, 1, 'objects carry a pinned revision from birth');
const objectsById = { 'dumpster-1': dump1, 'dumpster-2': dump2 };
const patchesById = { 'deli-1': deli1, 'deli-2': deli2 };
const state = { pedestrians: [rat], lanes, patches: [deli1, deli2], zones, world, tickCount: TICK };
const citizenIds = ['rat-A'];
const ctxFor = (tick) => ({ citizenIds, positions: { 'rat-A': rat }, tick,
  lanes: state.lanes, patchesById, objectsById, agentsById: { 'rat-A': rat } });

// 1. Both dumpsters advertise from current world state.
const ad1 = advertiseObject(dump1, deli1, { tick: TICK, ecoDay: ECO_DAY });
const ad2 = advertiseObject(dump2, deli2, { tick: TICK, ecoDay: ECO_DAY });
assert.equal(ad1.evidence.freshKg, 1.0);
assert.equal(ad2.evidence.freshKg, 0.6);
const obs1 = advertisementToObservation(ad1, 'rat-A');
const obs2 = advertisementToObservation(ad2, 'rat-A');
assert.equal(validateObservation(obs1, { citizenIds, tick: TICK }), true);
assert.equal(validateObservation(obs2, { citizenIds, tick: TICK }), true);

// 2. The rat prefers dumpster-1, and the record says why.
const dec1 = decideForRat({ rat, motives: rat.motives, advertisements: [ad2, ad1],
  patchesById, objectsById, tick: TICK, observationIds: [obs1.observationId, obs2.observationId] });
assert.equal(dec1.evaluated.length, 4, 'two objects x two candidates');
const get = (o, i) => dec1.evaluated.find((e) => e.objectId === o && e.interactionId === i);
assert(get('dumpster-1', 'scavenge-fresh').eligible, 'rich dumpster eligible');
assert(get('dumpster-2', 'scavenge-fresh').eligible, 'poor dumpster eligible but worse');
assert.equal(get('dumpster-1', 'investigate-scent').eligible, false);
assert.equal(get('dumpster-2', 'investigate-scent').eligible, false);
assert(dec1.chosen && dec1.chosen.objectId === 'dumpster-1' && dec1.chosen.interactionId === 'scavenge-fresh',
  'rat prefers the richer, safer, nearer dumpster');
assert(get('dumpster-1', 'scavenge-fresh').score > get('dumpster-2', 'scavenge-fresh').score,
  `1 deserves it: ${get('dumpster-1', 'scavenge-fresh').score} > ${get('dumpster-2', 'scavenge-fresh').score}`);
assert.deepEqual(get('dumpster-1', 'scavenge-fresh').factors,
  { hungerDeficit: 0.8, foodAvailability: 0.5, safetyFactor: 0.95, distanceFactor: 0.9091 },
  'winning factors are inspectable and exact');

// 3. Lawful consumption of deli-1 through the action contract (max-boundary
// amount: the whole kilogram in one tick).
const action = buildScavengeAction({ actorId: 'rat-A', tick: TICK, observation: obs1,
  objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 1.0 });
const applied = new Set();
const ev = commitAction(action, ctxFor(TICK), applied, -1);
assert.deepEqual(actionReceipt(action, ev), { actionId: action.actionId, status: 'committed', eventId: ev.eventId });
const fx = applyEventOnce(state, ev, applied);
assert.equal(fx.takenKg, 1.0);
assert.equal(deli1.fresh, 0, 'preferred patch eaten bare');
assert.equal(deli1.eatenKg, 1.0);
assert(Math.abs(patchTotals(deli1) - patchAdded(deli1)) < 1e-9, 'mass conserved on the eaten patch');
assert.equal(rat.motives.hunger, 50, 'hunger satiated lawfully (20 + 30)');
const log = [ev];

// 4. Same tick, updated world: the ranking REVERSES toward dumpster-2.
const ad1b = advertiseObject(dump1, deli1, { tick: TICK, ecoDay: ECO_DAY });
const ad2b = advertiseObject(dump2, deli2, { tick: TICK, ecoDay: ECO_DAY });
assert(ad1b.evidence.freshKg !== ad1.evidence.freshKg, 'evidence snapshot changed after eating');
const obs1b = advertisementToObservation(ad1b, 'rat-A');
const obs2b = advertisementToObservation(ad2b, 'rat-A');
const dec2 = decideForRat({ rat, motives: rat.motives, advertisements: [ad1b, ad2b],
  patchesById, objectsById, tick: TICK, observationIds: [obs1b.observationId, obs2b.observationId] });
const get2 = (o, i) => dec2.evaluated.find((e) => e.objectId === o && e.interactionId === i);
assert.equal(get2('dumpster-1', 'scavenge-fresh').eligible, false, 'eaten-bare patch ineligible');
assert(get2('dumpster-1', 'scavenge-fresh').rejectionReasons.includes('insufficient-stock'));
assert.equal(get2('dumpster-2', 'scavenge-fresh').eligible, true);
assert(dec2.chosen && dec2.chosen.objectId === 'dumpster-2', 'ranking reverses on changed grounded evidence');
assert.notDeepEqual(
  dec2.evaluated.map((e) => [e.objectId, e.interactionId, e.eligible, e.score]),
  dec1.evaluated.map((e) => [e.objectId, e.interactionId, e.eligible, e.score]),
  'the two decisions visibly differ');

// 5. Journal the causal chain; the chain verifies.
const journal = new StateJournal();
await journal.append('action', TICK, { kind: 'affordance-decision', decision: dec1 });
await journal.append('action', TICK, { kind: 'world-event', event: ev });
await journal.append('action', TICK, { kind: 'scavenge-effect', effect: fx, fresh: deli1.fresh, eatenKg: deli1.eatenKg });
await journal.append('action', TICK, { kind: 'affordance-decision', decision: dec2 });
assert.equal(await journal.verifyChain(), true);

// 6. Checkpoint pins the object roster + revisions; restore is identical.
const snapshot = { seed: 9, tick: TICK,
  zones: zones.map(({ id, lat, lon, type, radiusKm, pop, jobs, money, happy }) => ({ id, lat, lon, type, radiusKm, pop, jobs, money, happy })),
  pedestrians: state.pedestrians.map((p) => ({ id: p.id, laneIndex: p.laneIndex, segmentIndex: p.segmentIndex,
    fraction: p.fraction, direction: p.direction, speed: p.speed, x: p.x, z: p.z, traits: p.traits,
    motives: p.motives, memory: p.memory, ageTicks: p.ageTicks, injury: p.injury,
    starveTicks: p.starveTicks, alive: p.alive, death: p.death })) };
const record = buildResumptionRecord({ snapshot, corridorsSha256: corridorSha256, world,
  ecology: { patches: state.patches }, ecoDay: ECO_DAY, appliedReports: ['restaurant-pulse-d9-1'],
  objects: [dump1, dump2] });
assert.equal(record.objects.length, 2, 'roster pinned');
const wire = JSON.parse(JSON.stringify({ record, log, journal: journal.toJSONL() }));
const trust = { corridorsSha256: corridorSha256, world, citizenIds, patchIds: ['deli-1', 'deli-2'],
  objectIds: ['dumpster-1', 'dumpster-2'], objects: [dump1, dump2] };
const revived = resumeLivingCity(corridors, wire.record, trust);
assert.deepEqual(revived.objects, [dump1, dump2], 'objects round-trip exactly');
assert.deepEqual(revived.appliedReports, ['restaurant-pulse-d9-1']);
const rPatches = Object.fromEntries(revived.patches.map((p) => [p.id, p]));
const rObjects = Object.fromEntries(revived.objects.map((o) => [o.id, o]));
const rAd1 = advertiseObject(rObjects['dumpster-1'], rPatches['deli-1'], { tick: TICK, ecoDay: ECO_DAY });
const rAd2 = advertiseObject(rObjects['dumpster-2'], rPatches['deli-2'], { tick: TICK, ecoDay: ECO_DAY });
const rObs1 = advertisementToObservation(rAd1, 'rat-A');
const rObs2 = advertisementToObservation(rAd2, 'rat-A');
const rDec = decideForRat({ rat: revived.pedestrians[0], motives: revived.pedestrians[0].motives,
  advertisements: [rAd1, rAd2], patchesById: rPatches, objectsById: rObjects,
  tick: TICK, observationIds: [rObs1.observationId, rObs2.observationId] });
assert.deepEqual(rDec.evaluated, dec2.evaluated, 'identical ranking after restore');
assert.deepEqual(rDec.chosen, dec2.chosen, 'identical choice after restore');
const appliedR = rebuildApplied(wire.log);
assert.equal(verifyRecovery(wire.log, appliedR), true);
assert.equal((await StateJournal.fromJSONL(wire.journal).verifyChain()), true);
// Replay rejected at both gates (stock clone keeps commit validation green
// so the exactly-once gate is what fires).
{
  const dupCtx = { citizenIds, positions: { 'rat-A': revived.pedestrians[0] }, tick: TICK,
    lanes: revived.lanes, patchesById: { ...rPatches, 'deli-1': { ...rPatches['deli-1'], fresh: 1.0 } },
    objectsById: rObjects, agentsById: { 'rat-A': revived.pedestrians[0] } };
  assert.throws(() => commitAction(action, dupCtx, appliedR, -1), /duplicate execution/);
  assert.throws(() => applyEventOnce({ pedestrians: revived.pedestrians, patches: revived.patches }, ev, appliedR), /duplicate effect/);
}

// 7. Object-tamper classes all fail closed on restore.
{
  const clone = () => JSON.parse(JSON.stringify(record));
  const T = (rec, tr = trust) => resumeLivingCity(corridors, rec, tr);
  const noIds = { ...trust }; delete noIds.objectIds;
  assert.throws(() => T(clone(), noIds), /expected object roster required/, 'missing trust roster fails');
  const dropped = clone(); dropped.objects = [dropped.objects[0]];
  assert.throws(() => T(dropped), /object roster mismatch/, 'dropped object fails');
  const added = clone(); added.objects = [...added.objects, { ...added.objects[0], id: 'dumpster-9' }];
  assert.throws(() => T(added), /object roster mismatch/, 'extra object fails');
  const moved = clone(); moved.objects = moved.objects.map((o) => (o.id === 'dumpster-2' ? { ...o, x: o.x + 50 } : o));
  assert.throws(() => T(moved), /object mismatch: dumpster-2\.x/, 'substituted position fails');
  const relinked = clone(); relinked.objects = relinked.objects.map((o) => (o.id === 'dumpster-2' ? { ...o, patchId: 'deli-1' } : o));
  assert.throws(() => T(relinked), /object mismatch: dumpster-2\.patchId/, 'substituted patch link fails');
  const revved = clone(); revved.objects = revved.objects.map((o) => (o.id === 'dumpster-1' ? { ...o, rev: 99 } : o));
  assert.throws(() => T(revved), /object mismatch: dumpster-1\.rev/, 'silent revision bump fails');
  const badLink = clone(); badLink.objects = badLink.objects.map((o) => (o.id === 'dumpster-2' ? { ...o, patchId: 'nowhere' } : o));
  const trustBadLink = { ...trust, objects: badLink.objects };
  assert.throws(() => T(badLink, trustBadLink), /association broken/, 'dangling patch link fails');
  const dup = clone(); dup.objects = [...dup.objects, { ...dup.objects[0] }];
  assert.throws(() => T(dup), /duplicated restored object/, 'duplicated object fails');
  const badRev = clone(); badRev.objects = badRev.objects.map((o) => (o.id === 'dumpster-1' ? { ...o, rev: -1 } : o));
  assert.throws(() => T(badRev), /revision/, 'negative revision fails');
  assert.throws(() => buildResumptionRecord({ snapshot, corridorsSha256: corridorSha256, world,
    ecology: { patches: state.patches }, objects: [{ ...dump1, rev: 1 }, { ...dump1, rev: 1 }] }),
    /duplicated object/, 'duplicated pin fails at construction');
  // reviseObject is the only lawful mutation: bumps rev, keeps identity.
  const movedLawful = reviseObject(dump2, { x: dump2.x + 1 });
  assert.equal(movedLawful.rev, dump2.rev + 1);
  assert.equal(movedLawful.id, 'dumpster-2');
  assert.throws(() => reviseObject(dump2, { id: 'dumpster-9' }), /immutable/);
  assert.throws(() => reviseObject(dump2, { rev: 99 }), /assigned/);
}

// 8. Pre-P017.5 records (no pinned objects) restore exactly as before.
{
  const legacy = buildResumptionRecord({ snapshot, corridorsSha256: corridorSha256, world, ecology: { patches: state.patches } });
  assert.equal(legacy.objects, null);
  const revivedLegacy = resumeLivingCity(corridors, JSON.parse(JSON.stringify(legacy)),
    { corridorsSha256: corridorSha256, world, citizenIds, patchIds: ['deli-1', 'deli-2'] });
  assert.equal(revivedLegacy.objects, null, 'legacy records skip object checks');
}

console.log('PASS object multi-decision — rat preferred dumpster-1 for an inspectable reason, lawful eating reversed the ranking to dumpster-2, roster+revs pinned and tamper-rejected, legacy restore unchanged');
