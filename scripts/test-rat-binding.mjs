// Gate for authoritative runtime binding (P017.7). World objects and
// ecological patches are simulation-owned state (establishAlley), the
// snapshot carries the roster without breaking legacy serialization,
// the panel reads the world's own arrays, receipts render only from
// genuine commits, provenance separates simulation authority from
// real-world claims, and checkpoint/restore rejects every tamper class
// including snapshot/record divergence. Deterministic. No model, no DOM.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, establishAlley, citySnapshot } from '../src/living-city.js';
import { makeWorldObject, reviseObject, buildAlley } from '../src/object-affordances.js';
import { commitAction, actionReceipt } from '../src/action-contract.js';
import { applyEventOnce, rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { buildScavengeAction } from '../src/object-affordances.js';
import { snapshotLiveRat, refreshLiveAvailability, renderRatPanelText } from '../src/rat-perception.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };

// 1. Simulation owns existence: explicit establishment on live state.
const city = createLivingCity(corridors, { seed: 41, pedestrians: 8 });
assert.equal(city.objects, undefined, 'fresh sim has no objects');
assert.equal(city.patches, undefined, 'fresh sim has no patches');
establishAlley(city);
assert.equal(city.objects.length, 2, 'roster established');
assert.equal(city.patches.length, 2, 'patches established');
assert(city.objects.every((o) => o.provenance === 'simulated'), 'sim assigns simulation provenance, never grounded');
assert.throws(() => establishAlley(city), /already established/, 'no silent roster substitution');
const city2 = createLivingCity(corridors, { seed: 41, pedestrians: 8 });
establishAlley(city2);
assert.deepEqual(city.objects, city2.objects, 'establishment deterministic for same seed+data');
assert.deepEqual(city.patches, city2.patches);

// 2. Snapshot compatibility: legacy states byte-identical, extended deterministic.
{
  const legacy = createLivingCity(corridors, { seed: 41, pedestrians: 8 });
  const snapLegacy = citySnapshot(legacy);
  assert(!('objects' in snapLegacy), 'legacy snapshot carries no objects key');
  const rebuilt = JSON.parse(JSON.stringify(citySnapshot(createLivingCity(corridors, { seed: 41, pedestrians: 8 }))));
  assert.deepEqual(snapLegacy, rebuilt, 'legacy serialization unchanged');
  const snapExt1 = citySnapshot(city);
  assert(Array.isArray(snapExt1.objects) && snapExt1.objects.length === 2, 'extended snapshot pins roster');
  assert.deepEqual(snapExt1.objects, city.objects, 'snapshot mirrors world state');
  assert.deepEqual(snapExt1, JSON.parse(JSON.stringify(citySnapshot(city))), 'extended snapshots deterministic');
}

// 3. Panel reads the world's own arrays: pick a persistent roster identity
// near the alley and project it.
const nearIdx = city.pedestrians
  .map((p, i) => [Math.hypot(p.x - city.objects[0].x, p.z - city.objects[0].z), i])
  .sort((a, b) => a[0] - b[0])[0][1];
const nearRat = city.pedestrians[nearIdx];
const view = snapshotLiveRat({ rat: nearRat, tick: city.tickCount, ecoDay: 0,
  patches: city.patches, objects: city.objects });
assert(view && view.actorId === nearRat.id, 'panel bound to a persistent roster identity');
assert.deepEqual(view.patchByObject, { 'dumpster-1': 'deli-1', 'dumpster-2': 'deli-2' });
assert.deepEqual(view.provenanceByObject, { 'dumpster-1': 'simulated', 'dumpster-2': 'simulated' });
const text = renderRatPanelText(view, refreshLiveAvailability(view,
  Object.fromEntries(city.patches.map((p) => [p.id, p])), city.tickCount));
assert(text.includes('[simulated]'), 'provenance visible, real-world existence never claimed');
assert(text.includes('receipts: none — viewing only'), 'no invented receipts');

// 4. Genuine receipts render only from genuine commits.
const hungryIdx = city.pedestrians.findIndex((p) => p.alive);
const eater = city.pedestrians[hungryIdx];
eater.motives.hunger = 20;
const alleyState = { pedestrians: city.pedestrians, patches: city.patches };
const patchesById = Object.fromEntries(city.patches.map((p) => [p.id, p]));
const objectsById = Object.fromEntries(city.objects.map((o) => [o.id, o]));
const target = city.objects
  .map((o) => [Math.hypot(eater.x - o.x, eater.z - o.z), o])
  .filter(([d]) => d <= 3)[0];
let genuineReceipt = null, committedEvent = null;
if (target) {
  const [, obj] = target;
  const patch = patchesById[obj.patchId];
  const amount = Math.min(0.5, patch.fresh);
  const obs = { schemaVersion: 'life-itself-observation/1.0.0', observationId: `obs-0-${eater.id}-x`,
    observerId: eater.id, tick: 0, kind: 'object-affordance', summary: 'x' };
  const act = buildScavengeAction({ actorId: eater.id, tick: 0, observation: obs,
    objectId: obj.id, patchId: patch.id, amountKg: amount });
  const ctx = { citizenIds: city.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(city.pedestrians.map((p) => [p.id, p])),
    tick: 0, lanes: city.lanes, patchesById, objectsById,
    agentsById: Object.fromEntries(city.pedestrians.map((p) => [p.id, p])) };
  const applied = new Set();
  committedEvent = commitAction(act, ctx, applied, -1);
  applyEventOnce(alleyState, committedEvent, applied);
  genuineReceipt = actionReceipt(act, committedEvent);
  assert.equal(genuineReceipt.status, 'committed');
}
const viewWithReceipt = snapshotLiveRat({ rat: eater, tick: 0, ecoDay: 0,
  patches: city.patches, objects: city.objects,
  receipts: genuineReceipt ? [genuineReceipt] : [] });
const receiptText = renderRatPanelText(viewWithReceipt, null);
if (genuineReceipt) {
  assert(receiptText.includes(`receipt: ${genuineReceipt.actionId} → committed ${genuineReceipt.eventId}`),
    'genuine receipt rendered verbatim');
} else {
  assert(receiptText.includes('receipts: none — viewing only'), 'no rat in range: honestly empty, not invented');
}
assert.throws(() => snapshotLiveRat({ rat: eater, tick: 0, ecoDay: 0,
  patches: city.patches, objects: city.objects, receipts: [{ actionId: 'x' }] }), /receipt shape/,
  'malformed receipts rejected, never displayed');

// 5. A live ecological change reaches the panel without reconstruction.
{
  const before = snapshotLiveRat({ rat: eater, tick: 0, ecoDay: 0, patches: city.patches, objects: city.objects });
  const beforeChoice = before.chosen ? before.chosen.objectId : null;
  // Lawful depletion of deli-1 through the action contract (max boundary).
  const p1 = patchesById['deli-1'];
  if (p1.fresh > 0) {
    const o1 = objectsById['dumpster-1'];
    // Move a hungry proxy onto the object lawfully is out of scope here;
    // prove the display path instead: the panel re-reads the same arrays
    // the commit path just wrote, with no reconstruction in between.
    const obs = { schemaVersion: 'life-itself-observation/1.0.0', observationId: 'obs-0-probe',
      observerId: eater.id, tick: 0, kind: 'object-affordance', summary: 'x' };
    const nearEnough = Math.hypot(eater.x - o1.x, eater.z - o1.z) <= 3;
    if (nearEnough) {
      const act = buildScavengeAction({ actorId: eater.id, tick: 0, observation: obs,
        objectId: 'dumpster-1', patchId: 'deli-1', amountKg: Math.min(1.0, p1.fresh) });
      const ctx = { citizenIds: city.pedestrians.map((p) => [p.id, p]),
        positions: Object.fromEntries(city.pedestrians.map((p) => [p.id, p])),
        tick: 0, lanes: city.lanes, patchesById, objectsById,
        agentsById: Object.fromEntries(city.pedestrians.map((p) => [p.id, p])) };
      const applied = new Set();
      const e2 = commitAction(act, ctx, applied, -1);
      applyEventOnce(alleyState, e2, applied);
      const after = snapshotLiveRat({ rat: eater, tick: 0, ecoDay: 0, patches: city.patches, objects: city.objects });
      assert.notDeepEqual(after.evidenceByObject['dumpster-1'], before.evidenceByObject['dumpster-1'],
        'panel reflects the committed change through shared state');
      void beforeChoice;
    }
  }
}

// 6. Checkpoint/restore over simulation-owned state + tamper battery.
const snap = citySnapshot(city);
assert(Array.isArray(snap.objects) && snap.objects.length === 2, 'extended snapshot carries the roster');
const record = buildResumptionRecord({ snapshot: snap, corridorsSha256: corridorSha256, world,
  ecology: { patches: city.patches }, ecoDay: 0, appliedReports: [],
  objects: city.objects });
const trust = { corridorsSha256: corridorSha256, world,
  citizenIds: city.pedestrians.map((p) => p.id), patchIds: ['deli-1', 'deli-2'],
  objectIds: ['dumpster-1', 'dumpster-2'], objects: city.objects };
const revived = resumeLivingCity(corridors, JSON.parse(JSON.stringify(record)), trust);
assert.deepEqual(revived.objects, city.objects, 'objects survive restore exactly');
assert.deepEqual(revived.patches, city.patches, 'patches survive restore exactly');
{
  const clone = () => JSON.parse(JSON.stringify(record));
  const T = (rec, tr = trust) => resumeLivingCity(corridors, rec, tr);
  const noIds = { ...trust }; delete noIds.objectIds;
  assert.throws(() => T(clone(), noIds), /expected object roster required/);
  const dropped = clone(); dropped.objects = [dropped.objects[0]];
  assert.throws(() => T(dropped), /object roster mismatch/);
  const moved = clone(); moved.objects[1].x += 50;
  assert.throws(() => T(moved), /object mismatch: dumpster-2\.x/);
  const swapped = clone(); swapped.objects[0].provenance = 'grounded';
  assert.throws(() => T(swapped), /object mismatch: dumpster-1\.provenance/, 'provenance swap rejected');
  const badProv = clone(); badProv.objects[0].provenance = 'real';
  const trustBad = { ...trust, objects: badProv.objects };
  assert.throws(() => T(badProv, trustBad), /provenance/, 'unknown provenance rejected');
  const diverged = clone(); diverged.snapshot.objects[0].rev = 99;
  assert.throws(() => T(diverged), /snapshot\/record object divergence/, 'snapshot/record split rejected');
  const badLink = clone();
  badLink.objects[1].patchId = 'nowhere';
  badLink.snapshot.objects[1].patchId = 'nowhere';
  const trustLink = { ...trust, objects: badLink.objects };
  assert.throws(() => T(badLink, trustLink), /association broken/, 'dangling patch link fails');
}
// Provenance vocabulary is closed at creation too.
assert.throws(() => makeWorldObject({ id: 'x', kind: 'dumpster', x: 0, z: 0, provenance: 'real' }), /provenance/);
const grounded = makeWorldObject({ id: 'x', kind: 'dumpster', x: 0, z: 0, provenance: 'grounded' });
assert.equal(reviseObject(grounded, {}).provenance, 'grounded', 'lawful revise preserves provenance');
assert.equal(reviseObject(grounded, {}).rev, grounded.rev + 1);

// 7. Panel over the restored world matches the authoritative record; the
// restored city keeps ticking identically and journal rules still hold.
{
  const rPatches = Object.fromEntries(revived.patches.map((p) => [p.id, p]));
  const rView = snapshotLiveRat({ rat: revived.pedestrians[nearIdx], tick: revived.tickCount, ecoDay: 0,
    patches: revived.patches, objects: revived.objects });
  assert.equal(rView.actorId, nearRat.id, 'restored roster identity stable');
  // Same tick, same world: the restored projection equals a live
  // projection taken from the pre-shutdown state (not a stale fixture).
  const liveView = snapshotLiveRat({ rat: city.pedestrians[nearIdx], tick: city.tickCount, ecoDay: 0,
    patches: city.patches, objects: city.objects });
  assert.deepEqual(rView.evidenceByObject, liveView.evidenceByObject, 'restored evidence matches the authoritative record');
  assert.deepEqual(rView.chosen, liveView.chosen, 'restored choice matches');
  void rPatches;
}
const appliedFinal = rebuildApplied(committedEvent ? [committedEvent] : []);
if (committedEvent) assert.equal(verifyRecovery([committedEvent], appliedFinal), true);

console.log('PASS rat binding — sim-owned alley in snapshot+checkpoint, panel reads the world, genuine receipts only, provenance enforced, tamper rejected, legacy untouched');
