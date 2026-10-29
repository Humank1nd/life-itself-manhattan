// Gate for the first living decision (P017.8, scavenge-v1). One persistent
// rat per tick, selected in deterministic roster order, observes
// simulation-owned objects and — only when eligible — commits and applies
// a single bounded scavenge through the P017 authority chain. Abstention
// changes nothing; action is journaled with decision, event, effect, and
// genuine receipt; recovery continues identically after restore, rejects
// replays, and detects interrupted execution. Deterministic. No DOM.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, establishAlley } from '../src/living-city.js';
import { SCAVENGE_MIN_KG, SCAVENGE_MAX_KG, commitAction } from '../src/action-contract.js';
import { applyEventOnce, rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { StateJournal } from '../src/journal.js';
import { patchTotals, patchAdded } from '../src/ecology.js';
import { selectRatAction, stepRatAutonomy, HUNGER_ACT_THRESHOLD } from '../src/rat-autonomy.js';
import { snapshotLiveRat, refreshLiveAvailability, renderRatPanelText } from '../src/rat-perception.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };
const SEED = 11, PEDS = 48;
const ecoDayOf = (city) => Math.floor(city.tickCount / 288);

function hungryColony() {
  const city = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
  establishAlley(city);
  for (const p of city.pedestrians) p.motives.hunger = 20;
  return city;
}
function autonomyCtx(journal) {
  const applied = new Set(), ledger = [], lastTick = { n: -1 };
  return { applied, ledger, lastTick, integrity: { fault: null },
    journalAppend: (type, tick, payload) => journal.append(type, tick, payload) };
}
// One uninterrupted reference run: tick the city, step autonomy, collect.
async function runAhead(city, journal, ctx, log, ticks) {
  const firsts = [];
  for (let n = 0; n < ticks; n++) {
    tickLivingCity(city);
    const out = await stepRatAutonomy(city, ctx, city.tickCount, ecoDayOf(city));
    if (out.status === 'acted') {
      log.push(out.event);
      if (firsts.length === 0) firsts.push({ tick: city.tickCount, actor: out.event.actorId, amount: out.effect.takenKg });
    }
  }
  return firsts;
}

// 1. Abstention: satiated colony acts never; the dead never act; nothing moves.
{
  const city = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
  establishAlley(city);
  const journal = new StateJournal();
  const ctx = autonomyCtx(journal);
  for (let n = 0; n < 5; n++) {
    tickLivingCity(city);
    assert.deepEqual(await stepRatAutonomy(city, ctx, city.tickCount, ecoDayOf(city)), { status: 'abstained' });
  }
  assert.equal(ctx.ledger.length, 0, 'no ledger without action');
  assert.equal(journal.entries.length, 0, 'no journal without action');
  assert.equal(HUNGER_ACT_THRESHOLD, 60, 'abstention follows the forage convention');
  // Frozen satiated city: autonomy steps change nothing at all.
  {
    const still = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
    establishAlley(still);
    const frozen = JSON.stringify(citySnapshot(still));
    const jj = new StateJournal();
    const cc = autonomyCtx(jj);
    for (let n = 0; n < 3; n++) {
      assert.deepEqual(await stepRatAutonomy(still, cc, 0, 0), { status: 'abstained' });
    }
    assert.equal(JSON.stringify(citySnapshot(still)), frozen, 'abstention is side-effect free');
    assert.equal(jj.entries.length, 0);
  }
  const dead = createLivingCity(corridors, { seed: SEED, pedestrians: 4 });
  establishAlley(dead);
  const freshPatches = JSON.stringify(dead.patches);
  for (const p of dead.pedestrians) { p.alive = false; p.motives.hunger = 0; }
  const j2 = new StateJournal();
  assert.deepEqual(await stepRatAutonomy(dead, autonomyCtx(j2), 0, 0), { status: 'abstained' });
  assert.equal(JSON.stringify(dead.patches), freshPatches, 'dead colony leaves food untouched');
}

// 2. Liveness: a hungry colony eats — bounded, lawful, deterministic.
const journal = new StateJournal();
const city = hungryColony();
const ctx = autonomyCtx(journal);
const log = [];
const firsts = await runAhead(city, journal, ctx, log, 12);
assert(firsts.length > 0, 'at least one autonomous meal in 12 ticks');
assert.equal(firsts[0].tick, 3, 'first meal tick deterministic');
assert.equal(firsts[0].actor, 'ped_45', 'first actor deterministic in roster order');
assert(firsts[0].amount >= SCAVENGE_MIN_KG && firsts[0].amount <= SCAVENGE_MAX_KG, 'bounded amount');
assert.equal(log.length, ctx.ledger.length, 'one ledger entry per committed event');
assert(log.length <= 12, 'at most one action per tick');
for (const p of city.patches) assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-9, 'mass conserved on ' + p.id);
const eater = city.pedestrians.find((p) => p.id === firsts[0].actor);
assert(eater.motives.hunger > 20, 'actor satiated by its own meal');
assert.equal(await journal.verifyChain(), true, 'real consequences journaled');
for (const e of log) assert(ctx.applied.has(e.eventId), 'every committed event applied once');
// Deterministic rerun: same seed, same first meal.
{
  const cityB = hungryColony();
  const journalB = new StateJournal();
  const firstsB = await runAhead(cityB, journalB, autonomyCtx(journalB), [], 12);
  assert.deepEqual(firstsB, firsts, 'autonomy deterministic across rebuilds');
}

