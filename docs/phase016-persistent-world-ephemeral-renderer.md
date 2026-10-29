# Phase 016 — Persistent World / Ephemeral Renderer Contract (proposal)

**Status:** Architecture proposal only; not a working model provider or approval to run inference. Complements [Phase 016 issue #13](https://github.com/Humank1nd/life-itself-manhattan/issues/13) and the [renderer strategy](decision-phase-014-renderer-strategy.md). Reviewed source of truth: current Manhattan geometry and provenance are authoritative; Matrix-Game is a renderer research candidate; LingBot remains reference-only.

## Invariant

**A world exists while every neural renderer is stopped.** A building's BIN/version identity, timeline, rights, geometry, character state and event history cannot depend on a model process, GPU allocation, provider session, or cached generated pixel. Renderer output is a disposable derived view, never an edit to authoritative geography or an automatically accepted historical record.

## Separate ownership and lifetimes

| Layer | Owner | Persisted independent of GPU? | Can renderer write authority? |
| --- | --- | --- | --- |
| Geometry, BIN/version, time, source graph, license evidence | Manhattan canonical world store | Yes | No |
| Entities, deterministic simulation state, event sequence, checkpoint IDs | Manhattan simulation store | Yes | No |
| Capture/conditioning envelope with hashes, camera and input provenance | Capture pipeline | Yes, metadata only | No |
| Provider worker, GPU context, sampled latents, temporary prompt/context cache | Ephemeral cloud renderer | No | No |
| RGB/depth/masks and generated frames | TTL-bound artifact store with receipts | Only within retention | No |
| Review/acceptance decision | Audited human approval | Yes | Only authorized promotions, never inferred from pixels |

An expired artifact must remain referentially traceable through a durable metadata receipt (digest, provider/build revision, capture source digests, expiry, decision), without pretending its bytes are still retrievable.

## Provider lifecycle state machine

- `OFF`: no GPU allocation; authoritative geometry and simulation remain browsable.
- `REQUESTED`: a request names world snapshot hash, requested time, camera intrinsics/extrinsics, approved inputs, rights policy, intent and an explicit budget envelope.
- `VALIDATING`: reject unknown BIN/version IDs, unverified historical views, unmatched source hashes, unreviewed training rights, absent GPU spending approval, incompatible image/depth/camera contracts, and undefined model checkpoint/terms.
- `STARTING`: provision only approved ephemeral provider resources; enforce per-job wall-clock, spend/credit, memory and artifact TTL bounds.
- `READY`: provider handshake includes exact weights/config digest, supported input/output contract and model license evidence, before accepting a render.
- `RUNNING`: inference only for bounded requests. Generated frames carry `generated:true`, `historicalGroundTruth:false` and input/output digests.
- `QUIESCING`: flush only approved durable metadata/receipts; release GPU, temp data and secrets according to policy.
- `OFF` or `FAILED`: provider no longer needed/available; serve canonical geometric renderer; expose degraded reason without inventing a successful generation.

Allowed transitions: `OFF→REQUESTED→VALIDATING→STARTING→READY→RUNNING→QUIESCING→OFF`. Any active stage may transition to `FAILED→QUIESCING→OFF`; a rejected validation returns to `OFF` without allocation. Timeout, cancellation, budget exhaustion and missing provider are fail-closed. No auto-retry that spends more money.

## Minimal API boundary (proposed)

```ts
type RenderIntent = {
  worldId: 'life-itself:manhattan';
  snapshotSha256: string;
  captureEnvelopeSha256: string;
  cameraContractId: string;
  temporalClaim: 'current-snapshot' | 'historical-unverified';
  rightsReviewId: string;
  providerApprovalId: string; // separately authorized, never auto-populated
  budget: { maxUsd: number; maxSeconds: number; artifactTtlHours: number };
};
type RenderReceipt = {
  intentSha256: string;
  providerId: string;
  modelWeightsSha256: string;
  configurationSha256: string;
  outputSha256: string[];
  generated: true;
  historicalGroundTruth: false;
  status: 'complete' | 'failed' | 'cancelled';
};
```

These are design types, **not executable authorization evidence**. A real implementation must verify signed/host-trusted approvals at an independently authenticated boundary, avoid storing secrets in envelopes, and bind the approved exact artifact, model and destination at claim time.

## Required adversarial acceptance gates

1. Load city/timeline and resume simulation with provider `OFF`. Verify durable BIN/version identities, event sequence, camera selection and 2026 snapshot hashes do not change.
2. Evict/kill the worker during a render. Verify `FAILED` then cloud cleanup; the geometric viewport remains navigable and no historical record is altered.
3. Reject stale source SHA, fake verified 2005 façade, mismatched 014/015 depth semantics, unknown BIN ID, unreviewed image license, unapproved scene checkpoint or provider endpoint.
4. Reject requests without independent authorization for cloud spend and model execution. Approving an envelope **does not** authorize inference, training, or billing.
5. Compare a deterministic frame receipt to the exact source manifest and version IDs; reject altered outputs or forged provider-success response.
6. Verify TTL expiration deletes only ephemeral generated bytes, not canonical world records or auditable receipts; test idempotent cleanup and provider restart.
7. Benchmark cold-start, GPU time, output latency, memory/cost and quality only when an actual approved inference exists. Until then the performance and XR gate is **UNVERIFIED**.
8. On Quest/WebXR, validate the canonical geometry-only fallback on device; do not assume model frame-rate parity with headset refresh.

## Delivery slices

- **P016-L1 (no GPU):** pure provider-state reducer + transition/failure tests on hosted CI; provider stub `OFF` default.
- **P016-L2 (no GPU):** canonical state checkpoint/reload and provider-off navigation regression; durable generated-output receipt schema, strict provenance validations.
- **P016-L3 (no GPU):** app interface for request/deny/status/fallback; never auto-start on page load or camera motion.
- **P016-L4 (separately approved):** ephemeral paid GPU pilot with founder-reviewed checkpoint, terms, rights, spend cap, time cap and cleanup proof; then independent quality/Quest assessment.

**Explicit non-goals for this proposal:** no Houston builds/downloads, no live model wiring, no paid cloud provisioning, no synthetic history promotion, no PR merge or production activation. Preserve the existing Phase 015/016 capture envelope and Matrix adapter without changing their semantics.
