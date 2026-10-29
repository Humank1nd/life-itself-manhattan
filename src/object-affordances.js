// Life Itself Manhattan — grounded object affordances + explainable decisions
// (STREET RAT P017.4). Clean-room original: objects advertise grounded
// interaction opportunities, rats score them with inspectable arithmetic,
// and the existing action contract (action-contract.js) alone authorizes
// execution. This module never mutates the world and never commits.
//
// Separation (no FreeSO code, BHAVs, TTAB parsers, assets, or GPL-family
// source imported or ported — only the conceptual split between
// *interaction availability* and *autonomous selection* is translated):
//   advertise  — snapshot of opportunity from validated live state
//   decide     — deterministic ranking over advertisements + motives
//   commit     — action-contract.js revalidates live state at commit time
//   apply      — citizen-agency.js applies the guarded ecological effect
//
// Conventions preserved:
//   motives.hunger is 0..100 with 70 at spawn; LOWER means HUNGRIER
//   (below 60 is genuinely hungry). hungerDeficit = (100 - hunger) / 100.
//   forageValue() is attraction/ranking signal (0..100), NOT kilograms of
//   edible food — never consumed as inventory. Only patch.fresh (kg) is stock.
//   All scoring coefficients are gameplay hypotheses, not rat biology.
import { forageValue } from './ecology.js';
import { OBSERVATION_CONTRACT } from './action-contract.js';

export const AFFORDANCE_CONTRACT = 'life-itself-affordance/1.0.0';
export const DECISION_CONTRACT = 'life-itself-affordance-decision/1.0.0';

// Pinned scoring-policy revision. Bumped only when the arithmetic below
// changes; decision records carry it so audits can reproduce scores.
export const POLICY_REVISION = 'scavenge-v1';

// Lawful interaction envelope for the alley demo. Small on purpose: a rat
// must already be at the dumpster, not teleport to it.
export const INTERACTION_RANGE_M = 3;
// Minimum fresh stock (kg) for scavenging to be offered as eligible.
export const MIN_MEAL_KG = 0.05;
// Reference stock (kg) normalizing foodAvailability to 0..1. Gameplay
// hypothesis: ~2 kg is a full alley meal for scoring purposes.
export const FOOD_REF_KG = 2.0;
// Investigate utility base. Deliberately below any real scavenge score
// when food is present, so a hungry rat with food available always ranks
// scavenging first. Gameplay hypothesis, not ethology.
export const INVESTIGATE_BASE = 0.12;
// Score scale is 0..1 (product of four 0..1 factors). Rounding is
// deterministic: round-half-up to 4 decimals via Math.round.
export const SCORE_SCALE = '0..1 product; round-half-up to 4 decimals';

const assert = (ok, why) => { if (!ok) throw new Error('affordance: ' + why); };
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Runtime-independent string order (code-unit comparison): deterministic
// across engines and ICU configurations, unlike localeCompare.
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const round4 = (v) => {
  assert(isNum(v), 'score must be finite before rounding');
  return Math.round(v * 10000) / 10000;
};

export const OBJECT_KINDS = ['dumpster', 'shelter', 'doorway'];

// Test-only world object. Pure data: identity + pose + patch association +
// revision. No occupancy field exists on the object model — occupancy must
// never be invented; evidence comes from the associated ecological patch
// instead. `rev` starts at 1 and MUST be bumped via reviseObject() on any
// change to the pinned properties (kind, position, patch link); the
// checkpoint pins (id, rev) plus the full descriptor, so a silent
// substitution reads as a mismatch, not a quiet drift.
export function makeWorldObject({ id, kind, x, z, patchId = null, rev = 1 }) {
  assert(isId(id), 'object id required');
  assert(OBJECT_KINDS.includes(kind), 'unknown object kind: ' + kind);
  assert(isNum(x) && isNum(z), 'object position required');
  if (patchId !== null) assert(isId(patchId), 'patch id malformed');
  assert(Number.isInteger(rev) && rev >= 0, 'object revision required');
  return { id, kind, x, z, patchId, rev };
}

// The only lawful way to change a pinned world object: returns a new
// descriptor with the caller's property updates and rev incremented. The
// id is immutable — a new id is a new object, not a revision.
export function reviseObject(object, changes = {}) {
  assert(object && isId(object.id), 'revise needs an object');
  assert(Number.isInteger(object.rev) && object.rev >= 0, 'revise needs a revision');
  assert(changes && typeof changes === 'object', 'revise needs a changes object');
  assert(changes.id === undefined || changes.id === object.id, 'object id is immutable');
  assert(changes.rev === undefined, 'rev is assigned, not requested');
  const next = { ...object, ...changes, id: object.id, rev: object.rev + 1 };
  if (next.patchId !== null) assert(isId(next.patchId), 'patch id malformed');
  assert(OBJECT_KINDS.includes(next.kind), 'unknown object kind: ' + next.kind);
  assert(isNum(next.x) && isNum(next.z), 'object position required');
  return next;
}

