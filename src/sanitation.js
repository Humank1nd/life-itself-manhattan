// Life Itself Manhattan — scheduled sanitation (P017.9-S02).
// The first accountable outflow: on a scheduled day, each sim-owned patch
// is collected through attested reports — validated, applied, journaled,
// and recorded. One rat-step-shaped protocol, adapted to collection:
//
//   dueSanitationReports(state, ecoDay) — PURE trigger: which (patch, day)
//     pairs are due and current. Never mutates; never journals.
//   commitSanitationBatch(state, reports, ctx) — the ONLY writer.
//     Validates everything, computes on clones, publishes, records the
//     report IDs, journals each collection, releases the ledger. Any
//     failure before publishing throws with the world untouched; any
//     journaling failure after publishing becomes an explicit fault that
//     blocks further collections until reconciled.
//   reconcileSanitation(ctx) — completes exactly the missing journal
//     stages (adopted-if-present, never duplicated), then releases.
//
// Ordering: collection runs AFTER the tick's metabolism (same-day
// post-metabolism pickup) and BEFORE autonomous foraging, so rats observe
// the cleared world. A due day with no reconciled report simply keeps its
// metabolized state — never silently reaped, never auto-retried by the
// clock. No crash-atomicity is claimed: verifyRecovery-style detection,
// never silent repair.
import { reconcileReport, validateSanitationReport, attestReport } from './grounding-contract.js';
import { sanitationDue, sanitationPulse, sanitationReportId } from './grounding-producer.js';
import { canonical } from './journal.js';

const assert = (ok, why) => { if (!ok) throw new Error('sanitation: ' + why); };
export const SANITATION_SOURCE = 'sanitation-schedule';

// Which (patch, day) pairs may be collected right now: roster order,
// due days only, current day only. Pure read of sim-owned state.
export function dueSanitationReports(state, ecoDay, periodDays = 7) {
  assert(state && Array.isArray(state.objects), 'sanitation needs the sim-owned roster');
  assert(Array.isArray(state.patches), 'sanitation needs sim-owned patches');
  assert(Number.isInteger(ecoDay) && ecoDay >= 0, 'sanitation needs an ecological day');
  const out = [];
  state.objects.forEach((o, i) => {
    const patch = state.patches.find((p) => p.id === o.patchId);
    assert(patch, 'sanitation: object patch association broken: ' + o.id);
    // Same-day post-metabolism pickup only: the day must already have run
    // through metabolism (patch.day === ecoDay) and be scheduled.
    if (patch.day === ecoDay && sanitationDue(ecoDay, periodDays)) {
      out.push({ patchId: patch.id, day: ecoDay, seq: i });
    }
  });
  return out;
}

// Assemble attestable reports for due pairs. The caller supplies the hash
// (sync in gates, async SubtleCrypto in the browser); canonicalization is
// always journal.js canonical so both sides attest identical bytes.
export async function attestSanitationReports(descriptors, { hashHex, tick }) {
  assert(Array.isArray(descriptors), 'sanitation needs descriptors');
  assert(typeof hashHex === 'function', 'sanitation needs a hash function');
  assert(Number.isInteger(tick) && tick >= 0, 'sanitation needs a tick');
  const out = [];
  for (const d of descriptors) {
    const payload = sanitationPulse(d);
    const sha = await hashHex(canonical(payload));
    const reportId = sanitationReportId(payload.day, payload.patchId);
    out.push({ attestation: attestReport({ sourceId: SANITATION_SOURCE, reportId,
      payload, sha256: sha, tick }), expectedSha: sha });
  }
  return out;
}

export function journalEntryMatchesSanitation(entry, { reportId }) {
  if (!entry || entry.event_type !== 'action') return false;
  const p = entry.payload;
  return !!p && p.kind === 'sanitation' && p.reportId === reportId;
}
function journalEntryMatchesSanitationMarker(entry, markerId) {
  if (!entry || entry.event_type !== 'action') return false;
  const p = entry.payload;
  return !!p && p.kind === 'sanitation-reconciliation' && p.markerId === markerId;
}