// 3. Panel shows the living outcome: genuine receipt only, or honest none.
{
  const led = ctx.ledger[0];
  const withReceipt = snapshotLiveRat({ rat: eater, tick: city.tickCount, ecoDay: ecoDayOf(city),
    patches: city.patches, objects: city.objects, receipts: [led.receipt] });
  const text = renderRatPanelText(withReceipt, refreshLiveAvailability(withReceipt,
    Object.fromEntries(city.patches.map((p) => [p.id, p])), city.tickCount));
  assert(text.includes(`receipt: ${led.receipt.actionId} → committed ${led.receipt.eventId}`),
    'genuine receipt rendered verbatim');
  assert(text.includes('[simulated]'), 'provenance shown');
  const bare = snapshotLiveRat({ rat: eater, tick: city.tickCount, ecoDay: ecoDayOf(city),
    patches: city.patches, objects: city.objects });
  assert(renderRatPanelText(bare, null).includes('receipts: none — viewing only'), 'no invented receipts');
}

// 4. Recovery: checkpoint mid-appetite, restore, continue identically;
// replays rejected; interruption detected, never silently absorbed.
{
  const K = 6, N = 18;
  const refCity = hungryColony();
  const refJournal = new StateJournal();
  const refCtx = autonomyCtx(refJournal);
  const refLog = [];
  await runAhead(refCity, refJournal, refCtx, refLog, N);
  const refFinal = JSON.stringify(citySnapshot(refCity));

  const cutCity = hungryColony();
  const cutJournal = new StateJournal();
  const cutCtx = autonomyCtx(cutJournal);
  const cutLog = [];
  await runAhead(cutCity, cutJournal, cutCtx, cutLog, K);
  const record = buildResumptionRecord({ snapshot: citySnapshot(cutCity), corridorsSha256: corridorSha256,
    world, ecology: { patches: cutCity.patches }, ecoDay: ecoDayOf(cutCity),
    appliedReports: [], objects: cutCity.objects });
  const trust = { corridorsSha256: corridorSha256, world,
    citizenIds: cutCity.pedestrians.map((p) => p.id), patchIds: ['deli-1', 'deli-2'],
    objectIds: ['dumpster-1', 'dumpster-2'], objects: cutCity.objects };
  const wire = JSON.parse(JSON.stringify({ record, log: cutLog, journal: cutJournal.toJSONL() }));
  const revived = resumeLivingCity(corridors, wire.record, trust);
  const revivedApplied = rebuildApplied(wire.log);
  assert.equal(verifyRecovery(wire.log, revivedApplied), true);
  const revivedJournal = StateJournal.fromJSONL(wire.journal);
  assert.equal(await revivedJournal.verifyChain(), true);
  // Continue the restored world with a fresh autonomy context over the
  // rebuilt exactly-once set — the causal future must match the reference.
  const contCtx = { applied: revivedApplied, ledger: [], lastTick: { n: K }, integrity: { fault: null },
    journalAppend: (t, k, p) => revivedJournal.append(t, k, p) };
  const revivedState = { ...revived, tickCount: revived.tickCount };
  const contLog = [];
  for (let n = K; n < N; n++) {
    tickLivingCity(revivedState);
    const out = await stepRatAutonomy(revivedState, contCtx, revivedState.tickCount, ecoDayOf(revivedState));
    if (out.status === 'acted') contLog.push(out.event);
  }
  assert.deepEqual(contLog.map((e) => [e.tick, e.actionId, e.actorId, e.params]),
    refLog.slice(cutLog.length).map((e) => [e.tick, e.actionId, e.actorId, e.params]),
    'identical causal future after restore');
  assert.equal(JSON.stringify(citySnapshot(revivedState)), refFinal, 'identical world state after restore');
  // Replay of an already-applied event fails at both gates after restore.
  // The replay context is validation-green (actor at the object, stock
  // sufficient on a clone) so the exactly-once gate is what fires — the
  // world itself is untouched by the probe.
  if (cutLog.length > 0) {
    const replay = cutLog[0];
    const rp = replay.params;
    const rObj = revived.objects.find((o) => o.id === rp.objectId);
    const rPatch = { ...revived.patches.find((p) => p.id === rp.patchId), fresh: rp.amountKg };
    const rCtx = { citizenIds: revived.pedestrians.map((p) => p.id),
      positions: { ...Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])), [replay.actorId]: { x: rObj.x, z: rObj.z } },
      tick: replay.tick, lanes: revived.lanes,
      patchesById: { ...Object.fromEntries(revived.patches.map((p) => [p.id, p])), [rp.patchId]: rPatch },
      objectsById: Object.fromEntries(revived.objects.map((o) => [o.id, o])),
      agentsById: Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])) };
    assert.throws(() => commitAction({ schemaVersion: 'life-itself-action/1.0.0', actionId: replay.actionId,
      actorId: replay.actorId, tick: replay.tick, type: 'scavenge',
      params: { ...replay.params }, basis: [] }, rCtx, revivedApplied, -1), /duplicate execution/);
    assert.throws(() => applyEventOnce(revived, replay, revivedApplied), /duplicate effect/);
  }
  // Interrupted execution: commit without apply is DETECTED, not repaired.
  {
    const probeCity = hungryColony();
    const sel = selectRatAction(probeCity, 0, 0);
    // Force eligibility deterministically: first hungry roster rat near food.
    if (sel) {
      const pCtx = { citizenIds: probeCity.pedestrians.map((p) => p.id),
        positions: Object.fromEntries(probeCity.pedestrians.map((p) => [p.id, p])),
        tick: 0, lanes: probeCity.lanes,
        patchesById: Object.fromEntries(probeCity.patches.map((p) => [p.id, p])),
        objectsById: Object.fromEntries(probeCity.objects.map((o) => [o.id, o])),
        agentsById: Object.fromEntries(probeCity.pedestrians.map((p) => [p.id, p])) };
      const crashed = commitAction(sel.action, pCtx, new Set(), -1);
      assert.throws(() => verifyRecovery([crashed], new Set()), /never applied/,
        'commit-without-apply detected');
    }
  }
}

console.log('PASS rat autonomy — one hungry rat per tick eats lawfully or the colony abstains, receipts are genuine, restore continues identically, replays rejected, interruption detected');
