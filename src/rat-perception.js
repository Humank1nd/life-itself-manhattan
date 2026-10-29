// Life Itself Manhattan — read-only rat perception bridge (P017.6).
// A pure projection from authoritative rat state to a small DOM view
// model. This module never mutates the world, never commits, never
// applies, never journals: it reads live state through the existing
// advertise/decide functions (which are themselves pure) and freezes the
// result, so no consumer — UI or otherwise — can write back through it.
//
// Data path: live rats + pinned alley objects/patches → advertise →
// decide → frozen view model → DOM text. The panel commits nothing; when
// the running simulation has produced no decision for a rat, the renderer
// says so instead of substituting fixtures or aggregates.
//
// No DOM, no I/O, no model, no provider. Safe to import in Node gates.
import {
  POLICY_REVISION,
  advertiseObject, advertisementToObservation,
  decideForRat,
} from './object-affordances.js';
// Alley construction lives in the simulation's own module: the panel
// never builds world state, it only reads it. Re-exported here so
// existing gate imports keep working.
export { buildAlley } from './object-affordances.js';

export const RAT_VIEW_CONTRACT = 'life-itself-rat-view/1.0.0';
export const NO_DECISION_TEXT = 'No rat decision available';

const assert = (ok, why) => { if (!ok) throw new Error('perception: ' + why); };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

// Alley construction lives in the simulation's own module
// (object-affordances.js, shared with establishAlley): the panel never
// builds world state, it only reads it. Re-exported here so existing gate
// imports keep working.

// One pure pass over live state: advertise each object, wrap in the
// rat's own observations, decide, and freeze the view model. Returns null
// when there is no rat to read (unknown selection) — the panel renders
// NO_DECISION_TEXT. Throws fail-closed on malformed world input; the
// caller converts that to the same empty state, never to invented values.
export function snapshotLiveRat({ rat, tick, ecoDay, patches, objects, receipts = [] }) {
  if (!rat) return null;
  assert(Number.isInteger(tick) && tick >= 0, 'snapshot needs a tick');
  assert(Number.isInteger(ecoDay) && ecoDay >= 0, 'snapshot needs an ecoDay');
  assert(Array.isArray(patches) && Array.isArray(objects), 'snapshot needs alley state');
  // Receipts are caller-supplied evidence of GENUINE runtime commits
  // (actionReceipt-shaped). The bridge never creates them: the default is
  // empty, and anything malformed is rejected rather than displayed.
  assert(Array.isArray(receipts), 'receipts must be a list');
  for (const r of receipts) {
    assert(r && typeof r.actionId === 'string' && typeof r.status === 'string', 'receipt shape');
    if (r.status === 'committed') assert(typeof r.eventId === 'string', 'committed receipt needs an event id');
  }
  const patchesById = Object.fromEntries(patches.map((p) => [p.id, p]));
  const objectsById = Object.fromEntries(objects.map((o) => [o.id, o]));
  const ads = objects.map((o) => advertiseObject(o, patchesById[o.patchId], { tick, ecoDay }));
  const observations = ads.map((ad) => advertisementToObservation(ad, rat.id));
  const decision = decideForRat({ rat, motives: rat.motives, advertisements: ads,
    patchesById, objectsById, tick,
    observationIds: observations.map((o) => o.observationId) });
  const evidenceByObject = {};
  const patchByObject = {};
  const provenanceByObject = {};
  for (const ad of ads) {
    evidenceByObject[ad.objectId] = {
      freshKg: ad.evidence.freshKg,
      forageValue: ad.evidence.forageValue,
      disturbance: ad.evidence.disturbance,
      marksCount: ad.evidence.marksCount,
    };
    patchByObject[ad.objectId] = ad.patchId;
    // Provenance as declared by the authoritative object descriptor:
    // 'simulated' is simulation-owned state, never a real-world claim.
    provenanceByObject[ad.objectId] = objectsById[ad.objectId].provenance ?? 'unknown';
  }
  return deepFreeze({
    schemaVersion: RAT_VIEW_CONTRACT,
    actorId: rat.id,
    asOfTick: tick,
    ecoDay,
    evidenceByObject,
    // Frozen object→patch linkage as advertised: live refresh resolves
    // current stock through this map, never through caller input.
    patchByObject,
    provenanceByObject,
    evaluated: decision.evaluated,
    chosen: decision.chosen,
    policyRevision: decision.policyRevision,
    // Genuine committed receipts only: the bridge never commits, so this
    // is empty unless the caller passes real runtime receipts. The panel
    // renders exactly what is here — never an invented receipt.
    receipts: receipts.map((r) => ({ ...r })),
  });
}

