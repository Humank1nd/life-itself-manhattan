// Life Itself Manhattan — deterministic citizen agency (Phase 017, P017.3).
// The smallest accountable loop: perceive → propose → validate+commit →
// apply lawful effect. The policy is a pure function of seeded traits,
// live motives and positions: no model, no randomness, no provider.
// Effects are lawful by construction: rest/socialize adjust motives in
// bounds; moves land on the citizen's own lane segment (projection,
// never teleport). For the journal-shaped event, see action-contract.js.
//
// Durability rule: commit and apply consult the SAME applied set, and
// that set is rebuilt from the checkpointed event log on restore. A
// repeated commit or a repeated apply of the same event ID fails;
// there is no path that executes one committed event twice.
import { validateObservation, validateAction, commitAction } from './action-contract.js';
import { graze } from './ecology.js';
const assert = (ok, why) => { if (!ok) throw new Error('agency: ' + why); };
const clamp100 = (v) => Math.max(0, Math.min(100, v));
// Hunger recovery per kilogram scavenged. Documented gameplay hypothesis
// (not physiology): a 0.5 kg alley meal restores +15 hunger (0..100 scale,
// higher means more satiated — lower motives.hunger means greater hunger).
export const SCAVENGE_HUNGER_PER_KG = 30;

// What the citizen perceives: own lowest motive + nearest neighbor.
export function perceive(state, pedId) {
  const ped = state.pedestrians.find((p) => p.id === pedId);
  if (!ped) throw new Error('agency: unknown citizen ' + pedId);
  let lowest = 'energy', lowVal = Infinity;
  for (const [k, v] of Object.entries(ped.motives)) if (v < lowVal) { lowVal = v; lowest = k; }
  let nearest = null, nearestD = Infinity;
  for (const q of state.pedestrians) {
    if (q.id === pedId) continue;
    const d = Math.hypot(q.x - ped.x, q.z - ped.z);
    if (d < nearestD) { nearestD = d; nearest = q.id; }
  }
  return {
    schemaVersion: 'life-itself-observation/1.0.0',
    observationId: `obs-${state.tickCount}-${pedId}`,
    observerId: pedId,
    tick: state.tickCount,
    kind: 'local-survey',
    summary: `${lowest} ${Math.round(lowVal)} nearest ${nearest} ${Math.round(nearestD)}m`,
    lowest, nearest, nearestD,
  };
}

// Deterministic policy: socialize when lonely and company is close,
// rest when drained, otherwise step along the current lane segment.
export function propose(state, pedId, observation) {
  const ped = state.pedestrians.find((p) => p.id === pedId);
  const lane = state.lanes[ped.laneIndex];
  const base = {
    schemaVersion: 'life-itself-action/1.0.0',
    actorId: pedId, tick: state.tickCount,
    basis: [observation],
  };
  if (observation.lowest === 'social' && observation.nearestD <= 25) {
    return { ...base, actionId: `act-${state.tickCount}-${pedId}-socialize`, type: 'socialize', params: { with: observation.nearest } };
  }
  if (observation.lowest === 'energy' && ped.motives.energy < 40) {
    return { ...base, actionId: `act-${state.tickCount}-${pedId}-rest`, type: 'rest', params: {} };
  }
  const a = lane.waypoints[ped.segmentIndex], b = lane.waypoints[ped.segmentIndex + 1];
  const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const step = Math.min(5, Math.max(0, (ped.direction > 0 ? 1 - ped.fraction : ped.fraction) * segLen - 0.01));
  const t = ped.direction > 0 ? ped.fraction + step / segLen : ped.fraction - step / segLen;
  return { ...base, actionId: `act-${state.tickCount}-${pedId}-move`, type: 'move',
    params: { to: { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t } } };
}

