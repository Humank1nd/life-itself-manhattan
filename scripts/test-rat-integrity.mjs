// Gate for integrity-fault hardening (P017.8a). When the world changes
// but the history does not land, the step reports an explicit fault —
// never an abstention — blocks further consequential actions, and offers
// reconciliation that completes exactly the missing journal stages.
// Faults are injected at each of the three journal stages. Deterministic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, establishAlley } from '../src/living-city.js';
import { hashWorldState, StateJournal } from '../src/journal.js';
import { rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { stepRatAutonomy, reconcileIntegrityFault, journalEntryMatchesStage } from '../src/rat-autonomy.js';
import { snapshotLiveRat, refreshLiveAvailability, renderRatPanelText } from '../src/rat-perception.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const ecoDayOf = (city) => Math.floor(city.tickCount / 288);
function hungryColony() {
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 48 });
  establishAlley(city);
  for (const p of city.pedestrians) p.motives.hunger = 20;
  return city;
}
// Journal sink that throws on the configured 1-based call numbers,
// recording everything it actually accepted. Call counting is exact
// because the autonomy step is the sole writer in these scenarios.
function failingCtx(failOn) {
  let calls = 0;
  const appended = [];
  return { calls: () => calls, appended,
    ctx: { applied: new Set(), ledger: [], lastTick: { n: -1 }, integrity: { fault: null },
      journalAppend: async (type, tick, payload) => {
        calls++;
        if (failOn.has(calls)) throw new Error('journal boom @' + calls);
        appended.push([type, tick, payload]);
      } } };
}
const kinds = (appended) => appended.map(([, , p]) => p.kind);
async function runToAct(city, fctx) {
  for (let n = 0; n < 6; n++) {
    tickLivingCity(city);
    const out = await stepRatAutonomy(city, fctx.ctx, city.tickCount, ecoDayOf(city));
    if (out.status !== 'abstained') return out;
  }
  throw new Error('no action in window');
}

for (const failAt of [1, 2, 3]) {
  const stage = ['decision', 'event', 'effect'][failAt - 1];
  const city = hungryColony();
  const fctx = failingCtx(new Set([failAt]));
  const out = await runToAct(city, fctx);
  // 1. Partial execution is explicit — never an abstention.
  assert.equal(out.status, 'fault', `stage ${stage}: fault, not abstained`);
  assert.equal(out.receipt, null, 'no displayable receipt before reconciliation');
  assert.equal(out.fault.failedStage, stage);
  assert.deepEqual(out.fault.completedStages, ['decision', 'event', 'effect'].slice(0, failAt - 1));
  assert.equal(fctx.ctx.ledger.length, 0, 'ledger withholds unjournaled consequences');
  // The world DID change: applied set sealed, stock down, hunger up.
  assert(fctx.ctx.applied.has(out.event.eventId), 'applied consequence stands');
  const live = Object.fromEntries(city.patches.map((p) => [p.id, p]));
  assert(live[out.event.params.patchId].fresh < (out.event.params.patchId === 'deli-1' ? 1.0 : 0.6),
    'fresh decreased despite journal failure');
  // 2. Further consequential actions are blocked; the panel says fault.
  const freshBefore = JSON.stringify(city.patches);
  const blocked = await stepRatAutonomy(city, fctx.ctx, city.tickCount, ecoDayOf(city));
  assert.equal(blocked.status, 'blocked', 'no second consequence during fault');
  assert.deepEqual(blocked.fault, out.fault);
  assert.equal(JSON.stringify(city.patches), freshBefore, 'blocked step consumes nothing');
  const rat = city.pedestrians.find((p) => p.id === out.event.actorId);
  const view = snapshotLiveRat({ rat, tick: city.tickCount, ecoDay: ecoDayOf(city),
    patches: city.patches, objects: city.objects });
  const text = renderRatPanelText(view, refreshLiveAvailability(view, live, city.tickCount), out.fault);
  assert(text.includes('INTEGRITY FAULT'), 'fault banner rendered');
  assert(text.includes(out.event.eventId), 'banner names the applied event');
  assert(!text.includes('receipt: '), 'no receipt invented during fault');
  // A ledger-only checkpoint would LOSE this event: the detector says so.
  assert.throws(() => verifyRecovery([], fctx.ctx.applied), /missing from log/,
    'unjournaled consequence detected, never silently restorable');
  // 3. Reconciliation completes exactly the missing stages — no duplicates.
  const before = kinds(fctx.appended).join(',');
  const rec = await reconcileIntegrityFault(fctx.ctx);
  assert.equal(rec.status, 'reconciled');
  assert.deepEqual(rec.lateStages, ['decision', 'event', 'effect'].slice(failAt - 1));
  assert.deepEqual(rec.receipt.eventId, out.event.eventId, 'withheld receipt released on reconcile');
  assert.equal(fctx.ctx.integrity.fault, null, 'fault cleared');
  assert.equal(fctx.ctx.ledger.length, 1, 'ledger records the reconciled consequence');
  for (const k of ['rat-decision', 'world-event', 'scavenge-effect']) {
    assert.equal(kinds(fctx.appended).filter((x) => x === k).length, 1, `${k} journaled exactly once`);
  }
  assert(kinds(fctx.appended).includes('rat-reconciliation'), 'late arrival explicitly marked');
  assert(before.split(',').filter(Boolean).length + rec.lateStages.length + 1 === fctx.appended.length,
    'only missing stages plus marker appended');
  // Post-reconcile the colony proceeds: identical continuation, receipts genuine.
  const after = await stepRatAutonomy(city, fctx.ctx, city.tickCount, ecoDayOf(city));
  assert(['acted', 'abstained'].includes(after.status), 'autonomy resumes after reconcile');
  assert.notEqual(after.status, 'blocked');
  // Double reconciliation is rejected, not duplicated.
  await assert.rejects(reconcileIntegrityFault(fctx.ctx), /nothing to reconcile/);
}

