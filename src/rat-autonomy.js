// Life Itself Manhattan — one-rat autonomy step (P017.8, scavenge-v1).
// The first living decision: during a simulation tick, at most one
// persistent rat observes simulation-owned objects, scores them with the
// frozen policy, and — only if eligible — commits and applies a single
// bounded scavenge through the existing P017 authority chain. If no rat
// is eligible, the step abstains and changes nothing.
//
// Separation enforced by signatures, not comments:
//   selectRatAction(state, tick, ecoDay) — PURE. Reads state, returns a
//     proposal or null. Mutates nothing, commits nothing, journals nothing.
//   commitRatAction(state, selected, ctx) — the ONLY writer. Validates,
//     commits, applies once, journals, and records the receipt. All
//     mutation targets (state, applied set, journal, ledger, tick holder)
//     are caller-owned and passed in; nothing is hidden or global.
//   stepRatAutonomy(state, ctx) — select, then commit at most once.
//
// Abstention rule reuses the P017 forage convention (rat-foraging.js):
// hunger below 60 is genuinely hungry; satiated rats are never selected.
// Amount is deterministic from live stock: min(SCAVENGE_MAX_KG, stock
// floored to centigrams) — always within the contract's [MIN, MAX] window
// whenever the decision reports sufficient stock. No new scoring, no
// model, no provider. Browser and gates share this exact code path.
import { SCAVENGE_MAX_KG, SCAVENGE_MIN_KG, commitAction, actionReceipt } from './action-contract.js';
import { applyEventOnce } from './citizen-agency.js';
import { canonical } from './journal.js';
import { advertiseObject, advertisementToObservation, decideForRat } from './object-affordances.js';
import { buildScavengeAction } from './object-affordances.js';

const assert = (ok, why) => { if (!ok) throw new Error('autonomy: ' + why); };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Runtime-independent roster order (code-unit comparison): the first
// eligible rat in this order acts, on every engine, every run.
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const HUNGER_ACT_THRESHOLD = 60;
export const AUTONOMY_STAGES = ['decision', 'event', 'effect'];

// Pure selection. Returns { rat, action, decision, observations } for the
// first eligible hungry rat in roster order, or null when nobody may act
// (all satiated, dead, out of range, or the patch bare).
export function selectRatAction(state, tick, ecoDay) {
  assert(state && Array.isArray(state.pedestrians), 'selection needs pedestrians');
  assert(Array.isArray(state.patches) && Array.isArray(state.objects), 'selection needs sim-owned alley');
  assert(Number.isInteger(tick) && tick >= 0, 'selection needs a tick');
  assert(Number.isInteger(ecoDay) && ecoDay >= 0, 'selection needs an ecoDay');
  const patchesById = Object.fromEntries(state.patches.map((p) => [p.id, p]));
  const objectsById = Object.fromEntries(state.objects.map((o) => [o.id, o]));
  const ads = state.objects.map((o) => advertiseObject(o, patchesById[o.patchId], { tick, ecoDay }));
  const roster = [...state.pedestrians].sort((a, b) => cmpStr(a.id, b.id));
  for (const rat of roster) {
    if (rat.alive === false) continue;
    // Forage convention: satiated rats abstain without scoring.
    if (!(isNum(rat.motives && rat.motives.hunger) && rat.motives.hunger < HUNGER_ACT_THRESHOLD)) continue;
    const observations = ads.map((ad) => advertisementToObservation(ad, rat.id));
    const decision = decideForRat({ rat, motives: rat.motives, advertisements: ads,
      patchesById, objectsById, tick,
      observationIds: observations.map((o) => o.observationId) });
    if (!decision.chosen || decision.chosen.interactionId !== 'scavenge-fresh') continue;
    // Eligible implies the object exists and the patch holds stock; the
    // commit path revalidates both against live state regardless.
    const patch = patchesById[objectsById[decision.chosen.objectId].patchId];
    assert(patch && isNum(patch.fresh) && patch.fresh >= SCAVENGE_MIN_KG, 'autonomy: chosen stock vanished');
    const amountKg = Math.min(SCAVENGE_MAX_KG, Math.floor(patch.fresh * 100) / 100);
    assert(amountKg >= SCAVENGE_MIN_KG && amountKg <= SCAVENGE_MAX_KG, 'autonomy: amount out of bounds');
    const basis = observations.find((o) => o.advertisement.objectId === decision.chosen.objectId)
      || observations[0];
    const action = buildScavengeAction({ actorId: rat.id, tick,
      observation: basis, objectId: decision.chosen.objectId,
      patchId: patch.id, amountKg, actionSeq: 'autonomy' });
    return { rat, action, decision, observations };
  }
  return null;
}