// Live-availability refresh: re-read current stock WITHOUT re-deciding,
// so the panel can show a historical snapshot next to the present truth.
// Missing/non-finite stock reads as 'unknown' — never substituted, never
// displayed as current.
export function refreshLiveAvailability(viewModel, patchesById, tick) {
  assert(viewModel && viewModel.schemaVersion === RAT_VIEW_CONTRACT, 'live refresh needs a view model');
  assert(Number.isInteger(tick) && tick >= 0, 'live refresh needs a tick');
  assert(patchesById && typeof patchesById === 'object', 'live refresh needs patches');
  const liveFreshByObject = {};
  const changed = [], unknown = [];
  for (const [objectId, ev] of Object.entries(viewModel.evidenceByObject)) {
    // Resolve through the frozen snapshot linkage, never caller input.
    const live = patchesById[viewModel.patchByObject[objectId]];
    if (!live || !isNum(live.fresh)) {
      liveFreshByObject[objectId] = 'unknown';
      unknown.push(objectId);
    } else {
      liveFreshByObject[objectId] = live.fresh;
      if (live.fresh !== ev.freshKg) changed.push(objectId);
    }
  }
  return deepFreeze({
    asOfTick: viewModel.asOfTick,
    currentTick: tick,
    stale: tick !== viewModel.asOfTick,
    liveFreshByObject,
    changed,
    unknown,
  });
}

// Plain-text panel rendering shared by the gate and the browser panel,
// so the tested wording IS the shipped wording. Null view → the exact
// empty-state string; stale live data → an explicit historical banner
// with current values alongside, never stale values as current.
export function renderRatPanelText(viewModel, live) {
  if (!viewModel) return NO_DECISION_TEXT;
  const lines = [];
  lines.push(`rat ${viewModel.actorId} · decision tick ${viewModel.asOfTick} · policy ${viewModel.policyRevision}`);
  if (live && live.stale) {
    lines.push(`historical snapshot from tick ${live.asOfTick} — current tick ${live.currentTick}; snapshot values are NOT current`);
  }
  for (const [objectId, ev] of Object.entries(viewModel.evidenceByObject)) {
    const prov = viewModel.provenanceByObject ? viewModel.provenanceByObject[objectId] : 'unknown';
    let suffix = `fresh ${ev.freshKg}kg forage ${Math.round(ev.forageValue)} disturbance ${ev.disturbance}`;
    if (live && live.liveFreshByObject && objectId in live.liveFreshByObject) {
      const lf = live.liveFreshByObject[objectId];
      suffix += lf === 'unknown' ? ' · live stock unknown' : ` · live now ${lf}kg`;
    }
    lines.push(`- ${objectId} [${prov}]: ${suffix}`);
  }
  for (const e of viewModel.evaluated) {
    const why = e.eligible ? '' : ` [${e.rejectionReasons.join(', ')}]`;
    lines.push(`  ${e.eligible ? 'ELIGIBLE' : 'ineligible'} ${e.objectId}/${e.interactionId} score ${e.score}${why}`);
  }
  if (viewModel.chosen) {
    lines.push(`chosen: ${viewModel.chosen.objectId}/${viewModel.chosen.interactionId} @ ${viewModel.chosen.score}`);
  } else {
    lines.push('chosen: none (nothing eligible and executable)');
  }
  if (viewModel.receipts.length === 0) {
    lines.push('receipts: none — viewing only; no actions committed from this panel');
  } else {
    for (const r of viewModel.receipts) {
      lines.push(`receipt: ${r.actionId} → ${r.status}${r.eventId ? ' ' + r.eventId : ''}`);
    }
  }
  return lines.join('\n');
}

export { POLICY_REVISION };
