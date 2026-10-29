// Gate for the provider lifecycle reducer (Phase 016, P016-L1).
// Happy path, every rejection rail, kill/timeout/budget fail-closed from
// every active stage, no FAILED→RUNNING shortcut, no auto-retry, receipts
// marked generated-never-historical. Pure: no I/O, no timers, no GPU.
import assert from 'node:assert/strict';
import { createProvider, step, validateIntent, buildReceipt } from '../src/provider-lifecycle.js';
const goodIntent = () => ({
  worldId: 'life-itself:manhattan',
  snapshotSha256: 'a'.repeat(64),
  captureEnvelopeSha256: 'b'.repeat(64),
  cameraContractId: 'life-itself-cloud-capture/1.0.0-640x360-f62',
  temporalClaim: 'current-snapshot',
  rightsReviewId: 'rights-001',
  providerApprovalId: 'approval-001',
  budget: { maxUsd: 5, maxSeconds: 600, artifactTtlHours: 72 },
});
const run = (events) => events.reduce((p, [e, x]) => step(p, e, x), createProvider());
// 1. Happy path: full cycle with allocate then release.
{
  const p = run([['REQUEST', goodIntent()], ['BEGIN_VALIDATION'], ['VALIDATION_OK'],
    ['HANDSHAKE_OK'], ['START_RENDER'],
    ['RENDER_COMPLETE', { providerId: 'ephemeral-1', modelWeightsSha256: 'c'.repeat(64), configurationSha256: 'd'.repeat(64), outputSha256: ['e'.repeat(64)] }],
    ['QUIESCE_COMPLETE']]);
  assert.equal(p.state, 'OFF');
  assert.deepEqual(p.effects, ['allocate-gpu', 'write-receipt', 'release-gpu']);
  assert.equal(p.receipt.generated, true);
  assert.equal(p.receipt.historicalGroundTruth, false);
  assert.equal(p.receipt.status, 'complete');
}
// 2. Validation rejects: each missing/overreaching field fails closed at OFF.
for (const [label, mutate] of [
  ['world', (i) => ({ ...i, worldId: 'other' })],
  ['snapshot', (i) => ({ ...i, snapshotSha256: 'xyz' })],
  ['envelope', (i) => ({ ...i, captureEnvelopeSha256: 'xyz' })],
  ['camera', (i) => ({ ...i, cameraContractId: '' })],
  ['historical', (i) => ({ ...i, temporalClaim: 'verified-2005' })],
  ['rights', (i) => ({ ...i, rightsReviewId: '' })],
  ['approval', (i) => ({ ...i, providerApprovalId: '' })],
  ['budget', (i) => ({ ...i, budget: { maxUsd: 0, maxSeconds: 600, artifactTtlHours: 72 } })],
]) {
  const p = run([['REQUEST', mutate(goodIntent())]]);
  assert.equal(p.state, 'OFF', 'reject ' + label);
  assert.ok(p.rejection && p.rejection.length > 0, 'reasons ' + label);
  assert(!p.effects.includes('allocate-gpu'), 'no allocation on ' + label);
}
// 3. Rejected validation returns to OFF with no allocation.
{
  const p = run([['REQUEST', goodIntent()], ['BEGIN_VALIDATION'], ['VALIDATION_REJECTED']]);
  assert.equal(p.state, 'OFF');
  assert.deepEqual(p.effects, ['no-allocation']);
}
// 4. Kill/timeout/budget fail closed from EVERY active stage.
for (const state of ['REQUESTED', 'VALIDATING', 'STARTING', 'READY', 'RUNNING']) {
  const setup = { REQUESTED: [['REQUEST', goodIntent()]], VALIDATING: [['REQUEST', goodIntent()], ['BEGIN_VALIDATION']],
    STARTING: [['REQUEST', goodIntent()], ['BEGIN_VALIDATION'], ['VALIDATION_OK']],
    READY: [['REQUEST', goodIntent()], ['BEGIN_VALIDATION'], ['VALIDATION_OK'], ['HANDSHAKE_OK']],
    RUNNING: [['REQUEST', goodIntent()], ['BEGIN_VALIDATION'], ['VALIDATION_OK'], ['HANDSHAKE_OK'], ['START_RENDER']] }[state];
  for (const ev of ['PROVIDER_KILLED', 'TIMEOUT', 'BUDGET_EXHAUSTED', 'CANCELLED', 'RENDER_FAILED']) {
    const p = run([...setup, [ev]]);
    assert.equal(p.state, 'FAILED', `${ev} from ${state}`);
    const q = run([...setup, [ev], ['BEGIN_QUIESCE'], ['QUIESCE_COMPLETE']]);
    assert.equal(q.state, 'OFF', `recover ${ev} from ${state}`);
    assert(q.effects.includes('release-gpu'), 'release on recovery');
  }
}
// 5. No FAILED→RUNNING shortcut, no auto-retry, unknown events are loud.
{
  const killed = run([['REQUEST', goodIntent()], ['PROVIDER_KILLED']]);
  assert.equal(killed.state, 'FAILED');
  assert.equal(step(killed, 'START_RENDER').state, 'FAILED', 'no FAILED->RUNNING shortcut');
  const p = run([['REQUEST', goodIntent()], ['BEGIN_VALIDATION'], ['VALIDATION_OK'], ['TIMEOUT']]);
  assert.equal(p.state, 'FAILED');
  assert.throws(() => step(createProvider(), 'BOGUS_EVENT'), /unknown event/);
}
// 6. Receipts require complete provider results; never historical.
{
  assert.throws(() => buildReceipt(goodIntent(), { providerId: 'x' }), /incomplete/);
  const r = buildReceipt(goodIntent(), { providerId: 'x', modelWeightsSha256: 'f'.repeat(64), configurationSha256: '0'.repeat(64), outputSha256: [] });
  assert.equal(r.historicalGroundTruth, false);
  assert.equal(r.generated, true);
}
console.log('PASS provider lifecycle — full OFF→OFF cycle with allocate/release, 8 intent rejections, fail-closed kill/timeout/budget from all 5 active stages, no FAILED→RUNNING shortcut, honest receipts');