// Advertisement: a snapshot of opportunity, NOT authorization to act.
// Contract life-itself-affordance/1.0.0:
//   advertisementId stable for (object, tick); evidence holds validated
//   live state (fresh kg, computed forageValue, disturbance, and only the
//   occupancy information the models actually carry — patch scent-mark
//   count, explicitly not an object-occupancy measurement).
export function advertiseObject(object, patch, { tick, ecoDay }) {
  assert(object && isId(object.id), 'advertise needs an object');
  assert(OBJECT_KINDS.includes(object.kind), 'advertise: unknown object kind');
  assert(Number.isInteger(tick) && tick >= 0, 'advertise needs a tick');
  assert(Number.isInteger(ecoDay) && ecoDay >= 0, 'advertise needs an ecoDay');
  assert(patch && patch.id === object.patchId, 'advertise: object and patch must be associated');
  for (const k of ['fresh', 'disturbance']) assert(isNum(patch[k]), 'advertise: patch field ' + k);
  assert(Array.isArray(patch.marks), 'advertise: patch marks missing');
  const forage = forageValue(patch);
  assert(isNum(forage), 'advertise: forageValue non-finite');
  const evidence = {
    // Grounded consumable stock (kg). The ONLY quantity commit trusts.
    // Exposed under both the patch-field name (`fresh`, per the §2 schema)
    // and the scoring name (`freshKg`): one validated value, two labels.
    fresh: patch.fresh,
    freshKg: patch.fresh,
    // Attraction/ranking signal (0..100), computed via forageValue() —
    // not a stored patch property. Not inventory — never consumed.
    forageValue: forage,
    disturbance: patch.disturbance,
    // Actual occupancy-adjacent information available: how many scent marks
    // the patch carries. This is patch history, not an object-occupancy
    // measurement (the object model has no occupancy field).
    marksCount: patch.marks.length,
  };
  const at = { x: object.x, z: object.z };
  const candidates = [
    {
      interactionId: 'scavenge-fresh',
      actionType: 'scavenge',
      preconditions: {
        rangeM: INTERACTION_RANGE_M,
        needsFreshKg: MIN_MEAL_KG,
        objectAvailable: true,
        patchAssociated: object.patchId,
      },
      // Predicted benefits for explanation only — explicitly NOT
      // authoritative. Commit rechecks live stock; apply books via graze().
      estimatedEffects: {
        note: 'prediction-only; commit revalidates live patch.fresh',
        freshDeltaKg: -MIN_MEAL_KG,
        hungerDelta: 'positive (satiating), bounded 0..100; exact amount set at apply time',
      },
      evidenceRefs: [`patch:${patch.id}.fresh`, `patch:${patch.id}.forageValue`, `patch:${patch.id}.disturbance`],
    },
    {
      interactionId: 'investigate-scent',
      // No executable action implemented: must never be submitted. The
      // decision layer scores it for explanation but marks it ineligible.
      actionType: null,
      preconditions: { rangeM: INTERACTION_RANGE_M, objectAvailable: true },
      estimatedEffects: {
        note: 'prediction-only; no executable action type implemented',
        utilityBasis: 'curiosity fallback when no food is available',
      },
      evidenceRefs: [`patch:${patch.id}.disturbance`, `patch:${patch.id}.marksCount`],
    },
  ];
  return {
    schemaVersion: AFFORDANCE_CONTRACT,
    advertisementId: `adv-${object.id}-t${tick}`,
    objectId: object.id,
    objectKind: object.kind,
    patchId: object.patchId,
    tick,
    ecoDay,
    position: at,
    evidence,
    candidates,
  };
}

// The advertisement rides inside an existing-version Observation with a
// distinct kind — no second, competing observation authority. Passes the
// existing validateObservation unchanged (extra fields are allowed).
export function advertisementToObservation(ad, observerId) {
  assert(ad && ad.schemaVersion === AFFORDANCE_CONTRACT, 'observation needs an advertisement');
  assert(isId(observerId), 'observation needs an observer');
  return {
    schemaVersion: OBSERVATION_CONTRACT,
    observationId: `obs-${ad.tick}-${observerId}-${ad.advertisementId}`,
    observerId,
    tick: ad.tick,
    kind: 'object-affordance',
    summary: `${ad.objectKind} ${ad.objectId} fresh ${ad.evidence.fresh} forage ${Math.round(ad.evidence.forageValue)}`,
    advertisement: JSON.parse(JSON.stringify(ad)),
  };
}