// Idempotent stage writer — the heart of the P017.8b correction.
// Appends exactly the stages in `stages` not yet recorded on `f`,
// tracking progress on `f.completedStages` IN PLACE after every
// successful landing, so a retry resumes instead of repeating.
// ...
// (doc block preserved from P017.8b; resolver strengthened below)
async function resolveStage(ctx, tick, payloads, f, name) {
  // Outcomes: 'missing' (no record — append it), 'adopted' (exactly one
  // record with the expected canonical payload — skip it), 'conflicted'
  // (duplicates, or an ID match with a different payload or tick — never
  // append over it, never adopt it), 'trust' (no journal reader
  // configured: single-writer sinks where appends are trusted).
  const id = { stage: name, eventId: f.eventId, tick, actorId: f.actorId, decisionId: f.decisionId };
  if (typeof ctx.journalEntries === 'function') {
    const entries = await ctx.journalEntries();
    const cands = entries.filter((e) => journalEntryMatchesStage(e, id));
    if (cands.length === 0) return 'missing';
    let good = 0;
    for (const e of cands) {
      try {
        if (e.tick === tick && canonical(e.payload) === canonical(payloads[name])) good++;
      } catch {
        // Uncomparable entries count as conflicting, never as matching.
      }
    }
    return (cands.length === 1 && good === 1) ? 'adopted' : 'conflicted';
  }
  // Legacy boolean hook: can confirm presence, never conflicts or content.
  // Kept so existing single-writer gates keep their semantics; the strict
  // path above is what the panel and the new gates use.
  if (typeof ctx.journalHasStage === 'function') {
    return (await ctx.journalHasStage(id)) ? 'adopted' : 'missing';
  }
  return 'trust';
}

// Throws { failedStage } — every exit carries the stage so faults and
// reconciliation know exactly where the frontier stopped.
function stageError(kind, name) {
  const err = new Error('journal stage ' + kind + ': ' + name);
  err.failedStage = name;
  return err;
}

// The idempotent writer. For each unrecorded stage: adopt it when the
// journal already holds exactly one payload-consistent record, refuse
// when records duplicate or conflict, append when nothing is there, and
// adopt-after-verify when the append reports failure but the record
// landed anyway. Progress lands on f.completedStages in place.
async function appendStagesOnce(ctx, tick, payloads, f, stages) {
  for (const name of stages) {
    if (f.completedStages.includes(name)) continue;
    const seen = await resolveStage(ctx, tick, payloads, f, name);
    if (seen === 'adopted') { f.completedStages.push(name); continue; }
    if (seen === 'conflicted') throw stageError('conflicted', name);
    try {
      await ctx.journalAppend('action', tick, payloads[name]);
    } catch (e) {
      const again = await resolveStage(ctx, tick, payloads, f, name);
      if (again === 'adopted') { f.completedStages.push(name); continue; }
      if (again === 'conflicted') throw stageError('conflicted', name);
      throw stageError('missing', name);
    }
    const after = await resolveStage(ctx, tick, payloads, f, name);
    // 'trust' readers report the uncontested append as landed by
    // construction; anything else must verify present-and-consistent.
    if (after === 'trust' || after === 'adopted') { f.completedStages.push(name); continue; }
    throw stageError(after === 'conflicted' ? 'conflicted' : 'unverifiable', name);
  }
}

