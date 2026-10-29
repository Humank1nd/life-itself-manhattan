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
import { advertiseObject, advertisementToObservation, decideForRat } from './object-affordances.js';
import { buildScavengeAction } from './object-affordances.js';

const assert = (ok, why) => { if (!ok) throw new Error('autonomy: ' + why); };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Runtime-independent roster order (code-unit comparison): the first
// eligible rat in this order acts, on every engine, every run.
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const HUNGER_ACT_THRESHOLD = 60;

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
  const completedStages = [];
  let failedStage = null;
  try {
    for (const name of ['decision', 'event', 'effect']) {
      failedStage = name;
      await ctx.journalAppend('action', selected.action.tick, payloads[name]);
      completedStages.push(name);
    }
  } catch (err) {
    // The world already changed: record WHAT landed and WHAT is missing,
    // with frozen copies (never live references the world could mutate).
    const frozen = JSON.parse(JSON.stringify({ decision: selected.decision, event, effect, receipt, payloads }));
    ctx.integrity.fault = {
      eventId: event.eventId, actorId: selected.action.actorId,
      tick: selected.action.tick, failedStage,
      completedStages: [...completedStages],
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
// ledger and clear the fault. Completed stages are never duplicated: the
// fault record — not a retry counter — is the source of truth for what is
// missing. Throws (fault retained) when the journal is still failing.
export async function reconcileIntegrityFault(ctx) {
  assert(ctx && ctx.integrity && ctx.integrity.fault, 'nothing to reconcile');
  assert(typeof ctx.journalAppend === 'function', 'reconcile needs a journal sink');
  assert(Array.isArray(ctx.ledger), 'reconcile needs a ledger');
  const f = ctx.integrity.fault;
  const missing = ['decision', 'event', 'effect'].filter((s) => !f.completedStages.includes(s));
  for (const name of missing) {
    await ctx.journalAppend('action', f.tick, f.payloads[name]);
  }
  await ctx.journalAppend('action', f.tick,
    { kind: 'rat-reconciliation', eventId: f.eventId, lateStages: missing, originalTick: f.tick });
  ctx.ledger.push({ decision: f.decision, event: f.event, effect: f.effect, receipt: f.receipt });
  ctx.integrity.fault = null;
  return { status: 'reconciled', receipt: f.receipt, lateStages: missing };
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
