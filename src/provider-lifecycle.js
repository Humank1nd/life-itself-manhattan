// Life Itself Manhattan — provider lifecycle reducer (Phase 016, P016-L1).
// Pure state machine for the Persistent World / Ephemeral Renderer contract
// (PR #20): OFF→REQUESTED→VALIDATING→STARTING→READY→RUNNING→QUIESCING→OFF,
// any active stage may fail to FAILED→QUIESCING→OFF, rejected validation
// returns to OFF without allocation. No I/O, no timers, no GPU: wall-clock
// and failures arrive as explicit events. No imports; runs in Node and the
// browser unchanged.
export const STATES = ['OFF', 'REQUESTED', 'VALIDATING', 'STARTING', 'READY', 'RUNNING', 'QUIESCING', 'FAILED'];
const HEX64 = /^[0-9a-f]{64}$/;
export function validateIntent(intent) {
  const reasons = [];
  const need = (ok, why) => { if (!ok) reasons.push(why); };
  need(intent && intent.worldId === 'life-itself:manhattan', 'worldId must be life-itself:manhattan');
  need(intent && HEX64.test(intent.snapshotSha256 || ''), 'snapshotSha256 must be 64 hex chars');
  need(intent && HEX64.test(intent.captureEnvelopeSha256 || ''), 'captureEnvelopeSha256 must be 64 hex chars');
  need(intent && typeof intent.cameraContractId === 'string' && intent.cameraContractId.length > 0, 'cameraContractId required');
  need(intent && intent.temporalClaim === 'current-snapshot', 'only current-snapshot claims allowed');
  need(intent && typeof intent.rightsReviewId === 'string' && intent.rightsReviewId.length > 0, 'rightsReviewId required');
  need(intent && typeof intent.providerApprovalId === 'string' && intent.providerApprovalId.length > 0, 'providerApprovalId required (never auto-populated)');
  const b = intent && intent.budget;
  need(b && b.maxUsd > 0 && b.maxSeconds > 0 && b.artifactTtlHours > 0, 'budget envelope with positive caps required');
  return { ok: reasons.length === 0, reasons };
}
export function createProvider() {
  return { state: 'OFF', intent: null, rejection: null, effects: [], receipt: null };
}
const FAIL_CLOSED = new Set(['TIMEOUT', 'CANCELLED', 'BUDGET_EXHAUSTED', 'PROVIDER_KILLED']);
export function step(p, event, payload) {
  const fail = (why) => ({ ...p, state: 'FAILED', rejection: why, effects: [...p.effects, 'log-failure'] });
  if (!STATES.includes(p.state)) throw new Error('lifecycle: unknown state ' + p.state);
  // Terminal rust: unknown event names are programmer errors — loud, not silent.
  const KNOWN = new Set(['REQUEST', 'BEGIN_VALIDATION', 'VALIDATION_OK', 'VALIDATION_REJECTED',
    'HANDSHAKE_OK', 'HANDSHAKE_REJECTED', 'START_RENDER', 'RENDER_COMPLETE',
    'RENDER_FAILED', 'BEGIN_QUIESCE', 'QUIESCE_COMPLETE',
    'TIMEOUT', 'CANCELLED', 'BUDGET_EXHAUSTED', 'PROVIDER_KILLED']);
  if (!KNOWN.has(event)) throw new Error('lifecycle: unknown event ' + event);
  // Fail-closed from any active stage.
  if (FAIL_CLOSED.has(event) || event === 'RENDER_FAILED') {
    if (p.state === 'OFF' || p.state === 'QUIESCING') return { ...p, effects: [...p.effects, 'log-ignored'] };
    return fail(event);
  }
  switch (p.state) {
    case 'OFF':
      if (event === 'REQUEST') {
        const v = validateIntent(payload);
        if (!v.ok) return { ...p, rejection: v.reasons };
        // Approval IDs are presence-checked only at this layer: L1 has no
        // independent approval registry to consult. The state records that
        // explicitly so no caller mistakes a nonempty string for authorization.
        return { ...p, state: 'REQUESTED', intent: payload, rejection: null, approvalVerified: false };
      }
      return { ...p, effects: [...p.effects, 'log-ignored'] };
    case 'REQUESTED':
      if (event === 'BEGIN_VALIDATION') return { ...p, state: 'VALIDATING' };
      return fail(event);
    case 'VALIDATING':
      if (event === 'VALIDATION_OK') return { ...p, state: 'STARTING', effects: [...p.effects, 'allocate-gpu'] };
      if (event === 'VALIDATION_REJECTED') return { ...p, state: 'OFF', intent: null, effects: [...p.effects, 'no-allocation'] };
      return fail(event);
    case 'STARTING':
      if (event === 'HANDSHAKE_OK') return { ...p, state: 'READY' };
      if (event === 'HANDSHAKE_REJECTED') return fail(event);
      return fail(event);
    case 'READY':
      if (event === 'START_RENDER') return { ...p, state: 'RUNNING' };
      return fail(event);
    case 'RUNNING':
      if (event === 'RENDER_COMPLETE') {
        const receipt = buildReceipt(payload && payload.intentSha256, payload);
        return { ...p, state: 'QUIESCING', receipt, effects: [...p.effects, 'write-receipt'] };
      }
      return fail(event);
    case 'FAILED':
      // Release happens exactly once, on QUIESCING→OFF below — entering
      // QUIESCING only parks for cleanup. Emitting release here too would
      // double-count one allocation (review finding 1).
      if (event === 'BEGIN_QUIESCE') return { ...p, state: 'QUIESCING' };
      return fail(event);
    case 'QUIESCING':
      if (event === 'QUIESCE_COMPLETE') return { ...p, state: 'OFF', intent: null, effects: [...p.effects, 'release-gpu'] };
      return fail(event);
    default:
      return fail(event);
  }
}
export function buildReceipt(intentSha256, result) {
  // The reducer cannot hash: it is pure and sync with no crypto. The caller
  // supplies the canonical intent SHA (computed externally, e.g. sha256sum);
  // the reducer validates its shape and refuses placeholders and empty
  // outputs (review finding 3). No placeholder is ever a receipt.
  if (!HEX64.test(intentSha256 || '')) {
    throw new Error('lifecycle: intentSha256 must be 64 hex chars — placeholders are not receipts');
  }
  if (!result || typeof result.providerId !== 'string' || !HEX64.test(result.modelWeightsSha256 || '')
    || !HEX64.test(result.configurationSha256 || '') || !Array.isArray(result.outputSha256)
    || result.outputSha256.length === 0 || !result.outputSha256.every((h) => HEX64.test(h))) {
    throw new Error('lifecycle: incomplete provider result — nonempty hashed outputs required');
  }
  return {
    intentSha256,
    providerId: result.providerId,
    modelWeightsSha256: result.modelWeightsSha256,
    configurationSha256: result.configurationSha256,
    outputSha256: result.outputSha256,
    generated: true,
    historicalGroundTruth: false,
    status: 'complete',
  };
}
