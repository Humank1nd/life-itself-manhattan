// Life Itself Manhattan — cloud-only Matrix-Game adapter plan (Phase 016,
// S016-03b). Builds a provider invocation PLAN from the validated
// conditioning envelope: which verified RGB frames, in which order, encoded
// how, for which (unselected) scene. No weights are downloaded, no model is
// invoked, no inference executes. No imports: runs in Node unchanged.
export const PLAN_SCHEMA = 'life-itself-matrix-plan/1.0.0';
export const MATRIX_SCENES = ['castle', 'ancient-egypt', 'racing'];
// Released offline contract (S016-03, SkyworkAI/Matrix-Game @ a10eee2):
// clean low-poly RGB MP4 in, bilinear resize/center-crop to 864x480,
// CastleStream blocks T=1 then T=4 consecutive (pad-then-trim tail).
export const MATRIX_VIDEO = {
  width: 864, height: 480, fps: 8, codec: 'libx264', pixFmt: 'yuv420p',
  repeatsPerFrame: 4, crf: 18, preset: 'veryfast',
};
// Sink rules are scene-bound and recorded, never activated here: shooter
// scenes generate the first visible frame from a KV-only sink; racing
// consumes the supplied sink as frame zero under the `future` RoPE policy.
export const SINK_RULES = {
  'castle': 'kv-only-sink-generates-first-frame',
  'ancient-egypt': 'kv-only-sink-generates-first-frame',
  'racing': 'supplied-sink-as-frame-zero-future-rope',
};
const assert = (ok, why) => { if (!ok) throw new Error('matrix-plan: ' + why); };

export function buildMatrixPlan({ envelope }) {
  assert(envelope?.schemaVersion === 'life-itself-conditioning-envelope/1.0.0', 'envelope schema mismatch');
  assert(envelope.worldId === 'life-itself:manhattan', 'world mismatch');
  assert(envelope.geometryStatus === 'current-snapshot-only', 'geometry basis overclaim');
  assert(envelope.historicalClaim === 'none', 'historical overclaim');
  assert(envelope.rights?.training === 'not-authorized', 'training rails');
  assert(envelope.model?.provider === 'none' && envelope.model?.inferenceExecuted === false, 'model already executed');
  const rgb = envelope.passes?.rgb?.files;
  assert(Array.isArray(rgb) && rgb.length === 3, 'plan needs exactly 3 verified RGB frames');
  assert(rgb.every((f) => f.width === 640 && f.height === 360), 'RGB frame size drift');
  const ordered = [...rgb].sort((a, b) => (a.file < b.file ? -1 : 1));
  const totalOut = ordered.length * MATRIX_VIDEO.repeatsPerFrame;
  return {
    schemaVersion: PLAN_SCHEMA,
    worldId: 'life-itself:manhattan',
    basedOn: {
      envelopeSchema: envelope.schemaVersion,
      captureContract: envelope.captureContract,
      manifestSha256: envelope.sourceManifest.manifestSha256,
      frameShas: ordered.map((f) => f.sha256),
      geometryStatus: envelope.geometryStatus,
    },
    scene: {
      checkpoint: 'none-approved',
      allowed: [...MATRIX_SCENES],
      sink: 'undeclared',
      sinkRules: { ...SINK_RULES },
      note: 'No Manhattan checkpoint released; selection needs rights review and separate approval.',
    },
    video: {
      ...MATRIX_VIDEO,
      inputFrames: ordered.length,
      inputFrameFiles: ordered.map((f) => f.file),
      outputFrames: totalOut,
      blockCadence: 'T=1-then-T=4-consecutive-pad-then-trim-tail',
      captions: 'not-supported-until-scene-selected',
    },
    prompt: { mode: 'fixed', text: null, status: 'unreviewed-placeholder-required-at-approved-run' },
    rights: {
      training: 'not-authorized',
      historicalClaim: 'none',
      modelEffects: 'not-authorized-until-reviewed',
    },
    model: { provider: 'none', weightsDownloaded: false, inferenceExecuted: false },
  };
}

export function validateMatrixPlan(plan, { envelope }) {
  assert(plan?.schemaVersion === PLAN_SCHEMA, 'plan schema mismatch');
  assert(plan.worldId === 'life-itself:manhattan', 'world mismatch');
  assert(plan.basedOn?.manifestSha256 === envelope.sourceManifest.manifestSha256, 'plan built from stale manifest');
  assert(JSON.stringify(plan.basedOn?.frameShas) === JSON.stringify(
    [...envelope.passes.rgb.files].sort((a, b) => (a.file < b.file ? -1 : 1)).map((f) => f.sha256)),
    'plan frame SHAs differ from envelope');
  assert(plan.scene?.checkpoint === 'none-approved', 'unapproved scene checkpoint');
  assert(JSON.stringify([...plan.scene?.allowed || []].sort()) === JSON.stringify([...MATRIX_SCENES].sort()), 'scene allowlist drift');
  assert(plan.scene?.sink === 'undeclared', 'sink declared without scene');
  assert(plan.video?.width === 864 && plan.video?.height === 480, 'video raster drift');
  assert(plan.video?.fps === 8 && plan.video?.codec === 'libx264' && plan.video?.pixFmt === 'yuv420p', 'video encoding drift');
  assert(plan.video?.outputFrames === plan.video?.inputFrames * MATRIX_VIDEO.repeatsPerFrame, 'frame count drift');
  assert(!('execute' in plan), 'plan must not carry an execute path');
  assert(plan.prompt?.text === null && plan.prompt?.status === 'unreviewed-placeholder-required-at-approved-run', 'prompt overclaim');
  assert(plan.captions === undefined || plan.video?.captions === 'not-supported-until-scene-selected', 'captions overclaim');
  assert(plan.rights?.training === 'not-authorized', 'training gate flip');
  assert(plan.rights?.historicalClaim === 'none', 'historical overclaim');
  assert(plan.model?.provider === 'none', 'provider claim without approval');
  assert(plan.model?.weightsDownloaded === false, 'weights claim');
  assert(plan.model?.inferenceExecuted === false, 'inference overclaim');
  return { inputFrames: plan.video.inputFrames, outputFrames: plan.video.outputFrames };
}