// Lawful effects for one committed event. Pure in/out except the state it
// is given; use applyEventOnce for the durable exactly-once path.
export function applyEvent(state, event) {
  if (event.type === 'rest') {
    const ped = state.pedestrians.find((p) => p.id === event.actorId);
    ped.motives.energy = clamp100(ped.motives.energy + 3);
    return { energy: ped.motives.energy };
  }
  if (event.type === 'socialize') {
    const a = state.pedestrians.find((p) => p.id === event.actorId);
    const b = state.pedestrians.find((p) => p.id === event.params.with);
    a.motives.social = clamp100(a.motives.social + 5);
    b.motives.social = clamp100(b.motives.social + 5);
    return { social: [a.motives.social, b.motives.social] };
  }
  if (event.type === 'move') {
    const ped = state.pedestrians.find((p) => p.id === event.actorId);
    const lane = state.lanes[ped.laneIndex];
    const a = lane.waypoints[ped.segmentIndex], b = lane.waypoints[ped.segmentIndex + 1];
    // Re-derive the fraction from the committed target: the event carries
    // the position, the lane owns the truth.
    const dx = b[0] - a[0], dz = b[1] - a[1], lenSq = dx * dx + dz * dz;
    const t = lenSq > 1e-9
      ? Math.max(0, Math.min(1, ((event.params.to.x - a[0]) * dx + (event.params.to.z - a[1]) * dz) / lenSq))
      : ped.fraction;
    ped.fraction = t;
    ped.x = a[0] + dx * t;
    ped.z = a[1] + dz * t;
    return { fraction: t };
  }
  if (event.type === 'scavenge') {
    // Grounded consumption (P017.4): the ONLY lawful path from patch fresh
    // stock to rat hunger. Requires the patch live in state.patches (owned
    // restored ecological state, same array checkpointed by city-resume).
    // Never mutates patch.fresh directly: books through graze() so
    // eatenKg carries the mass, and requires sufficient stock so a partial
    // fulfillment can never masquerade as a complete commitment.
    const ped = state.pedestrians.find((p) => p.id === event.actorId);
    assert(ped, 'agency: unknown scavenger');
    assert(ped.alive !== false, 'agency: dead rats do not eat');
    const patches = state.patches;
    assert(Array.isArray(patches), 'agency: scavenge needs state.patches');
    const patch = patches.find((q) => q.id === event.params.patchId);
    assert(patch, 'agency: unknown patch ' + event.params.patchId);
    const amount = event.params.amountKg;
    assert(typeof amount === 'number' && Number.isFinite(amount) && amount > 0, 'agency: bad scavenge amount');
    assert(patch.fresh >= amount, 'agency: insufficient stock at apply');
    const taken = graze(patch, amount);
    // graze() takes min(fresh, amount): with the stock check above the
    // take must be whole — any shortfall is a bookkeeping bug, fail closed.
    assert(taken === amount, 'agency: partial fulfillment rejected');
    ped.motives.hunger = clamp100(ped.motives.hunger + taken * SCAVENGE_HUNGER_PER_KG);
    return { takenKg: taken, hunger: ped.motives.hunger, fresh: patch.fresh, eatenKg: patch.eatenKg };
  }
  throw new Error('agency: unknown effect ' + event.type);
}

// Durable exactly-once: the same applied set guards commit AND apply.
// Restore rebuilds it from the checkpointed event log, so a replayed
// event is rejected at both gates even after a restart.
export function applyEventOnce(state, event, applied) {
  if (applied.has(event.eventId)) throw new Error('agency: duplicate effect ' + event.eventId);
  const out = applyEvent(state, event);
  applied.add(event.eventId);
  return out;
}

// Rebuild authoritative deduplication state from a checkpointed log.
// Unknown entries fail closed: the log must contain whole events.
export function rebuildApplied(log) {
  const applied = new Set();
  for (const e of log) {
    if (!e || typeof e.eventId !== 'string') throw new Error('agency: corrupt event log entry');
    if (applied.has(e.eventId)) throw new Error('agency: duplicate event in log ' + e.eventId);
    applied.add(e.eventId);
  }
  return applied;
}

// Post-restart invariant: committed, applied and recovered are three
// names for one set. A committed-but-unapplied event means the crash
// landed between commit and effect — replay it instead of proceeding.
// An applied-but-unlogged ID means the log is incomplete. Both fail.
export function verifyRecovery(log, applied) {
  const logged = new Set();
  for (const e of log) {
    if (!e || typeof e.eventId !== 'string') throw new Error('agency: corrupt event log entry');
    logged.add(e.eventId);
  }
  for (const id of logged) assert(id, 'agency: empty event id');
  const missing = [...logged].filter((id) => !applied.has(id));
  if (missing.length > 0) throw new Error('agency: committed event never applied: ' + missing[0]);
  const extra = [...applied].filter((id) => !logged.has(id));
  if (extra.length > 0) throw new Error('agency: applied event missing from log: ' + extra[0]);
  return true;
}

export { validateObservation, validateAction, commitAction };
