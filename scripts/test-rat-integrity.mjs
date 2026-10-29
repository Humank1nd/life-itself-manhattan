// Gate for integrity-fault hardening (P017.8a). When the world changes
// but the history does not land, the step reports an explicit fault —
// never an abstention — blocks further consequential actions, and offers
// reconciliation that completes exactly the missing journal stages.
// Faults are injected at each of the three journal stages. Deterministic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, establishAlley } from '../src/living-city.js';
import { hashWorldState } from '../src/journal.js';
import { rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { stepRatAutonomy, reconcileIntegrityFault } from '../src/rat-autonomy.js';
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