// Resolve one journal stage against actual contents: 'missing' (append
// it), 'adopted' (exactly one payload-consistent record — skip it), or
// 'conflicted' (duplicates or a same-ID mismatch — hold the fault).
// Strict verification is required: without a journal reader the step
// fails closed instead of reporting success it cannot prove. There is no
// trust fallback — a failed append with no reader is a fault, never an
// assumed landing. Identity derives from the expected payload itself:
// collection stages by report ID, the marker by marker ID, missed records
// by patch + day. Tick scoping: collection and marker records must sit at
// the fault tick (same-tick journaling); missed records carry their day
// inside the payload, so only content identity is required.
async function resolveStage(ctx, payloads, f, name) {
  assert(typeof ctx.journalEntries === 'function', 'sanitation needs a journal reader');
  const payload = payloads[name];
  if (!payload || typeof payload !== 'object') throw stageError('missing', name);
  let match;
  let checkTick = true;
  if (name === 'marker') {
    match = (e) => journalEntryMatchesSanitationMarker(e, f.markerId);
  } else if (payload.kind === 'sanitation-missed') {
    match = (e) => !!e && !!e.payload && e.payload.kind === 'sanitation-missed'
      && e.payload.patchId === payload.patchId && e.payload.day === payload.day;
    checkTick = false;
  } else {
    match = (e) => journalEntryMatchesSanitation(e, { reportId: name });
  }
  const entries = await ctx.journalEntries();
  const cands = entries.filter(match);
  if (cands.length === 0) return 'missing';
  let good = 0;
  for (const e of cands) {
    try {
      const tickOk = checkTick ? e.tick === f.tick : true;
      if (tickOk && canonical(e.payload) === canonical(payloads[name])) good++;
    } catch { /* uncomparable counts as conflicting, never as matching */ }
  }
  return (cands.length === 1 && good === 1) ? 'adopted' : 'conflicted';
}
function stageError(kind, name) {
  const err = new Error('sanitation journal stage ' + kind + ': ' + name);
  err.failedStage = name;
  return err;
}
async function appendStagesOnce(ctx, tick, payloads, f, stages) {
  for (const name of stages) {
    if (f.completedStages.includes(name)) continue;
    const seen = await resolveStage(ctx, payloads, f, name);
    if (seen === 'adopted') { f.completedStages.push(name); continue; }
    if (seen === 'conflicted') throw stageError('conflicted', name);
    try {
      await ctx.journalAppend('action', tick, payloads[name]);
    } catch (e) {
      const again = await resolveStage(ctx, payloads, f, name);
      if (again === 'adopted') { f.completedStages.push(name); continue; }
      if (again === 'conflicted') throw stageError('conflicted', name);
      throw stageError('missing', name);
    }
    const after = await resolveStage(ctx, payloads, f, name);
    if (after === 'adopted') { f.completedStages.push(name); continue; }
    throw stageError(after === 'conflicted' ? 'conflicted' : 'unverifiable', name);
  }
}
async function verifyAllStages(ctx, tick, payloads, f, stages) {
  for (const name of stages) {
    if ((await resolveStage(ctx, payloads, f, name)) !== 'adopted') throw stageError('unverified', name);
  }
  return true;
}

