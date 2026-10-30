// Gate for scheduled sanitation (P017.9-S02). On a due ecological day the
// sim-owned alley is collected through attested reports: validated as a
// complete batch, computed on copies, published once, journaled with mass
// deltas, deduplicated by canonical report IDs. A failed journal becomes
// an explicit fault that blocks further collection until reconciled;
// validation failures change nothing. Deterministic. No DOM.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, establishAlley } from '../src/living-city.js';
import { addWaste, seedRoaches, patchTotals, patchAdded } from '../src/ecology.js';
import { attestReport, reconcileReport } from '../src/grounding-contract.js';
import { sanitationPulse, sanitationReportId, sanitationDue } from '../src/grounding-producer.js';
import { dueSanitationReports, attestSanitationReports, commitSanitationBatch, reconcileSanitation, journalEntryMatchesSanitation } from '../src/sanitation.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { StateJournal, canonical } from '../src/journal.js';
import { snapshotLiveRat } from '../src/rat-perception.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };
const shaOf = (obj) => createHash('sha256').update(canonical(obj), 'utf8').digest('hex');
const hashHex = async (s) => createHash('sha256').update(s, 'utf8').digest('hex');
function stockedAlley() {
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  establishAlley(city);
  addWaste(city.patches[0], 4); seedRoaches(city.patches[0], 2);
  addWaste(city.patches[1], 3); seedRoaches(city.patches[1], 1);
  return city;
}
function sanCtx(journal, failOn = new Set(), landThenThrow = new Set()) {
  let calls = 0;
  return { calls: () => calls, journal,
    ctx: { seenIds: new Set(), ledger: [], integrity: { fault: null },
      journalAppend: async (type, tick, payload) => {
        calls++;
        if (failOn.has(calls)) throw new Error('journal drop @' + calls);
        const entry = await journal.append(type, tick, payload);
        if (landThenThrow.has(calls)) throw new Error('post-write callback boom @' + calls);
        return entry;
      },
      journalEntries: async () => journal.entries } };
}
const countKind = (journal, kind) => journal.entries.filter((e) => e.payload && e.payload.kind === kind).length;
const countFor = (journal, reportId) =>
  journal.entries.filter((e) => journalEntryMatchesSanitation(e, { reportId })).length;
// Audit helper (gate-side, not sim code): which collected patches lack a
// journal record. removedKg only ever grows through sanitation, so a gap
// here is a loud, named finding — never a silent loss.
function sanitationCoverage(patches, journal) {
  return patches.filter((p) => p.removedKg > 0 && !journal.entries.some((e) =>
    e.payload && e.payload.kind === 'sanitation' && e.payload.patchId === p.id)).map((p) => p.id);
}

// 1. Scheduled trigger: due days only, roster order, current day only.
{
  const city = stockedAlley();
  assert.deepEqual(dueSanitationReports(city, 6), [], 'day 6 not due');
  assert.deepEqual(dueSanitationReports(city, 8), [], 'day 8 not due');
  assert(sanitationDue(7) && !sanitationDue(8), 'weekly schedule');
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(city);
  assert(city.patches.every((p) => p.day === 7), 'metabolism ran the due day first');
  const due = dueSanitationReports(city, 7);
  assert.deepEqual(due.map((d) => [d.patchId, d.day]), [['deli-1', 7], ['deli-2', 7]], 'both patches due, roster order');
}

