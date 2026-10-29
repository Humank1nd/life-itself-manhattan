// Life Itself Manhattan — autonomous action/event contract (Phase 017,
// slice 017.2). Versioned Observation → ProposedAction → WorldEvent →
// Receipt pipeline. Pure: no I/O, no model, no provider. Committed events
// are journal-shaped so the island's StateJournal can seal them unchanged;
// validation fails closed before anything is committed.
export const ACTION_CONTRACT = 'life-itself-action/1.0.0';
export const OBSERVATION_CONTRACT = 'life-itself-observation/1.0.0';
export const EVENT_CONTRACT = 'life-itself-world-event/1.0.0';
export const ACTION_TYPES = ['move', 'rest', 'socialize', 'scavenge'];
// Single-tick plausibility bounds (5-second tick, ~1.5 m/s walkers).
export const MAX_MOVE_M = 10;
export const SOCIAL_RANGE_M = 25;
// Grounded scavenging envelope (P017.4): the rat must already be at the
// object. Small on purpose — no travel, no teleport, no lane proof needed
// for eating; range alone gates the interaction. Amounts are bounded so a
// single tick cannot drain an alley.
export const SCAVENGE_RANGE_M = 3;
export const SCAVENGE_MAX_KG = 1.0;
export const SCAVENGE_MIN_KG = 0.01;
const assert = (ok, why) => { if (!ok) throw new Error('action: ' + why); };
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128;
const isVec = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);

// What an agent perceived. Observations are about the present or past —
// never the future. Basis observations must belong to the acting citizen.
export function validateObservation(obs, { citizenIds, tick }) {
  assert(obs && obs.schemaVersion === OBSERVATION_CONTRACT, 'observation schema');
  assert(isId(obs.observerId) && citizenIds.includes(obs.observerId), 'unknown observer');
  assert(Number.isInteger(obs.tick) && obs.tick >= 0 && obs.tick <= tick, 'observation from the future');
  assert(typeof obs.kind === 'string' && obs.kind.length > 0, 'observation kind');
  assert(isId(obs.observationId), 'observation id');
  return true;
}