// The only writer. ctx carries caller-owned targets: seenIds (Set,
// checkpointed via appliedReports — NOT the ledger), ledger (released
// only after verification), integrity {fault}, journalAppend, and the
// REQUIRED journalEntries resolver (strict verification has no trust
// fallback: without a readable journal the step fails closed instead of
// reporting success it cannot prove). Returns {status:'acted', effects}
// or {status:'fault', ...}; validation failures throw with nothing mutated.
export async function commitSanitationBatch(state, reports, ctx) {
  assert(ctx && ctx.seenIds instanceof Set, 'sanitation needs a seen-ids set');
  assert(Array.isArray(ctx.ledger), 'sanitation needs a ledger');
  assert(ctx && ctx.integrity && typeof ctx.integrity === 'object', 'sanitation needs an integrity holder');
  assert(typeof ctx.journalAppend === 'function', 'sanitation needs a journal sink');
  assert(typeof ctx.journalEntries === 'function', 'sanitation needs a journal reader');
  if (ctx.integrity.fault) return { status: 'blocked', fault: ctx.integrity.fault };
  if (!Array.isArray(reports) || reports.length === 0) return { status: 'abstained' };
  assert(state && Array.isArray(state.patches), 'sanitation needs sim-owned patches');
  const patchById = Object.fromEntries(state.patches.map((p) => [p.id, p]));
  // Phase 0 — validate every report against scratch state (pure reads,
  // nothing mutates): authenticity, identity, schedule, association,
  // day rule. In-batch duplicates pass here (seenIds untouched) and are
  // caught in phase 1 instead — either way, before any live mutation.
  for (const r of reports) {
    validateSanitationReport({ patches: JSON.parse(JSON.stringify(state.patches)) },
      r.attestation, new Set(ctx.seenIds), r.expectedSha);
  }
  // Phase 1+2 on clones: every report reconciled against scratch state
  // with a scratch dedup set seeded from the real one. A single bad
  // report rejects the whole batch before the live world is touched.
  const clones = JSON.parse(JSON.stringify(state.patches));
  const scratchSeen = new Set(ctx.seenIds);
  const scratchWorld = { patches: clones };
  const effects = [];
  for (const r of reports) {
    const before = patchById[r.attestation.payload.patchId];
    const fx = reconcileReport(scratchWorld, r.attestation, scratchSeen, r.expectedSha);
    const after = clones.find((p) => p.id === r.attestation.payload.patchId);
    effects.push({ reportId: fx.applied, patchId: after.id, day: after.day,
      freshBefore: before.fresh, freshAfter: after.fresh,
      removedDelta: after.removedKg - before.removedKg });
  }
  // Phase 3 — publish: in-place key replacement (S01a pattern), then the
  // report IDs join the authoritative dedup set as part of the same
  // logical transition.
  const cloneById = Object.fromEntries(clones.map((p) => [p.id, p]));
  for (const p of state.patches) {
    const c = cloneById[p.id];
    if (!c) continue;
    for (const k of Object.keys(p)) delete p[k];
    for (const [k, v] of Object.entries(c)) p[k] = v;
  }
  for (const r of reports) ctx.seenIds.add(r.attestation.reportId);
  // Phase 4 — journal every collection, then release the ledger only after
  // each stage verifies exactly once.
  const tick = state.tickCount;
  const payloads = {};
  for (const e of effects) {
    payloads[e.reportId] = { kind: 'sanitation', reportId: e.reportId, patchId: e.patchId,
      day: e.day, removedKg: e.removedDelta, freshBefore: e.freshBefore, freshAfter: e.freshAfter,
      provenance: 'simulated' };
  }
  const f = { tick, completedStages: [] };
  try {
    await appendStagesOnce(ctx, tick, payloads, f, effects.map((e) => e.reportId));
    await verifyAllStages(ctx, tick, payloads, f, effects.map((e) => e.reportId));
  } catch (err) {
    const frozen = JSON.parse(JSON.stringify({ effects, payloads }));
    ctx.integrity.fault = { kind: 'sanitation-batch', reportIds: effects.map((e) => e.reportId),
      patchIds: effects.map((e) => e.patchId), tick,
      failedStage: err.failedStage || null, completedStages: [...f.completedStages],
      ...frozen, error: String((err && err.message) || err) };
    return { status: 'fault', fault: ctx.integrity.fault, effects };
  }
  for (const e of effects) ctx.ledger.push({ ...e });
  return { status: 'acted', effects };
}