// Scoring factors. All inputs come from live state at decision time;
// the advertisement's evidence is the snapshot the score explains.
export function scavengeFactors({ hunger, freshKg, disturbance, distanceM }) {
  assert(isNum(hunger) && hunger >= 0 && hunger <= 100, 'hunger out of range');
  assert(isNum(freshKg) && freshKg >= 0, 'fresh stock must be non-negative finite');
  assert(isNum(disturbance) && disturbance >= 0 && disturbance <= 1, 'disturbance out of range');
  assert(isNum(distanceM) && distanceM >= 0, 'distance must be non-negative finite');
  const hungerDeficit = (100 - hunger) / 100;
  // Food availability from ACTUAL consumable stock (patch.fresh kg),
  // normalized by FOOD_REF_KG — never from forageValue-as-inventory.
  const foodAvailability = clamp01(freshKg / FOOD_REF_KG);
  // Safety from established disturbance/risk values (gameplay hypothesis).
  const safetyFactor = 1 - 0.5 * disturbance;
  // Bounded, monotonically decreasing in distance (spec example).
  const distanceFactor = 1 / (1 + distanceM / 10);
  return { hungerDeficit, foodAvailability, safetyFactor, distanceFactor };
}

export function scoreScavenge(inputs) {
  const f = scavengeFactors(inputs);
  const score = f.hungerDeficit * f.foodAvailability * f.safetyFactor * f.distanceFactor;
  assert(isNum(score), 'scavenge score non-finite');
  return { score: round4(score), factors: {
    hungerDeficit: round4(f.hungerDeficit),
    foodAvailability: round4(f.foodAvailability),
    safetyFactor: round4(f.safetyFactor),
    distanceFactor: round4(f.distanceFactor),
  } };
}

// A different utility estimate for investigation (curiosity fallback).
// Never submitted as an executable action while actionType is null.
export function scoreInvestigate({ disturbance, distanceM }) {
  assert(isNum(disturbance) && disturbance >= 0 && disturbance <= 1, 'disturbance out of range');
  assert(isNum(distanceM) && distanceM >= 0, 'distance must be non-negative finite');
  const safetyFactor = 1 - 0.5 * disturbance;
  const distanceFactor = 1 / (1 + distanceM / 10);
  const score = INVESTIGATE_BASE * safetyFactor * distanceFactor;
  assert(isNum(score), 'investigate score non-finite');
  return { score: round4(score), factors: {
    base: INVESTIGATE_BASE, safetyFactor: round4(safetyFactor), distanceFactor: round4(distanceFactor),
  } };
}

function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