// 2. Happy path: batch validates, applies, journals, conserves, dedups.
const journal = new StateJournal();
const city = stockedAlley();
for (let n = 0; n < 7 * 288; n++) tickLivingCity(city);
{
  const added = city.patches.map((p) => patchAdded(p));
  const reports = await attestSanitationReports(dueSanitationReports(city, 7), { hashHex, tick: city.tickCount });
  assert.deepEqual(reports.map((r) => r.attestation.reportId),
    ['sanitation-schedule-d7-deli-1', 'sanitation-schedule-d7-deli-2'], 'canonical self-describing IDs');
  assert(reports.every((r) => r.attestation.payload.provenance === 'simulated'), 'sim-labeled throughout');
  const sc = sanCtx(journal);
  const out = await commitSanitationBatch(city, reports, sc.ctx);
  assert.equal(out.status, 'acted');
  assert(city.patches.every((p) => p.fresh === 0 && p.rot === 0 && p.residue === 0), 'consumables cleared');
  assert(city.patches[0].removedKg > 0 && city.patches[1].removedKg > 0, 'removal booked, not destroyed');
  city.patches.forEach((p, i) => assert(Math.abs(patchTotals(p) - added[i]) < 1e-9, 'conservation holds: ' + p.id));
  assert(sc.ctx.seenIds.has('sanitation-schedule-d7-deli-1'), 'dedup set updated as part of the transition');
  assert.equal(sc.ctx.ledger.length, 2, 'ledger released after verification');
  assert.equal(countKind(journal, 'sanitation'), 2, 'one journal record per collection');
  assert.deepEqual(sanitationCoverage(city.patches, journal), [], 'no gap between world and history');
  assert.equal(await journal.verifyChain(), true);
  // Replaying either report is a duplicate, not a second collection.
  const before = JSON.stringify(city.patches);
  assert.throws(() => reconcileReport({ patches: city.patches }, reports[0].attestation, sc.ctx.seenIds, reports[0].expectedSha), /duplicate report/);
  assert.equal(JSON.stringify(city.patches), before, 'duplicate changes nothing');
}

// 3. Batch atomicity: a bad second report leaves the first untouched.
{
  const c2 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c2);
  const j2 = new StateJournal();
  const s2 = sanCtx(j2);
  const good = (await attestSanitationReports(dueSanitationReports(c2, 7).slice(0, 1), { hashHex, tick: c2.tickCount }))[0];
  const badPayload = sanitationPulse({ patchId: 'ghost', day: 7, seq: 9 });
  const bad = { attestation: attestReport({ sourceId: 'sanitation-schedule',
    reportId: sanitationReportId(7, 'ghost'), payload: badPayload, sha256: shaOf(badPayload), tick: c2.tickCount }),
    expectedSha: shaOf(badPayload) };
  const before = JSON.stringify(c2.patches);
  await assert.rejects(commitSanitationBatch(c2, [good, bad], s2.ctx), /unknown patch/);
  assert.equal(JSON.stringify(c2.patches), before, 'no partial collection');
  assert.equal(s2.ctx.seenIds.size, 0, 'no partial dedup update');
  assert.equal(s2.ctx.ledger.length, 0, 'no partial ledger release');
  assert.equal(j2.entries.length, 0, 'no partial journal');
}

// 4. Journal fault at collection time: explicit fault, blocked retry,
// idempotent reconcile with marker, ledger only on success.
{
  const c3 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c3);
  const j3 = new StateJournal();
  const s3 = sanCtx(j3, new Set([1]));
  const reports = await attestSanitationReports(dueSanitationReports(c3, 7), { hashHex, tick: c3.tickCount });
  const out = await commitSanitationBatch(c3, reports, s3.ctx);
  assert.equal(out.status, 'fault');
  assert.deepEqual(out.fault.completedStages, []);
  assert.equal(s3.ctx.ledger.length, 0, 'withheld until reconciled');
  assert(c3.patches.every((p) => p.fresh === 0), 'world changed despite journal failure');
  assert.deepEqual(sanitationCoverage(c3.patches, j3), ['deli-1', 'deli-2'], 'gap is named, not silent');
  const blocked = await commitSanitationBatch(c3, reports, s3.ctx);
  assert.equal(blocked.status, 'blocked', 'no second collection during fault');
  await assert.rejects(reconcileSanitation({ ...s3.ctx, journalAppend: async () => { throw new Error('still down'); } }), /deferred/);
  assert(s3.ctx.integrity.fault, 'fault retained');
  const rec = await reconcileSanitation(s3.ctx);
  assert.equal(rec.status, 'reconciled');
  assert.equal(s3.ctx.ledger.length, 2, 'ledger released after verification');
  for (const id of ['sanitation-schedule-d7-deli-1', 'sanitation-schedule-d7-deli-2']) {
    assert.equal(countFor(j3, id), 1, 'exactly one record for ' + id);
  }
  assert.equal(countKind(j3, 'sanitation-reconciliation'), 1, 'single marker');
  assert.equal(await j3.verifyChain(), true);
}