// Final gate before any receipt is released: re-resolve every required
// stage against journal contents. Without a reader there is nothing to
// revalidate against and the append protocol stands; otherwise anything
// but unanimous 'adopted' fails the release.
async function verifyAllStages(ctx, tick, payloads, f, stages) {
  if (typeof ctx.journalEntries !== 'function' && typeof ctx.journalHasStage !== 'function') return true;
  for (const name of stages) {
    if ((await resolveStage(ctx, tick, payloads, f, name)) !== 'adopted') {
      throw stageError('unverified', name);
    }
  }
  return true;
}

// The single writer. ctx carries caller-owned mutation targets:
//   applied: Set of eventIds (exactly-once record, shared by commit+apply)
//   lastTick: { n } holder enforcing causal order across ticks
//   journalAppend(type, tick, payload): caller journal sink (async allowed)
//   ledger: array receiving { decision, event, effect, receipt } on success
//   integrity: { fault } holder for the explicit integrity-fault state
// Returns { status: 'acted', event, effect, receipt } on the full path, or
// { status: 'fault', event, effect, receipt: null, fault } when the world
// changed but the history did not land: the event is applied (fresh down,
// hunger up, applied set sealed) while one or more journal stages are
// missing. That is NOT an abstention and must never read as one — no
// ledger entry is recorded and no receipt is displayable until
// reconcileIntegrityFault succeeds. Validation/apply failures still throw
// BEFORE any mutation (fail closed, world untouched). No crash-atomicity
// is claimed: a crash between apply and journal is detected via
// verifyRecovery (committed-but-unlogged), never silently repaired.
export async function commitRatAction(state, selected, ctx) {
  assert(selected && selected.action && selected.rat, 'commit needs a selection');
  assert(ctx && ctx.applied instanceof Set, 'commit needs an applied set');
  assert(ctx.lastTick && Number.isInteger(ctx.lastTick.n), 'commit needs a tick holder');
  assert(typeof ctx.journalAppend === 'function', 'commit needs a journal sink');
  assert(Array.isArray(ctx.ledger), 'commit needs a ledger');
  assert(ctx.integrity && typeof ctx.integrity === 'object', 'commit needs an integrity holder');
  const positions = Object.fromEntries(state.pedestrians.map((p) => [p.id, p]));
  const agentsById = Object.fromEntries(state.pedestrians.map((p) => [p.id, p]));
  const patchesById = Object.fromEntries(state.patches.map((p) => [p.id, p]));
  const objectsById = Object.fromEntries(state.objects.map((o) => [o.id, o]));
  const event = commitAction(selected.action, {
    citizenIds: state.pedestrians.map((p) => p.id),
    positions, tick: selected.action.tick, lanes: state.lanes,
    patchesById, objectsById, agentsById,
  }, ctx.applied, ctx.lastTick.n);
  ctx.lastTick.n = selected.action.tick;
  const effect = applyEventOnce(state, event, ctx.applied);
  const receipt = actionReceipt(selected.action, event);
  assert(receipt.status === 'committed', 'autonomy: receipt not committed');
  const payloads = {
    decision: { kind: 'rat-decision', decision: selected.decision },
    event: { kind: 'world-event', event },
    effect: { kind: 'scavenge-effect', effect, receipt },
  };
  // Progress record carried by the fault itself: completedStages grows as
  // stages land, so every retry — here or in reconcile — resumes.
  // decisionId pins the decision stage's journal identity.
  const progress = { eventId: event.eventId, tick: selected.action.tick,
    actorId: selected.action.actorId, decisionId: selected.decision.decisionId,
    completedStages: [] };
  try {
    await appendStagesOnce(ctx, selected.action.tick, payloads, progress, AUTONOMY_STAGES);
    await verifyAllStages(ctx, selected.action.tick, payloads, progress, AUTONOMY_STAGES);
  } catch (err) {
    // The world already changed: record WHAT landed and WHAT is missing,
    // with frozen copies (never live references the world could mutate).
    const frozen = JSON.parse(JSON.stringify({ decision: selected.decision, event, effect, receipt, payloads }));
    ctx.integrity.fault = {
      eventId: event.eventId, actorId: selected.action.actorId,
      tick: selected.action.tick, decisionId: selected.decision.decisionId,
      failedStage: err.failedStage || null,
      completedStages: [...progress.completedStages],
      ...frozen,
      error: String((err && err.message) || err),
    };
    return { status: 'fault', event, effect, receipt: null, fault: ctx.integrity.fault };
  }
  ctx.ledger.push({ decision: selected.decision, event, effect, receipt });
  return { status: 'acted', event, effect, receipt };
}