// Full decision record. Contract life-itself-affordance-decision/1.0.0.
// Every considered candidate appears in `evaluated` with eligibility,
// rejection reasons, score, and factors. Stable ordering (objectId,
// interactionId) + deterministic tie-break (first in order wins ties).
// Scores are finite, deterministic, reproducible.
export function decideForRat({ rat, motives, advertisements, patchesById, objectsById, tick, observationIds = [], policyRevision = POLICY_REVISION }) {
  assert(rat && isId(rat.id), 'decision needs a rat');
  assert(motives && isNum(motives.hunger), 'decision needs motives.hunger');
  assert(Array.isArray(advertisements), 'decision needs advertisements');
  assert(patchesById && typeof patchesById === 'object', 'decision needs patches');
  assert(objectsById && typeof objectsById === 'object', 'decision needs objects');
  assert(Number.isInteger(tick) && tick >= 0, 'decision needs a tick');
  assert(Array.isArray(observationIds), 'decision needs observation ids');
  assert(isId(policyRevision), 'decision needs a policy revision');
  const actorId = rat.id;
  const evaluated = [];
  // Stable candidate ordering across advertisements and within each ad.
  // Code-unit comparison: identical byte order on every engine/ICU.
  const ads = [...advertisements].sort((a, b) => cmpStr(String(a.objectId), String(b.objectId)));
  for (const ad of ads) {
    assert(ad && ad.schemaVersion === AFFORDANCE_CONTRACT, 'decision: advertisement schema');
    // Fail closed on malformed evidence: never substitute zero coordinates,
    // zero disturbance, or missing stock. The constructor above guarantees
    // these, so a violation means tampering or a foreign producer.
    assert(ad.evidence && typeof ad.evidence === 'object', 'decision: advertisement evidence missing');
    for (const k of ['fresh', 'freshKg', 'forageValue', 'disturbance']) {
      assert(isNum(ad.evidence[k]), 'decision: evidence field ' + k);
    }
    assert(ad.position && isNum(ad.position.x) && isNum(ad.position.z), 'decision: advertisement position');
    assert(Number.isInteger(ad.tick) && ad.tick >= 0, 'decision: advertisement tick');
    const object = objectsById[ad.objectId];
    const patch = patchesById[ad.patchId];
    const cands = [...(ad.candidates || [])].sort((a, b) => cmpStr(String(a.interactionId), String(b.interactionId)));
    for (const c of cands) {
      const rejectionReasons = [];
      let eligible = true;
      let score = 0;
      let factors = {};
      const fail = (why) => { eligible = false; rejectionReasons.push(why); };
      if (!object) fail('missing-object');
      if (!patch) fail('missing-patch');
      if (object && patch && object.patchId !== patch.id) fail('object-patch-mismatch');
      if (rat.alive === false) fail('actor-dead');
      let distanceM = Infinity;
      if (object) {
        distanceM = dist2(rat.x, rat.z, object.x, object.z);
        if (!(distanceM <= INTERACTION_RANGE_M)) fail('out-of-range');
      }
      if (c.interactionId === 'scavenge-fresh') {
        if (c.actionType !== 'scavenge') fail('unknown-interaction-type');
        const freshKg = patch ? patch.fresh : NaN;
        if (patch && !(isNum(freshKg) && freshKg >= MIN_MEAL_KG)) fail('insufficient-stock');
        if (eligible) {
          const s = scoreScavenge({ hunger: motives.hunger, freshKg: patch.fresh, disturbance: patch.disturbance, distanceM });
          score = s.score; factors = s.factors;
        } else {
          // Ineligible: record a zero score with NO invented inputs. The
          // audit trail keeps eligibility + rejection reasons; a score is
          // only meaningful for an eligible candidate or the scored-but-
          // never-executable investigation fallback below.
          score = 0; factors = { ineligible: true };
        }
      } else if (c.interactionId === 'investigate-scent') {
        // Different utility estimate; never executable until implemented.
        // Scored only when the live inputs are valid — otherwise zero with
        // no substitution.
        fail('action-type-unimplemented');
        if (patch && object && isNum(patch.disturbance) && isNum(distanceM)) {
          const s = scoreInvestigate({ disturbance: patch.disturbance, distanceM });
          score = s.score; factors = s.factors;
        } else { score = 0; factors = { ineligible: true }; }
      } else {
        fail('unknown-interaction-type');
        score = 0; factors = { ineligible: true };
      }
      assert(isNum(score), 'decision: non-finite score for ' + c.interactionId);
      evaluated.push({ objectId: ad.objectId, interactionId: c.interactionId, eligible, rejectionReasons, score, factors });
    }
  }
  // Deterministic ranking: eligible only, score desc, then stable order.
  // (evaluated is in runtime-independent code-unit order and the pick is
  // strictly-greater, so the first entry wins ties on every engine.)
  // The winner is the highest-scoring ELIGIBLE candidate — investigation
  // is always ineligible (no executable action type), so `chosen` is
  // either an executable commitment or null. Never hardcoded by identity.
  let chosen = null;
  for (const e of evaluated) {
    if (!e.eligible) continue;
    if (!chosen || e.score > chosen.score) chosen = { ...e };
  }
  return {
    schemaVersion: DECISION_CONTRACT,
    decisionId: `dec-${tick}-${actorId}`,
    actorId,
    tick,
    observationIds: [...observationIds],
    evaluated,
    chosen,
    policyRevision,
  };
}

// Build the lawful scavenge action from a chosen decision entry. Stock is
// deliberately NOT trusted here — commitAction rechecks live patch.fresh.
export function buildScavengeAction({ actorId, tick, observation, objectId, patchId, amountKg, actionSeq = 'scavenge' }) {
  assert(isId(actorId), 'action needs an actor');
  assert(Number.isInteger(tick) && tick >= 0, 'action needs a tick');
  assert(observation && observation.schemaVersion === OBSERVATION_CONTRACT, 'action needs a basis observation');
  assert(isId(objectId) && isId(patchId), 'action needs object and patch');
  assert(isNum(amountKg) && amountKg > 0, 'action needs a positive amount');
  return {
    schemaVersion: 'life-itself-action/1.0.0',
    actionId: `act-${tick}-${actorId}-${actionSeq}`,
    actorId,
    tick,
    type: 'scavenge',
    params: { objectId, patchId, amountKg },
    basis: [observation],
  };
}