// 5. Exact-once accounting with strict resolver: drop, duplicate, conflict.
{
  const c4 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c4);
  const j4 = new StateJournal();
  let n4 = 0;
  const ctx = { seenIds: new Set(), ledger: [], integrity: { fault: null },
    journalAppend: async (t, k, p) => { n4++; if (n4 === 2) throw new Error('drop @2'); return j4.append(t, k, p); },
    journalEntries: async () => j4.entries };
  const reports = await attestSanitationReports(dueSanitationReports(c4, 7), { hashHex, tick: c4.tickCount });
  const out = await commitSanitationBatch(c4, reports, ctx);
  assert.equal(out.status, 'fault');
  assert.deepEqual(out.fault.completedStages, ['sanitation-schedule-d7-deli-1']);
  await reconcileSanitation(ctx);
  for (const id of ['sanitation-schedule-d7-deli-1', 'sanitation-schedule-d7-deli-2']) {
    assert.equal(countFor(j4, id), 1, 'exactly one record for ' + id);
  }
  assert.equal(countKind(j4, 'sanitation-reconciliation'), 1, 'single marker');
  assert.equal(ctx.ledger.length, 2);
  // Ambiguous post-write failure is adopted, not duplicated (reviewer's case).
  const c5 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c5);
  const j5 = new StateJournal();
  let n5 = 0;
  const ctx5 = { seenIds: new Set(), ledger: [], integrity: { fault: null },
    journalAppend: async (t, k, p) => { n5++; const e = await j5.append(t, k, p); if (n5 === 1) throw new Error('callback boom'); return e; },
    journalEntries: async () => j5.entries };
  const r5 = await attestSanitationReports(dueSanitationReports(c5, 7), { hashHex, tick: c5.tickCount });
  const out5 = await commitSanitationBatch(c5, r5, ctx5);
  assert.equal(out5.status, 'acted', 'landed-but-unreported first write adopted');
  assert.equal(countFor(j5, 'sanitation-schedule-d7-deli-1'), 1);
  assert.equal(j5.entries.filter((e) => e.payload.kind === 'sanitation').length, 2);
  // Conflicted history holds the fault: same ID, different mass.
  const c6 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c6);
  const j6 = new StateJournal();
  const tampered = { kind: 'sanitation', reportId: 'sanitation-schedule-d7-deli-1', patchId: 'deli-1',
    day: 7, removedKg: 9999, freshBefore: 0, freshAfter: 0, provenance: 'simulated' };
  await j6.append('action', c6.tickCount, tampered);
  assert.equal(await j6.verifyChain(), true, 'hash-valid yet conflicting history possible');
  const ctx6 = { seenIds: new Set(), ledger: [], integrity: { fault: null },
    journalAppend: async (t, k, p) => j6.append(t, k, p),
    journalEntries: async () => j6.entries };
  const r6 = await attestSanitationReports(dueSanitationReports(c6, 7), { hashHex, tick: c6.tickCount });
  const out6 = await commitSanitationBatch(c6, r6, ctx6);
  assert.equal(out6.status, 'fault', 'conflict fails the batch; the impostor adopts nothing');
  assert.equal(out6.fault.failedStage, 'sanitation-schedule-d7-deli-1');
  assert.deepEqual(out6.fault.completedStages, [], 'nothing adoptable');
  // The naive presence check is blind here — the impostor wears the right
  // ID — which is exactly why adoption requires payload consistency:
  const naive = j6.entries.filter((e) => e.payload && e.payload.kind === 'sanitation' && e.payload.patchId === 'deli-1');
  assert.equal(naive.length, 1, 'impostor stands alone; no valid record appended over it');
  await assert.rejects(reconcileSanitation(ctx6), /conflicted/, 'reconcile refuses the conflicted history');
  assert(ctx6.integrity.fault, 'fault retained after failed reconcile');
  // A duplicate ID with identical bytes is still a conflict, not an adoption.
  const c7 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c7);
  const j7 = new StateJournal();
  const r7 = await attestSanitationReports(dueSanitationReports(c7, 7), { hashHex, tick: c7.tickCount });
  const realPayload = { kind: 'sanitation', reportId: 'sanitation-schedule-d7-deli-1', patchId: 'deli-1',
    day: 7, removedKg: 0, freshBefore: 0, freshAfter: 0, provenance: 'simulated' };
  await j7.append('action', c7.tickCount, realPayload);
  await j7.append('action', c7.tickCount, JSON.parse(JSON.stringify(realPayload)));
  const ctx7 = { seenIds: new Set(), ledger: [], integrity: { fault: null },
    journalAppend: async (t, k, p) => j7.append(t, k, p),
    journalEntries: async () => j7.entries };
  const out7 = await commitSanitationBatch(c7, r7, ctx7);
  assert.equal(out7.status, 'fault', 'duplicates hold the fault even when bytes match');
}

