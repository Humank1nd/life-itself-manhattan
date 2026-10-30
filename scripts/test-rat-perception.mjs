// Gate for the read-only perception bridge (P017.6). The panel projects
// authoritative rat state to a frozen view model: actor/tick association,
// ranked candidates with rejection reasons, before/after consumption,
// missing/stale handling with no substitution, and proof that viewing,
// selecting, and refreshing mutate nothing — world, scoring, journal, and
// deterministic replay all bit-identical. No DOM: the tested text renderer
// IS the shipped panel wording.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPatch } from '../src/ecology.js';
import { buildSidewalkLanes } from '../src/living-city.js';
import { sampleTraits, motiveRateModifiers } from '../src/traits.js';
import { commitAction, actionReceipt } from '../src/action-contract.js';
import { applyEventOnce, rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { StateJournal } from '../src/journal.js';
import { buildScavengeAction } from '../src/object-affordances.js';
import {
  RAT_VIEW_CONTRACT, NO_DECISION_TEXT, renderRatAbsence,
  buildAlley, snapshotLiveRat, refreshLiveAvailability, renderRatPanelText,
} from '../src/rat-perception.js';

const TICK = 21, ECO_DAY = 9;
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const lanes = buildSidewalkLanes(corridors);

// The module is presentation-only: no DOM globals, no sim imports beyond
// the pure decision path.
{
  const src = readFileSync(new URL('../src/rat-perception.js', import.meta.url), 'utf8');
  assert(!/document|window\.|localStorage|fetch\(/.test(src), 'perception module touches no browser or network APIs');
}

const alley = buildAlley(lanes);
assert.equal(alley.objects.length, 2);
assert.equal(alley.patches.length, 2);
const alley2 = buildAlley(lanes);
assert.deepEqual(alley, alley2, 'alley construction deterministic');
const patchesById = Object.fromEntries(alley.patches.map((p) => [p.id, p]));
const objectsById = Object.fromEntries(alley.objects.map((o) => [o.id, o]));

const traits = sampleTraits(undefined, 301);
// Rat on lane 0 segment 0 midpoint: both dumpsters in range (same layout
// as the P017.5 gate).
const lane0 = lanes[0];
const [ax, az] = lane0.waypoints[0], [bx, bz] = lane0.waypoints[1];
const segLen = Math.hypot(bx - ax, bz - az);
const fR = 0.5;
const rat = { id: 'rat-A', laneIndex: 0, segmentIndex: 0, fraction: fR, direction: 1, speed: 1.2,
  x: ax + (bx - ax) * fR, z: az + (bz - az) * fR, state: 'walking', traits, rates: motiveRateModifiers(traits),
  motives: { hunger: 20, thirst: 70, comfort: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 },
  memory: { visits: {} }, ageTicks: 100, injury: 0, starveTicks: 0, alive: true, death: null };

// 1. Correct actor and tick association.
const view = snapshotLiveRat({ rat, tick: TICK, ecoDay: ECO_DAY, patches: alley.patches, objects: alley.objects });
assert.equal(view.schemaVersion, RAT_VIEW_CONTRACT);
assert.equal(view.actorId, 'rat-A');
assert.equal(view.asOfTick, TICK);
assert.deepEqual(Object.keys(view.evidenceByObject).sort(), ['dumpster-1', 'dumpster-2']);
assert.equal(view.evidenceByObject['dumpster-1'].freshKg, 1.0);
assert(Object.isFrozen(view) && Object.isFrozen(view.evaluated) && Object.isFrozen(view.evidenceByObject), 'view model frozen');
// Frozen enforcement: no write-back path into the sim through the view.
assert.throws(() => { view.actorId = 'rat-X'; }, TypeError, 'frozen view rejects writes');

// 2. Actual ranked candidates and rejection reasons.
assert(view.chosen && view.chosen.objectId === 'dumpster-1', 'rich dumpster chosen live');
const text = renderRatPanelText(view, refreshLiveAvailability(view, patchesById, TICK));
assert(text.includes('rat rat-A · decision tick 21'), 'panel header');
assert(text.includes('dumpster-1 [simulated]: fresh 1kg'), 'evidence line with provenance');
assert(text.includes('ELIGIBLE dumpster-1/scavenge-fresh'), 'ranking line');
assert(text.includes('investigate-scent score') && text.includes('action-type-unimplemented'), 'rejection reasons shown');
assert(text.includes('chosen: dumpster-1/scavenge-fresh'), 'choice line');
assert(text.includes('no actions committed from this panel'), 'read-only disclosure');

// 3. Accurate before/after consumption display.
const state = { pedestrians: [rat], lanes, patches: alley.patches };
const obsId = `obs-${TICK}-rat-A-adv-dumpster-1-t${TICK}`;
const action = buildScavengeAction({ actorId: 'rat-A', tick: TICK,
  observation: { schemaVersion: 'life-itself-observation/1.0.0', observationId: obsId, observerId: 'rat-A', tick: TICK, kind: 'object-affordance', summary: 'x' },
  objectId: 'dumpster-1', patchId: 'deli-1', amountKg: 1.0 });
const applied = new Set();
const ctx = { citizenIds: ['rat-A'], positions: { 'rat-A': rat }, tick: TICK, lanes,
  patchesById, objectsById, agentsById: { 'rat-A': rat } };
const ev = commitAction(action, ctx, applied, -1);
assert.deepEqual(actionReceipt(action, ev).status, 'committed');
applyEventOnce(state, ev, applied);
const viewAfter = snapshotLiveRat({ rat, tick: TICK, ecoDay: ECO_DAY, patches: alley.patches, objects: alley.objects });
assert(viewAfter.chosen && viewAfter.chosen.objectId === 'dumpster-2', 'panel tracks the reversal');
const live = refreshLiveAvailability(view, patchesById, TICK + 1);
assert.equal(live.stale, true, 'advanced tick marks the old snapshot historical');
assert.deepEqual(live.changed, ['dumpster-1'], 'consumed patch flagged changed');
assert.deepEqual(live.unknown, [], 'nothing unknown while roster intact');
const staleText = renderRatPanelText(view, live);
assert(staleText.includes('historical snapshot from tick 21'), 'stale banner names both ticks');
assert(staleText.includes('live now 0kg'), 'current truth alongside, snapshot not passed off as current');

// 4. Missing-data and stale-data handling: no substitution, no crash.
assert.equal(snapshotLiveRat({ rat: null, tick: TICK, ecoDay: ECO_DAY, patches: alley.patches, objects: alley.objects }), null);
assert.equal(renderRatPanelText(null, null), NO_DECISION_TEXT);
assert.equal(renderRatPanelText(null, null), 'No rat decision available');
const unread = renderRatAbsence({ cityLoaded: false });
const colonyDead = renderRatAbsence({ cityLoaded: true, livingCount: 0, deadCount: 4, committedCount: 2 });
const readFailed = renderRatAbsence({ cityLoaded: true, livingCount: 1, actorId: 'ped_89', readError: 'perception: snapshot needs a tick' });
assert.notEqual(unread, NO_DECISION_TEXT);
assert.notEqual(colonyDead, NO_DECISION_TEXT);
assert.notEqual(readFailed, NO_DECISION_TEXT);
assert.ok(colonyDead.includes('Dead on the roster: 4'));
assert.ok(colonyDead.includes('2 committed decision(s)') && colonyDead.includes('not a live reading'));
assert.ok(readFailed.includes('ped_89') && readFailed.includes('missing information') && !readFailed.includes(NO_DECISION_TEXT));
assert.ok(unread.includes('not loaded'));
{
  const gone = { ...patchesById };
  delete gone['deli-2'];
  const lv = refreshLiveAvailability(viewAfter, gone, TICK);
  assert.deepEqual(lv.unknown, ['dumpster-2'], 'vanished patch reads unknown');
  assert(lv.liveFreshByObject['dumpster-2'] === 'unknown', 'no zero-substitution');
  const t = renderRatPanelText(viewAfter, lv);
  assert(t.includes('live stock unknown'), 'panel says unknown');
}
assert.throws(() => snapshotLiveRat({ rat, tick: -1, ecoDay: ECO_DAY, patches: alley.patches, objects: alley.objects }), /tick/);
assert.throws(() => refreshLiveAvailability(view, patchesById, -1), /tick/);
assert.throws(() => refreshLiveAvailability({ schemaVersion: 'x' }, patchesById, TICK), /view model/);

// 5. Viewing, selecting, and refreshing mutate nothing: world, scoring,
// journal, and deterministic replay all bit-identical across cycles.
const journal = new StateJournal();
await journal.append('action', TICK, { kind: 'world-event', event: ev });
const before = JSON.stringify({ patches: alley.patches, rat: rat.motives }) + journal.toJSONL();
for (let i = 0; i < 3; i++) {
  const v = snapshotLiveRat({ rat, tick: TICK + i, ecoDay: ECO_DAY, patches: alley.patches, objects: alley.objects });
  refreshLiveAvailability(v, patchesById, TICK + i);
  renderRatPanelText(v, refreshLiveAvailability(v, patchesById, TICK + i));
}
assert.equal(JSON.stringify({ patches: alley.patches, rat: rat.motives }) + journal.toJSONL(), before, 'read cycles leave no trace');
assert(Math.abs(alley.patches[0].fresh - 0) < 1e-12 && Math.abs(alley.patches[1].fresh - 0.6) < 1e-12, 'stock untouched by viewing');
assert.equal(await journal.verifyChain(), true);
const appliedR = rebuildApplied([ev]);
assert.equal(verifyRecovery([ev], appliedR), true);
assert.throws(() => commitAction(action, ctx, applied, -1), Error, 'replay still rejected after viewing');
assert.throws(() => applyEventOnce(state, ev, applied), /duplicate effect/);

// 6. Checkpoint round-trip with the panel reading the restored world.
{
  const snapshot = { seed: 9, tick: TICK,
    zones: [],
    pedestrians: [{ ...rat, traits: rat.traits, motives: rat.motives, memory: rat.memory }] };
  // Minimal zones still required by resume; reuse real definitions.
  const { makeZone, ZONE_DEFINITIONS } = await import('../src/living-city.js');
  snapshot.zones = ZONE_DEFINITIONS.map((z) => makeZone(z.id, z.lat, z.lon, z.type, z.radiusKm));
  const record = buildResumptionRecord({ snapshot, corridorsSha256: corridorSha256,
    world: { traffic: 'green', weather: 'good', disasters: [], servicesNear: true },
    ecology: { patches: alley.patches }, ecoDay: ECO_DAY, objects: alley.objects });
  const trust = { corridorsSha256: corridorSha256,
    world: { traffic: 'green', weather: 'good', disasters: [], servicesNear: true },
    citizenIds: ['rat-A'], patchIds: ['deli-1', 'deli-2'],
    objectIds: ['dumpster-1', 'dumpster-2'], objects: alley.objects };
  const revived = resumeLivingCity(corridors, JSON.parse(JSON.stringify(record)), trust);
  const rView = snapshotLiveRat({ rat: revived.pedestrians[0], tick: TICK, ecoDay: revived.ecoDay,
    patches: revived.patches, objects: revived.objects });
  assert.deepEqual(rView.evaluated, viewAfter.evaluated, 'restored world projects the identical panel');
  assert.deepEqual(rView.chosen, viewAfter.chosen);
}

console.log('PASS rat perception — frozen live view with actor/tick binding, ranked reasons, before/after + stale handling, zero mutation from viewing, restore-identical panel');
