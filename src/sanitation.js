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
// it), 'adopted' (exactly one payload-consistent record — skip it),
// 'conflicted' (duplicates or a same-ID mismatch — hold the fault), or
// 'trust' (no journal reader configured; single-writer sinks). Identity
// is the report ID for collection records and the marker ID for the
// reconciliation marker.
async function resolveStage(ctx, payloads, f, name) {
  const isMarker = name === 'marker';
  const match = (e) => isMarker
    ? journalEntryMatchesSanitationMarker(e, f.markerId)
    : journalEntryMatchesSanitation(e, { reportId: name });
  if (typeof ctx.journalEntries !== 'function') return 'trust';
  const entries = await ctx.journalEntries();
  const cands = entries.filter(match);
  if (cands.length === 0) return 'missing';
  let good = 0;
  for (const e of cands) {
    try {
      if (e.tick === f.tick && canonical(e.payload) === canonical(payloads[name])) good++;
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
    if (seen === 'missing') {
      try {
        await ctx.journalAppend('action', tick, payloads[name]);
      } catch (e) {
        const again = await resolveStage(ctx, payloads, f, name);
        if (again === 'adopted') { f.completedStages.push(name); continue; }
        if (again === 'conflicted') throw stageError('conflicted', name);
        throw stageError('missing', name);
      }
    }
    const after = await resolveStage(ctx, payloads, f, name);
    if (after === 'trust' || after === 'adopted') { f.completedStages.push(name); continue; }
    throw stageError(after === 'conflicted' ? 'conflicted' : 'unverifiable', name);
  }
}
async function verifyAllStages(ctx, tick, payloads, f, stages) {
  if (typeof ctx.journalEntries !== 'function') return true;
  for (const name of stages) {
    if ((await resolveStage(ctx, payloads, f, name)) !== 'adopted') throw stageError('unverified', name);
  }
  return true;
}

// The only writer. ctx carries caller-owned targets: seenIds (Set,
// checkpointed via appliedReports — NOT the ledger), ledger (released
// only after verification), integrity {fault}, journalAppend, optional
// journalEntries resolver. Returns {status:'acted', results} or
// {status:'fault', ...}; validation failures throw with nothing mutated.
export async function commitSanitationBatch(state, reports, ctx) {
  assert(ctx && ctx.seenIds instanceof Set, 'sanitation needs a seen-ids set');
  assert(Array.isArray(ctx.ledger), 'sanitation needs a ledger');
  assert(ctx.integrity && typeof ctx.integrity === 'object', 'sanitation needs an integrity holder');
  assert(typeof ctx.journalAppend === 'function', 'sanitation needs a journal sink');
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
    ctx.integrity.fault = { reportIds: effects.map((e) => e.reportId),
      patchIds: effects.map((e) => e.patchId), tick,
      failedStage: err.failedStage || null, completedStages: [...f.completedStages],
      ...frozen, error: String((err && err.message) || err) };
    return { status: 'fault', fault: ctx.integrity.fault, effects };
  }
  for (const e of effects) ctx.ledger.push({ ...e });
  return { status: 'acted', effects };
}

// Reconcile a faulted batch: append exactly the missing collection
// records, then one idempotent marker, then release the ledger. Progress
// tracked on the fault resumes instead of repeating; conflicts hold the
// fault; the receipt-equivalent (ledger) releases only after every
// required stage verifies exactly once.
export async function reconcileSanitation(ctx) {
  assert(ctx && ctx.integrity, 'reconcile needs an integrity holder');
  const f = ctx.integrity.fault;
  if (!f) throw new Error('sanitation: nothing to reconcile');
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