// What an agent proposes. Space is closed: move targets must sit within
// one tick of the actor AND on walkable lane geometry; socialize needs a
// real citizen in range; every basis observation must be the actor's own,
// from action time or earlier.
export function distToLanes(x, z, lanes) {
  let best = Infinity;
  for (const lane of lanes || []) {
    const pts = lane.waypoints || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, lenSq = dx * dx + dz * dz;
      let t = 0;
      if (lenSq > 1e-9) t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lenSq));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
  }
  return best;
}
export const LANE_TOLERANCE_M = 8;
export function validateAction(action, { citizenIds, positions, tick, lanes = null, patchesById = null, objectsById = null, agentsById = null }) {
  assert(action && action.schemaVersion === ACTION_CONTRACT, 'action schema');
  assert(isId(action.actionId), 'action id');
  assert(isId(action.actorId) && citizenIds.includes(action.actorId), 'unknown actor');
  assert(Number.isInteger(action.tick) && action.tick >= 0 && action.tick <= tick + 1, 'action tick out of range');
  assert(ACTION_TYPES.includes(action.type), 'unknown action type: ' + action.type);
  assert(Array.isArray(action.basis), 'action basis must list observations');
  for (const o of action.basis) {
    validateObservation(o, { citizenIds, tick: action.tick });
    assert(o.observerId === action.actorId, 'observation belongs to another citizen');
  }
  const self = positions[action.actorId];
  assert(self && isVec([self.x, self.z]), 'actor position unknown');
  if (action.type === 'move') {
    const t = action.params && action.params.to;
    assert(t && isVec([t.x, t.z]), 'move needs a target');
    assert(Math.hypot(t.x - self.x, t.z - self.z) <= MAX_MOVE_M, 'teleport rejected');
    assert(Array.isArray(lanes) && lanes.length > 0, 'move needs lane geometry');
    assert(distToLanes(t.x, t.z, lanes) <= LANE_TOLERANCE_M, 'target off walkable lanes');
  }
  if (action.type === 'socialize') {
    const other = action.params && action.params.with;
    assert(isId(other) && citizenIds.includes(other), 'socialize needs a real citizen');
    assert(other !== action.actorId, 'cannot socialize with self');
    const o = positions[other];
    assert(o && isVec([o.x, o.z]), 'partner position unknown');
    assert(Math.hypot(o.x - self.x, o.z - self.z) <= SOCIAL_RANGE_M, 'partner out of range');
  }
  if (action.type === 'scavenge') {
    // Grounded scavenging (P017.4): narrowly allowlisted capability with
    // the same validation → commit → effect → receipt architecture. Every
    // check re-reads LIVE state at commitment time: advertised stock or a
    // decision score is never proof of current availability.
    const p = action.params || {};
    assert(isId(p.objectId), 'scavenge needs an object');
    assert(isId(p.patchId), 'scavenge needs a patch');
    // 1. Actor exists and is alive.
    if (agentsById) {
      const agent = agentsById[action.actorId];
      assert(agent, 'scavenge: actor unknown');
      assert(agent.alive !== false, 'scavenge: actor is dead');
    }
    // 2. Object and ecological patch exist and are associated.
    assert(objectsById && patchesById, 'scavenge needs object and patch state');
    const object = objectsById[p.objectId];
    const patch = patchesById[p.patchId];
    assert(object, 'scavenge: unknown object ' + p.objectId);
    assert(patch, 'scavenge: unknown patch ' + p.patchId);
    assert(object.patchId === patch.id, 'scavenge: object and patch not associated');
    // 3. Actor is within the defined interaction range of the object.
    assert(isVec([object.x, object.z]), 'scavenge: object position unknown');
    assert(Math.hypot(object.x - self.x, object.z - self.z) <= SCAVENGE_RANGE_M, 'scavenge: target out of range');
    // 4. Requested consumption is finite, positive, and bounded.
    assert(typeof p.amountKg === 'number' && Number.isFinite(p.amountKg), 'scavenge: amount must be finite');
    assert(p.amountKg >= SCAVENGE_MIN_KG && p.amountKg <= SCAVENGE_MAX_KG, 'scavenge: amount out of bounds');
    // 5. The patch contains sufficient fresh food — otherwise a partial
    // fulfillment could masquerade as a complete commitment.
    assert(typeof patch.fresh === 'number' && Number.isFinite(patch.fresh), 'scavenge: patch stock unknown');
    assert(patch.fresh >= p.amountKg, 'scavenge: insufficient stock');
    // 6. Causal validity (tick order, no duplicate) is enforced in
    // commitAction below, which always validates first.
  }
  return true;
}

// Commitment is deterministic and closed: commitAction ALWAYS validates
// first (there is no path from an unvalidated action to an event),
// enforces causal order against the last committed tick, and rejects
// already-applied event IDs. The journal seals the event; this layer
// never rewrites history.
// Commit checks the applied set but never mutates it: the caller records
// the ID after the effect applies, so commit and apply share one
// exactly-once record. The journal seals the event; this layer never
// rewrites history.
export function commitAction(action, ctx, appliedIds = new Set(), lastTick = -1) {
  validateAction(action, ctx);
  assert(action.tick >= lastTick, 'causal order: action predates last commit');
  const eventId = `ev-${action.tick}-${action.actionId}`;
  assert(!appliedIds.has(eventId), 'duplicate execution');
  return {
    schemaVersion: EVENT_CONTRACT,
    eventId,
    tick: action.tick,
    actionId: action.actionId,
    actorId: action.actorId,
    type: action.type,
    params: JSON.parse(JSON.stringify(action.params || {})),
    basis: (action.basis || []).map((o) => o.observationId),
    generated: false,
  };
}

export function actionReceipt(action, eventOrReasons) {
  if (Array.isArray(eventOrReasons)) return { actionId: action.actionId, status: 'rejected', reasons: eventOrReasons };
  return { actionId: action.actionId, status: 'committed', eventId: eventOrReasons.eventId };
}