// Explicit missed-collection records. A due day the world metabolized
// past WITHOUT a reconciled collection is a fact, not a silent gap: it is
// journaled as such, once — verified present afterwards, never assumed.
// This never backfills mass or invents a collection: the metabolized day
// stays metabolized; only the absence of collection is recorded.
// Strict verification mirrors the collection path:
// - already recorded and payload-identical → adopted, no duplicate;
// - duplicates or contradictory content → conflict (held, never papered over);
// - an existing completed collection for the same patch+day does NOT make
//   a missed record wrong — it makes it unnecessary, so the day is skipped
//   as collected *unless* the dedup set disagrees, in which case that
//   contradiction is itself reported as a conflict for review.
// Returns { recorded, conflicts }. Throws on journal failure (nothing to
// reconcile yet — the next call re-resolves from journal contents).
export async function noteMissedSanitation(state, ecoDay, ctx, periodDays = 7) {
  assert(state && Array.isArray(state.objects), 'missed sanitation needs the sim-owned roster');
  assert(Array.isArray(state.patches), 'missed sanitation needs sim-owned patches');
  assert(Number.isInteger(ecoDay) && ecoDay >= 0, 'missed sanitation needs an ecological day');
  assert(ctx && ctx.seenIds instanceof Set, 'missed sanitation needs a seen-ids set');
  assert(typeof ctx.journalAppend === 'function', 'missed sanitation needs a journal sink');
  assert(typeof ctx.journalEntries === 'function', 'missed sanitation needs a journal reader');
  const recorded = [];
  const conflicts = [];
  for (const p of state.patches) {
    for (let d = 1; d <= ecoDay && d < p.day; d++) {
      if (!sanitationDue(d, periodDays)) continue;
      const reportId = sanitationReportId(d, p.id);
      if (ctx.seenIds.has(reportId)) continue; // reconciled collection: nothing missed
      const entries = await ctx.journalEntries();
      const completed = entries.filter((e) => !!e && e.event_type === 'action' && e.payload
        && e.payload.kind === 'sanitation' && e.payload.patchId === p.id && e.payload.day === d);
      if (completed.length > 0) {
        // The journal claims this day was collected but the dedup set has
        // no record of it: contradictory history. Hold it for review rather
        // than writing a missed record over a completed one.
        conflicts.push({ patchId: p.id, day: d, reason: 'collection-record-without-dedup-entry' });
        continue;
      }
      const payload = { kind: 'sanitation-missed', patchId: p.id, day: d,
        reason: 'due day metabolized without a reconciled collection', provenance: 'simulated' };
      const existing = entries.filter((e) => !!e && e.event_type === 'action' && e.payload
        && e.payload.kind === 'sanitation-missed' && e.payload.patchId === p.id && e.payload.day === d);
      const good = existing.filter((e) => { try { return canonical(e.payload) === canonical(payload); } catch { return false; } });
      if (existing.length === 1 && good.length === 1) continue; // adopted
      if (existing.length > 0) {
        conflicts.push({ patchId: p.id, day: d, reason: 'conflicting-missed-record' });
        continue;
      }
      await ctx.journalAppend('action', ecoDay, payload);
      const after = await ctx.journalEntries();
      const landed = after.filter((e) => !!e && e.event_type === 'action' && e.payload
        && e.payload.kind === 'sanitation-missed' && e.payload.patchId === p.id && e.payload.day === d);
      const verified = landed.filter((e) => { try { return canonical(e.payload) === canonical(payload); } catch { return false; } });
      if (landed.length !== 1 || verified.length !== 1) {
        throw new Error('sanitation missed record unverified: ' + p.id + ' day ' + d);
      }
      recorded.push({ patchId: p.id, day: d });
    }
  }
  return { recorded, conflicts };
}