// Reconciliation: re-append ONLY the stages the fault record marks missing,
// then a late-arrival marker, then release the withheld receipt into the
// ledger and clear the fault. Progress is tracked on the fault itself, so
// a second failure resumes instead of duplicating: completed stages are
// never re-appended, the marker is fixed at first reconcile (same
// lateStages on every retry) and itself verified before counting as done,
// and the receipt is released only after every required stage is verified
// exactly once. Throws (fault retained WITH updated progress) when the
// journal is still failing — the next retry continues from the new
// frontier. A valid hash chain proves sequence integrity, NOT uniqueness:
// uniqueness comes from this protocol, and the gate counts every stage.
export async function reconcileIntegrityFault(ctx) {
  assert(ctx && ctx.integrity && ctx.integrity.fault, 'nothing to reconcile');
  assert(typeof ctx.journalAppend === 'function', 'reconcile needs a journal sink');
  assert(Array.isArray(ctx.ledger), 'reconcile needs a ledger');
  const f = ctx.integrity.fault;
  if (!f.markerLateStages) {
    f.markerLateStages = [...AUTONOMY_STAGES.filter((s) => !f.completedStages.includes(s))];
  }
  const markerPayload = { kind: 'rat-reconciliation', eventId: f.eventId,
    lateStages: f.markerLateStages, originalTick: f.tick };
  const payloads = { ...f.payloads, marker: markerPayload };
  const stages = [...AUTONOMY_STAGES, 'marker'];
  try {
    await appendStagesOnce(ctx, f.tick, payloads, f, stages);
    await verifyAllStages(ctx, f.tick, payloads, f, stages);
  } catch (err) {
    // Fault retained WITH updated progress; the message names the stage
    // so callers can distinguish missing / conflicted / unverified.
    throw new Error('reconciliation deferred: ' + ((err && err.message) || err));
  }
  ctx.ledger.push({ decision: f.decision, event: f.event, effect: f.effect, receipt: f.receipt });
  const receipt = f.receipt;
  const lateStages = f.markerLateStages;
  ctx.integrity.fault = null;
  return { status: 'reconciled', receipt, lateStages };
}

// Stage identity matcher shared by gates and the browser adapter, so
// ambiguous appends are resolved against journal contents the same way
// everywhere: does this entry record (stage, eventId/decisionId)? A valid
// hash chain proves sequence integrity, NOT uniqueness — uniqueness comes
// from the append protocol above, verified through this matcher.
export function journalEntryMatchesStage(entry, { stage, eventId, decisionId }) {
  if (!entry || entry.event_type !== 'action') return false;
  const p = entry.payload || {};
  if (stage === 'decision') return p.kind === 'rat-decision' && p.decision && p.decision.decisionId === decisionId;
  if (stage === 'event') return p.kind === 'world-event' && p.event && p.event.eventId === eventId;
  if (stage === 'effect') return p.kind === 'scavenge-effect' && p.receipt && p.receipt.eventId === eventId;
  if (stage === 'marker') return p.kind === 'rat-reconciliation' && p.eventId === eventId;
  return false;
}

// One bounded tick: select, then commit at most once. When an integrity
// fault is already set, NO selection and NO commit occurs — the step
// reports 'blocked' with the fault attached. Abstention ('abstained') and
// partial execution ('fault') are distinct outcomes by construction.
export async function stepRatAutonomy(state, ctx, tick, ecoDay) {
  assert(ctx && ctx.integrity && typeof ctx.integrity === 'object', 'step needs an integrity holder');
  if (ctx.integrity.fault) return { status: 'blocked', fault: ctx.integrity.fault };
  const selected = selectRatAction(state, tick, ecoDay);
  if (!selected) return { status: 'abstained' };
  return commitRatAction(state, selected, ctx);
}