// 4. The tick's state hash covers the post-action world.
{
  const city = hungryColony();
  const jj = { applied: new Set(), ledger: [], lastTick: { n: -1 }, integrity: { fault: null },
    journalAppend: async () => {} };
  const h0 = await hashWorldState(citySnapshot(city));
  let acted = null;
  for (let n = 0; n < 6 && !acted; n++) {
    tickLivingCity(city);
    const out = await stepRatAutonomy(city, jj, city.tickCount, ecoDayOf(city));
    if (out.status === 'acted') acted = out;
  }
  assert(acted, 'reference meal occurred');
  const h1 = await hashWorldState(citySnapshot(city));
  assert.notEqual(h0, h1, 'completed tick hash reflects the eaten world');
  assert(city.patches.find((p) => p.id === acted.event.params.patchId).eatenKg > 0, 'hash covers real consumption');
}

console.log('PASS rat integrity — journal faults at all 3 stages become explicit blocked-then-reconciled history, never silent loss, hash covers the acted world');

// ---- P017.8b: repeated and ambiguous failures stay exactly-once ----
// StateJournal-backed sink with two independent fault modes:
//   drop: throw BEFORE appending (genuine miss)
//   landThenThrow: append for real, then throw (ambiguous: stored but reported failed)
// journalHasStage resolves both against actual journal contents.
function journalBacked() {
  const journal = new StateJournal();
  const gate = { drop: new Set(), land: new Set(), calls: 0 };
  const matches = (id) => journal.entries.some((e) => journalEntryMatchesStage(e, id));
  const ctx = { applied: new Set(), ledger: [], lastTick: { n: -1 }, integrity: { fault: null },
    journalAppend: async (type, tick, payload) => {
      gate.calls++;
      if (gate.drop.has(gate.calls)) throw new Error('drop @' + gate.calls);
      const entry = await journal.append(type, tick, payload);
      if (gate.land.has(gate.calls)) throw new Error('post-write callback boom @' + gate.calls);
      return entry;
    },
    journalHasStage: async (id) => matches(id) };
  return { journal, gate, ctx };
}
const countKind = (journal, kind) => journal.entries.filter((e) => e.payload && e.payload.kind === kind).length;
const countMarker = (journal, eventId) => journal.entries.filter((e) =>
  e.payload && e.payload.kind === 'rat-reconciliation' && e.payload.eventId === eventId).length;
async function runToStatus(city, ctx, want, ticks = 6) {
  for (let n = 0; n < ticks; n++) {
    tickLivingCity(city);
    const out = await stepRatAutonomy(city, ctx, city.tickCount, ecoDayOf(city));
    if (out.status === want) return out;
    assert.equal(out.status, 'abstained', `unexpected ${out.status} before ${want}`);
  }
  throw new Error('never reached ' + want);
}

