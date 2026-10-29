# Extraction 016 — Provider-neutral conditioning envelope (Phase 016, S016-01/02)

Cloud-only schema and test work. No model, no weights, no inference.

## What landed

- **`src/conditioning-envelope.js`** — builder + validator + depth-contract
  guards (no imports; runs in Node and the browser unchanged).
- **`data/cloud-capture-manifest-40799078997.json`** — verbatim metadata
  copy of the verified PR #11 cloud run manifest (frame hashes, camera
  poses, 622-entity identity map). No pixels: hashes and params only.
- **`data/conditioning-envelope-v1.json`** — deterministic example
  envelope built from that manifest plus the authoritative source specs:
  622 BIN/version identities, 25 visible IDs, 9 hashed frames, full
  camera intrinsics/extrinsics with handedness, pilot-vs-cloud
  compatibility block (`sharedPixelSpace: false`), rights rails
  (`training: not-authorized`), and `model: {provider: none,
  inferenceExecuted: false}`.
- **`scripts/build-conditioning-envelope.mjs`** — deterministic builder
  (re-running must produce identical bytes, including the manifest SHA).
- **`scripts/test-conditioning-envelope.mjs`** — the gate: envelope
  validates, rebuilds byte-identically, same-contract depth decode works,
  cross-contract comparison fails closed, and 12 drift mutations
  (training flip, historical overclaim, stale SHA, depth relabel,
  pixel-path overclaims, pose overclaim, frame hash drift, orphan
  visible ID, unexecuted provider claims) are all rejected.
- **`.github/workflows/conditioning-envelope.yml`** — cloud CI job
  (Node 24, no dependencies): rebuild + gate on every touching PR.

Run `npm run build:envelope` and `npm run test:envelope`.

## The depth-contract rule (S016-02 core)

Phase 014 pilot depth is inverted 8-bit grayscale **distance**;
Phase 015 cloud depth is 24-bit RGB-packed linear camera-space **Z**.
`decodeDepthFrame` requires the caller to name its contract;
`assertSameDepthContract` throws on any cross-contract numeric use.
There is currently **no audited 014↔015 conversion** — an 8-bit
grayscale value is not a 24-bit linear-Z value, and resizing images
does not align viewpoints. See
`docs/phase015-016-capture-contract-compatibility.md` (PR #12) for the
full compatibility matrix.

## Boundaries

- The envelope carries **BIN and versionId identities**, never bare
  RGB color numbers (indices are pass-local labels).
- The pilot contract is referenced for non-comparability only; its
  frames are not registered to the cloud path.
- S016-03 (Matrix-Game I/O + rights matrix) and S016-04 (bounded cloud
  inference) are **not started**: no checkpoint download, no GPU
  instance, no paid API action is implied or authorized here.