// One scheduled tick: reconcile any fault, record missed days, then
// collect what is due. Never throws on runtime conditions — validation
// errors, journal outages, and conflicts come back as data ({status:
// 'blocked' | 'fault' | 'deferred' | 'acted' | 'abstained'}), so a live
// loop can keep ticking around a stuck sanitation pipeline. Programmer
// shape errors (bad ctx/deps) still throw.
export async function stepSanitation(state, ecoDay, ctx, deps) {
  assert(ctx && ctx.integrity && typeof ctx.integrity === 'object', 'sanitation step needs an integrity holder');
  assert(ctx && ctx.seenIds instanceof Set, 'sanitation step needs a seen-ids set');
  assert(Array.isArray(ctx.ledger), 'sanitation step needs a ledger');
  assert(typeof ctx.journalAppend === 'function', 'sanitation step needs a journal sink');
  assert(typeof ctx.journalEntries === 'function', 'sanitation needs a journal reader');
  assert(deps && typeof deps.hashHex === 'function' && Number.isInteger(deps.tick) && deps.tick >= 0,
    'sanitation step needs a hash function and tick');
  if (ctx.integrity.fault) {
    try {
      await reconcileSanitation(ctx);
    } catch (e) {
      return { status: 'blocked', fault: ctx.integrity.fault, error: String((e && e.message) || e) };
    }
  }
  let missed = [], missedConflicts = [], missedError = null;
  try {
    const note = await noteMissedSanitation(state, ecoDay, ctx);
    missed = note.recorded;
    missedConflicts = note.conflicts;
  } catch (e) {
    return { status: 'deferred', error: String((e && e.message) || e), missed: [], missedConflicts: [], missedError: null };
  }
  if (missedConflicts.length > 0) {
    // Contradictory history blocks further collection until review: a
    // missed day that the journal claims was collected (or recorded
    // inconsistently) must be resolved by an operator, never papered over.
    ctx.integrity.fault = { kind: 'sanitation-missed-conflict', missed: missedConflicts,
      tick: ecoDay, failedStage: 'missed:' + missedConflicts[0].patchId + ':' + missedConflicts[0].day,
      completedStages: [], payloads: {}, effects: [],
      error: 'contradictory sanitation history for ' + missedConflicts.map((m) => m.patchId + ' day ' + m.day).join(', ') };
    return { status: 'fault', fault: ctx.integrity.fault, missed, missedConflicts, missedError: null };
  }
  const due = dueSanitationReports(state, ecoDay).filter((d) => !ctx.seenIds.has(sanitationReportId(d.day, d.patchId)));
  if (due.length === 0) return { status: missed.length ? 'noted-missed' : 'abstained', missed, missedError: null };
  let reports;
  try {
    reports = await attestSanitationReports(due, { hashHex: deps.hashHex, tick: deps.tick });
  } catch (e) {
    return { status: 'deferred', error: String((e && e.message) || e), missed, missedError: null };
  }
  try {
    const out = await commitSanitationBatch(state, reports, ctx);
    return { ...out, missed, missedError: null };
  } catch (e) {
    return { status: 'deferred', error: String((e && e.message) || e), missed, missedError: null };
  }
}
export async function reconcileSanitation(ctx) {
  assert(ctx && ctx.integrity, 'reconcile needs an integrity holder');
  const f = ctx.integrity.fault;
  if (!f) throw new Error('sanitation: nothing to reconcile');
  // Contradictory history has no automatic repair path: a missed record
  // that conflicts with journaled evidence (or vice versa) stays held
  // until an operator resolves the underlying records.
  if (f.kind === 'sanitation-missed-conflict') {
    throw new Error('reconciliation deferred: contradictory sanitation history requires review');
  }
  assert(typeof ctx.journalAppend === 'function', 'reconcile needs a journal sink');
  assert(Array.isArray(ctx.ledger), 'reconcile needs a ledger');
  if (!f.markerId) f.markerId = 'sanitation-reconciliation:' + [...f.reportIds].sort().join(',');
  const markerPayload = { kind: 'sanitation-reconciliation', markerId: f.markerId,
    reportIds: [...f.reportIds], originalTick: f.tick };
  const payloads = { ...f.payloads, marker: markerPayload };
  const names = [...f.reportIds, 'marker'];
  try {
    await appendStagesOnce(ctx, f.tick, payloads, f, names);
    await verifyAllStages(ctx, f.tick, payloads, f, names);
  } catch (err) {
    throw new Error('reconciliation deferred: ' + ((err && err.message) || err));
  }
  for (const e of f.effects) ctx.ledger.push({ ...e });
  ctx.integrity.fault = null;
  return { status: 'reconciled', reportIds: [...f.reportIds] };
}
