// Life Itself Manhattan — world-model grounding contract (Phase A+).
// Proves one complete loop: a real stack component emits typed,
// source-attributed data; Life Itself verifies and reconciles it;
// the reconciled world changes the next rat decision. Pure: hashing
// happens at the boundary (Node crypto in tests/CI); this module only
// compares, validates and applies. No model, no provider.
import { tickPatch } from './ecology.js';
import { sanitationDue, sanitationReportId } from './grounding-producer.js';
export const REPORT_CONTRACT = 'life-itself-grounded-report/1.0.0';
export const KNOWN_SOURCES = ['restaurant-pulse', 'sanitation-schedule', 'weather-station'];
// restaurant-pulse and sanitation-schedule are implemented. The others are
// recognized names with explicitly unimplemented adapters — never silently
// accepted.
const IMPLEMENTED = new Set(['restaurant-pulse', 'sanitation-schedule']);
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
// Reconcile into the world. The expected hash is REQUIRED: verification
// happens inside reconcile, so no caller can apply an attested report
// without proving its bytes. Returns a description of the applied effect.
// Unknown sources and unimplemented adapters are rejected, never ignored.
export function reconcileReport(world, attestation, seenIds, expectedSha) {
  assert(!seenIds.has(attestation.reportId), 'duplicate report: ' + attestation.reportId);
  verifyReportHash(attestation, expectedSha);
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
  if (attestation.sourceId === 'sanitation-schedule') {
    // A scheduled collection for one patch-day: same-day post-metabolism
    // pickup. Validation is shared with the batch path (see
    // validateSanitationReport); this single-report entry point applies it
    // immediately after validating, exactly like restaurant-pulse above.
    const { patch } = validateSanitationReport(world, attestation, seenIds, expectedSha);
    tickPatch(patch, { day: p.day, sanitation: true });
  }
  seenIds.add(attestation.reportId);
  return { applied: attestation.reportId, source: attestation.sourceId };
}

// Shared sanitation validation: authenticity (hash), identity (known
// source, canonical report id), deduplication, provenance, payload shape,
// schedule legitimacy, patch existence and finite stock, and the
// same-day rule — a report collects the day the patch just metabolized
// (report.day === patch.day). Earlier days are stale, later days are
// future fabrications or early arrivals; both fail closed. Pure except
// the seenIds read (no mutation here — callers record).
export function validateSanitationReport(world, attestation, seenIds, expectedSha) {
  assert(attestation && attestation.schemaVersion === REPORT_CONTRACT, 'not an attested report');
  assert(attestation.sourceId === 'sanitation-schedule', 'wrong adapter: ' + (attestation && attestation.sourceId));
  assert(!seenIds.has(attestation.reportId), 'duplicate report: ' + attestation.reportId);
  verifyReportHash(attestation, expectedSha);
  const p = attestation.payload;
  assert(p && typeof p === 'object', 'sanitation-schedule needs a payload');
  assert(typeof p.patchId === 'string' && p.patchId.length > 0, 'sanitation-schedule needs patchId');
  assert(Number.isInteger(p.day) && p.day > 0, 'sanitation-schedule needs a positive day');
  assert(p.provenance === 'simulated', 'sanitation-schedule reports are simulation-labeled');
  assert(attestation.reportId === sanitationReportId(p.day, p.patchId), 'non-canonical sanitation report id');
  const patch = (world.patches || []).find((q) => q.id === p.patchId);
  assert(patch, 'unknown patch: ' + p.patchId);
  assert(Number.isInteger(patch.day) && patch.day >= 0, 'sanitation: patch day missing: ' + p.patchId);
  if (p.day < patch.day) throw new Error('grounding: stale sanitation report for ' + p.patchId);
  if (p.day > patch.day) throw new Error('grounding: future sanitation report for ' + p.patchId);
  const periodDays = p.periodDays === undefined ? 7 : p.periodDays;
  assert(Number.isInteger(periodDays) && periodDays > 0, 'sanitation-schedule needs a positive period');
  assert(sanitationDue(p.day, periodDays), 'unscheduled sanitation report for day ' + p.day);
  for (const k of ['fresh', 'rot', 'residue', 'biomass']) {
    const v = patch[k];
    assert(typeof v === 'number' && Number.isFinite(v) && v >= 0, 'sanitation: patch stock unknown: ' + p.patchId);
  }
  return { patch, reportId: attestation.reportId, day: p.day };
}
