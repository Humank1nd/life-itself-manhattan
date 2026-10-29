// Life Itself Manhattan — world-model grounding contract (Phase A+).
// Proves one complete loop: a real stack component emits typed,
// source-attributed data; Life Itself verifies and reconciles it;
// the reconciled world changes the next rat decision. Pure: hashing
// happens at the boundary (Node crypto in tests/CI); this module only
// compares, validates and applies. No model, no provider.
export const REPORT_CONTRACT = 'life-itself-grounded-report/1.0.0';
export const KNOWN_SOURCES = ['restaurant-pulse', 'sanitation-schedule', 'weather-station'];
// Only restaurant-pulse is implemented. The others are recognized names
// with explicitly unimplemented adapters — never silently accepted.
const IMPLEMENTED = new Set(['restaurant-pulse']);
const HEX64 = /^[0-9a-f]{64}$/;
const assert = (ok, why) => { if (!ok) throw new Error('grounding: ' + why); };
export function attestReport({ sourceId, reportId, payload, sha256, tick }) {
  assert(KNOWN_SOURCES.includes(sourceId), 'unknown source: ' + sourceId);
  assert(typeof reportId === 'string' && reportId.length > 0, 'report id required');
  assert(HEX64.test(sha256 || ''), 'report hash required');
  assert(Number.isInteger(tick) && tick >= 0, 'report tick required');
  assert(payload && typeof payload === 'object', 'report payload required');
  return { schemaVersion: REPORT_CONTRACT, sourceId, reportId, sha256, receivedTick: tick,
    payload: JSON.parse(JSON.stringify(payload)) };
}
export function verifyReportHash(attestation, recomputedSha256) {
  assert(attestation && attestation.schemaVersion === REPORT_CONTRACT, 'not an attested report');
  assert(typeof recomputedSha256 === 'string' && recomputedSha256 === attestation.sha256, 'payload hash mismatch');
  return true;
}
// Reconcile into the world. Returns a description of the applied effect.
// Unknown sources and unimplemented adapters are rejected, never ignored.
export function reconcileReport(world, attestation, seenIds) {
  assert(!seenIds.has(attestation.reportId), 'duplicate report: ' + attestation.reportId);
  if (!IMPLEMENTED.has(attestation.sourceId)) throw new Error('grounding: adapter not implemented for ' + attestation.sourceId);
  const p = attestation.payload;
  if (attestation.sourceId === 'restaurant-pulse') {
    assert(typeof p.patchId === 'string' && p.patchId.length > 0, 'restaurant-pulse needs patchId');
    assert(typeof p.wasteKg === 'number' && p.wasteKg >= 0 && Number.isFinite(p.wasteKg), 'restaurant-pulse needs wasteKg');
    const patch = world.patches.find((q) => q.id === p.patchId);
    assert(patch, 'unknown patch: ' + p.patchId);
    patch.fresh += p.wasteKg;
    patch.addedKg += p.wasteKg;
  }
  seenIds.add(attestation.reportId);
  return { applied: attestation.reportId, source: attestation.sourceId };
}
