// Life Itself Manhattan — autonomous action/event contract (Phase 017,
// slice 017.2). Versioned Observation → ProposedAction → WorldEvent →
// Receipt pipeline. Pure: no I/O, no model, no provider. Committed events
// are journal-shaped so the island's StateJournal can seal them unchanged;
// validation fails closed before anything is committed.
export const ACTION_CONTRACT = 'life-itself-action/1.0.0';
export const OBSERVATION_CONTRACT = 'life-itself-observation/1.0.0';
export const EVENT_CONTRACT = 'life-itself-world-event/1.0.0';
export const ACTION_TYPES = ['move', 'rest', 'socialize'];
// Single-tick plausibility bounds (5-second tick, ~1.5 m/s walkers).
export const MAX_MOVE_M = 10;
export const SOCIAL_RANGE_M = 25;
const assert = (ok, why) => { if (!ok) throw new Error('action: ' + why); };
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128;
const isVec = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);

// What an agent perceived. Observations are about the present or past —
// never the future.
export function validateObservation(obs, { citizenIds, tick }) {
  assert(obs && obs.schemaVersion === OBSERVATION_CONTRACT, 'observation schema');
  assert(isId(obs.observerId) && citizenIds.includes(obs.observerId), 'unknown observer');
  assert(Number.isInteger(obs.tick) && obs.tick >= 0 && obs.tick <= tick, 'observation from the future');
  assert(typeof obs.kind === 'string' && obs.kind.length > 0, 'observation kind');
  return true;
}

// What an agent proposes. Space is closed: move targets must sit within
// one tick of the actor; socialize needs a real citizen in range.
export function validateAction(action, { citizenIds, positions, tick }) {
  assert(action && action.schemaVersion === ACTION_CONTRACT, 'action schema');
  assert(isId(action.actionId), 'action id');
  assert(isId(action.actorId) && citizenIds.includes(action.actorId), 'unknown actor');
  assert(Number.isInteger(action.tick) && action.tick >= 0 && action.tick <= tick + 1, 'action tick out of range');
  assert(ACTION_TYPES.includes(action.type), 'unknown action type: ' + action.type);
  assert(Array.isArray(action.basis), 'action basis must list observations');
  const self = positions[action.actorId];
  assert(self && isVec([self.x, self.z]), 'actor position unknown');
  if (action.type === 'move') {
    const t = action.params && action.params.to;
    assert(t && isVec([t.x, t.z]), 'move needs a target');
    assert(Math.hypot(t.x - self.x, t.z - self.z) <= MAX_MOVE_M, 'teleport rejected');
  }
  if (action.type === 'socialize') {
    const other = action.params && action.params.with;
    assert(isId(other) && citizenIds.includes(other), 'socialize needs a real citizen');
    assert(other !== action.actorId, 'cannot socialize with self');
    const o = positions[other];
    assert(o && isVec([o.x, o.z]), 'partner position unknown');
    assert(Math.hypot(o.x - self.x, o.z - self.z) <= SOCIAL_RANGE_M, 'partner out of range');
  }
  return true;
}

// Commitment is deterministic: the event ID derives from tick + action.
// The journal seals it; this layer never rewrites history.
export function commitAction(action) {
  return {
    schemaVersion: EVENT_CONTRACT,
    eventId: `ev-${action.tick}-${action.actionId}`,
    tick: action.tick,
    actionId: action.actionId,
    actorId: action.actorId,
    type: action.type,
    params: JSON.parse(JSON.stringify(action.params || {})),
    generated: false,
  };
}

export function actionReceipt(action, eventOrReasons) {
  if (Array.isArray(eventOrReasons)) return { actionId: action.actionId, status: 'rejected', reasons: eventOrReasons };
  return { actionId: action.actionId, status: 'committed', eventId: eventOrReasons.eventId };
}