// 6. Checkpoint round-trip with the dedup set (not just the ledger):
// a faulted collection cannot double-apply after restore.
{
  const c6 = stockedAlley();
  for (let n = 0; n < 7 * 288; n++) tickLivingCity(c6);
  const j6 = new StateJournal();
  const s6 = sanCtx(j6, new Set([1]));
  const reports = await attestSanitationReports(dueSanitationReports(c6, 7), { hashHex, tick: c6.tickCount });
  const fctx = { seenIds: new Set(), ledger: [], integrity: { fault: null },
    journalAppend: s6.ctx.journalAppend, journalEntries: s6.ctx.journalEntries };
  const out = await commitSanitationBatch(c6, reports, fctx);
  assert.equal(out.status, 'fault', 'faulted before checkpoint');
  // The checkpoint carries the FULL dedup set (including the faulted
  // reports), never just the released ledger — otherwise restore would
  // permit a second collection of the same day.
  const record = buildResumptionRecord({ snapshot: citySnapshot(c6), corridorsSha256: corridorSha256,
    world, ecology: { patches: c6.patches }, ecoDay: 7,
    appliedReports: [...fctx.seenIds], objects: c6.objects });
  assert.deepEqual([...record.appliedReports].sort(),
    ['sanitation-schedule-d7-deli-1', 'sanitation-schedule-d7-deli-2'].sort(), 'dedup set checkpointed');
  const trust = { corridorsSha256: corridorSha256, world,
    citizenIds: c6.pedestrians.map((p) => p.id), patchIds: ['deli-1', 'deli-2'],
    objectIds: ['dumpster-1', 'dumpster-2'], objects: c6.objects };
  const wire = JSON.parse(JSON.stringify({ record, journal: j6.toJSONL() }));
  const revived = resumeLivingCity(corridors, wire.record, trust);
  const revivedJournal = StateJournal.fromJSONL(wire.journal);
  const rctx = { seenIds: new Set(wire.record.appliedReports), ledger: [], integrity: { fault: null },
    journalAppend: (t, k, p) => revivedJournal.append(t, k, p),
    journalEntries: async () => revivedJournal.entries };
  // Same reports after restore: duplicates, not a second collection.
  const before = JSON.stringify(revived.patches);
  for (const r of reports) {
    assert.throws(() => reconcileReport({ patches: revived.patches }, r.attestation, rctx.seenIds, r.expectedSha), /duplicate report/);
  }
  assert.equal(JSON.stringify(revived.patches), before, 'no double collection after restore');
  // Coverage audit names the gap (world changed, history incomplete) —
  // the same detected-but-unlogged class as P017.8, never silent.
  assert.deepEqual(sanitationCoverage(revived.patches, revivedJournal).sort(), ['deli-1', 'deli-2']);
  assert.equal(await revivedJournal.verifyChain(), true);
}

// 7. Panel and autonomy observe the cleared world (read-only check).
// Any persistent roster identity will do — even a long-dead forager —
// since the assertion is about the world's readable state, not the actor.
{
  const rat = city.pedestrians[0];
  const view = snapshotLiveRat({ rat, tick: city.tickCount, ecoDay: 7,
    patches: city.patches, objects: city.objects });
  assert(view, 'panel projects post-sanitation state');
  assert(view.evidenceByObject['dumpster-1'].freshKg === 0, 'panel shows cleared patch, not invented stock');
}

console.log('PASS rat sanitation — scheduled collection validated, applied, journaled exactly once; faults block and reconcile; dedup checkpointed; panel reads cleared world');