// A. Sequential failures resume instead of repeating.
{
  // A1: decision dropped, then reconcile fails at event: decision lands once.
  const city = hungryColony();
  const jb = journalBacked();
  jb.gate.drop = new Set([1]);
  const f1 = await runToStatus(city, jb.ctx, 'fault');
  assert.deepEqual(f1.fault.completedStages, [], 'nothing landed before the first drop');
  jb.gate.drop = new Set([3]); // reconcile: decision=call2 ok, event=call3 drops
  await assert.rejects(reconcileIntegrityFault(jb.ctx), /missing: event/);
  assert.deepEqual(jb.ctx.integrity.fault.completedStages, ['decision'], 'progress tracked across attempts');
  jb.gate.drop = new Set();
  const rec = await reconcileIntegrityFault(jb.ctx);
  assert.equal(rec.status, 'reconciled');
  assert.equal(countKind(jb.journal, 'rat-decision'), 1, 'decision exactly once across two failures');
  assert.equal(countKind(jb.journal, 'world-event'), 1);
  assert.equal(countKind(jb.journal, 'scavenge-effect'), 1);
  assert.equal(countMarker(jb.journal, f1.event.eventId), 1, 'marker exactly once');
  assert.equal(await jb.journal.verifyChain(), true);
  // A2: reconcile fails at the marker: effect is not re-appended on retry.
  const city2 = hungryColony();
  const jb2 = journalBacked();
  jb2.gate.drop = new Set([3]); // effect dropped at commit
  const f2 = await runToStatus(city2, jb2.ctx, 'fault');
  assert.deepEqual(f2.fault.completedStages, ['decision', 'event']);
  jb2.gate.drop = new Set([4]); // reconcile: effect=call4 drops
  await assert.rejects(reconcileIntegrityFault(jb2.ctx), /missing: effect/);
  assert.deepEqual(jb2.ctx.integrity.fault.completedStages, ['decision', 'event']);
  jb2.gate.drop = new Set();
  await reconcileIntegrityFault(jb2.ctx);
  assert.equal(countKind(jb2.journal, 'scavenge-effect'), 1, 'effect not duplicated by marker retry');
  assert.equal(countMarker(jb2.journal, f2.event.eventId), 1);
  assert.equal(await jb2.journal.verifyChain(), true);
}

// B. Ambiguous failures (stored but reported failed) are adopted, not duplicated.
{
  // B1: decision lands, callback throws: commit continues, no fault at all.
  const city = hungryColony();
  const jb = journalBacked();
  jb.gate.land = new Set([1]);
  const out = await runToStatus(city, jb.ctx, 'acted');
  assert.equal(countKind(jb.journal, 'rat-decision'), 1, 'adopted, not re-appended');
  assert.equal(jb.ctx.integrity.fault, null, 'no fault for a landed stage');
  assert.equal(jb.ctx.ledger.length, 1);
  // B2: effect lands-but-throws during reconcile, then the marker does too.
  const city2 = hungryColony();
  const jb2 = journalBacked();
  jb2.gate.drop = new Set([3]); // genuine miss at commit
  const f = await runToStatus(city2, jb2.ctx, 'fault');
  assert.deepEqual(f.fault.completedStages, ['decision', 'event']);
  jb2.gate.drop = new Set();
  jb2.gate.land = new Set([4, 5]); // effect lands+throws, marker lands+throws
  const rec = await reconcileIntegrityFault(jb2.ctx);
  assert.equal(rec.status, 'reconciled', 'adopted stages resolve the whole chain');
  assert.equal(countKind(jb2.journal, 'scavenge-effect'), 1, 'effect exactly once');
  assert.equal(countMarker(jb2.journal, f.event.eventId), 1, 'marker exactly once');
  assert.deepEqual(rec.lateStages, ['effect'], 'marker names the originally missing stage');
  assert.equal(await jb2.journal.verifyChain(), true);
  assert.equal(jb2.ctx.ledger.length, 1, 'receipt released once');
}

console.log('PASS rat reconciliation — repeated and ambiguous failures stay exactly-once: progress-tracked retries, adopted post-write appends, single marker, verified chain');
