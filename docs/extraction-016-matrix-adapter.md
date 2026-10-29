# Extraction 016 — Matrix-Game adapter plan (S016-03b, no model)

Cloud-only adapter design work. No weights downloaded, no model invoked,
no inference executed, no GPU provisioned.

## What landed

- **`src/matrix-adapter.js`** — builder + validator for the provider
  invocation plan (no imports; runs in Node unchanged). Pins the
  released offline contract (S016-03, SkyworkAI/Matrix-Game @ `a10eee2`):
  clean low-poly RGB in, bilinear resize/center-crop to **864×480**,
  CastleStream blocks T=1 then T=4 consecutive, pad-then-trim tail.
- **`data/matrix-invocation-plan-v1.json`** — deterministic plan from
  the committed envelope: 3 verified RGB frame SHAs in pose order →
  12 output frames @ 8 fps, scene checkpoint `none-approved` (castle /
  ancient-egypt / racing allowlisted, sink `undeclared`), fixed prompt
  slot empty and unreviewed, training not authorized, model provider
  none, weights not downloaded, inference not executed.
- **`scripts/assemble-matrix-video.mjs`** — pure ffmpeg encoding
  (frames dir + plan → 864×480 h264/yuv420p MP4, probed with ffprobe).
  Rejects missing frames and hash drift before encoding a single frame.
- **`scripts/test-matrix-adapter.mjs`** — the gate: plan validates,
  rebuilds byte-identically, synthetic (unverified) bytes are rejected
  by the assembler, and 12 overclaims are refused (asserted scene or
  sink, provider/weights/inference claims, smuggled execute path,
  unreviewed prompt as approved, training/historical flips, raster
  drift, frame/manifest SHA drift).
- **`.github/workflows/matrix-adapter.yml`** — cloud CI with two jobs:
  `plan` (rebuild + gate) and `video` (re-render fresh capture,
  assemble the input clip from verified RGB frames). Assembly itself
  re-checks every input SHA against the plan.

Run `npm run build:matrix-plan` and `npm run test:matrix-adapter`.
Assemble locally only from verified bytes (never committed):
`node scripts/assemble-matrix-video.mjs <frames-dir> data/matrix-invocation-plan-v1.json /tmp/matrix-input.mp4`.

## Boundaries kept from S016-03

- Depth buffers, building-ID masks, BIN/version graphs, historical
  records, and the conditioning envelope are **not model inputs** —
  they stay evaluation-side truth. Only clean RGB enters the clip.
- Scene sink rules are recorded per scene (shooter: KV-only sink
  generates first frame; racing: supplied sink frame zero, future
  RoPE) and never activated: sink stays `undeclared` until a scene
  checkpoint is rights-reviewed and separately approved.
- Dynamic captions are unsupported until a scene is selected (and
  unsupported on the optimized paths in any case).
- S016-04 (bounded cloud inference) remains **blocked**: provider,
  cost cap, checkpoint rights, artifact TTL, and founder approval
  first. A pretty frame would not prove Manhattan fidelity.
