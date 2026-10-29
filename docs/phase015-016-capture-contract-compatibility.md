# Phase 015 → 016 — Two image contracts, one Manhattan authority

**Status:** Source-grounded interface note, proposed alignment requirements. No renderer, training, or historical reconstruction is activated by this document.

**Canonical source inspected:** `main` at `5bbc61f3bc37f5b40e532da8a00055a750f32ef2` (PR #11 merged). Relevant files: `docs/capture-pipeline.md`, `src/capture-pipeline.js`, `data/capture-pilot-v1.json`, `capture.html`, `capture/times-square-scene.js`, `scripts/cloud-capture-times-square.mjs`, `docs/extraction-015-cloud-times-square-capture.md`, and `docs/decision-phase-014-renderer-strategy.md`.

## Why both contracts exist

Both are **renderer-neutral views of source-grounded CURRENT geometry**, but they are built for different experimental purposes. They are *not* interchangeable image tensors, and the label colors do not establish pixel-to-pixel or building-index equivalence.

| Field | Phase 014: pilot capture specification / browser tool | Phase 015: hosted cloud geometry captures |
| --- | --- | --- |
| Main entrypoints | `capture.html`, `src/capture.js`, `src/capture-pipeline.js` | `capture/times-square.html`, `capture/times-square-scene.js`, `scripts/cloud-capture-times-square.mjs` |
| Source | `data/manhattan-enu.json` current snapshot, radius selection | `data/times-square-building-versions-v1.json` current 2026-10-28 versions |
| Scope | 182 buildings, centroid within 320 m | 622 versioned building entities in the Times Square dataset |
| Raster | **512 × 512**, aspect 1:1, FOV **55°** | **640 × 360**, aspect 16:9, FOV **62°** |
| Camera path | ENU meters: `[-5,1.68,0]` → `[-3.75,1.68,0]` → `[-2.5,1.68,0]`; synthetic 2.5 m lateral shift, facing east; also recorded in UE centimeters | ENU meters: `[160,115,210]` → `[140,115,210]` → `[120,115,210]`, common target `[0,48,-22]`; high synthetic camera positions; no UE conversion in this capture manifest |
| Passes | RGB, depth, **segmentation** | RGB, depth, **building-id** |
| Depth | Spec describes inverted **8-bit grayscale distance**: `gray = 255 × (1 − clamp((distanceM − 0.5) / (400 − 0.5)))`. Clarify `distanceM` measurement semantics in browser implementation before any cross-pipeline numeric comparison. | **24-bit RGB packed normalized linear camera-space Z**, near 0.5 m, far 1400 m; not nonlinear GPU depth |
| ID labels | RGB24 index `1..N`, zero reserved for background; index-to-BIN legend in spec | RGB24 index `1..N`, zero reserved for background; manifest's index-to-BIN **and buildingVersionId** identity map, indexed separately |
| State | Spec explicitly `spec-ready-not-captured`; browser tool described, but source document does not record an independently accepted Phase 014 browser capture | **Actual hosted run verified** on PR #11: nine PNGs, 622 geometry meshes, 25 visible source-linked IDs, same-run deterministic re-capture, zero browser errors, manifest and 3-day cloud artifact |
| Intended use | Controlled pilot path with the historical-photo conditioning packet; that photo's pose remains uncalibrated and the geometry remains current only | Reproducible cloud-only low-poly multi-pass reference frames to evaluate geometry-conditioned rendering and cross-viewport stability |

The phrase **same authority** means both pipelines derive from the Manhattan current-geometry source system, **not** that the imagery has the same source rows, camera parameters, field of view, IDs, or meaning of depth. The two camera paths are explicitly **different**, so Phase 014's “one path, two pilots” applies only to its own spec and the legacy conditioning packet, not to Phase 015.

## Reconciliation gates before any Phase 016 model comparison

1. **Preserve both schemas.** Add a versioned envelope that names the producer contract (`life-itself-capture/1.0.0` versus `life-itself-cloud-capture/1.0.0`) and forbids unlabelled conversions. Never silently overwrite or reinterpret the existing manifests.
2. **Name every camera coordinate system.** Capture ENU axes, units, handedness, camera extrinsics/world matrix, image origin, FOV, aspect ratio, near/far, pose source and any UE conversion. Reproject into a shared camera before measuring visual or motion drift; resizing images does **not** align viewpoints.
3. **Use BIN/version as stable identity.** The packed RGB index is a **pass-local label**, not a globally stable building identifier. Crosswalk only through source BIN and version identity with explicit provenance. If an older pipeline does not know version identity, say so; don't invent predecessors.
4. **Normalize depth only after semantic audit.** Determine whether Phase 014's distance means Euclidean camera-to-point distance or camera-forward depth, and verify the cloud RGB24 packing and channel/color-space readback. Convert to metric canonical values with declared precision and invalid/background masks. An 8-bit grayscale value is not a 24-bit linear-Z value.
5. **Use the same geometry snapshot and explicit sampling policy for A/B.** Choose the intersection of validated buildings (or a newly reviewed common subset) and a common camera trajectory before comparing the renderers. Cloud imagery can serve as a primary baseline, but it is not already registered to the Phase 014 photo.
6. **Keep truth and permissions separate.** Every output must carry `geometryStatus=current-snapshot-only`, `historicalClaim=none`, camera status `synthetic-unverified`, provenance hashes, source license references, and `modelTraining=not-authorized` unless separately reviewed and approved. Generated textures or hallucinated geometry must never overwrite source BIN/version records.
7. **Test negative cases.** Reject mismatched raster/intrinsics, incorrect coordinate frames, unknown BIN, duplicated label, invalid depth decoding, a current geometry frame relabelled as 2005, stale SHA, unsupported provider fields, or unapproved training/effects.

### Proposed provider-neutral conditioning envelope (not implemented)

A downstream adapter should consume a **validated logical envelope**, not raw image files whose filenames imply a contract:

```json
{
  "schemaVersion": "life-itself-conditioning-envelope/0.1.0-proposed",
  "captureContract": "life-itself-cloud-capture/1.0.0",
  "worldId": "life-itself:manhattan",
  "sourceSnapshotAt": "2026-10-28",
  "geometryStatus": "current-snapshot-only",
  "sourceManifestSha256": "<verified content hash>",
  "camera": {
    "poseStatus": "synthetic-unverified-demo-path",
    "frame": "east/up/-north",
    "units": "meters",
    "extrinsics": "<explicit transform, not inferred>",
    "intrinsics": "<FOV/aspect/near/far/image size>"
  },
  "passes": {
    "rgb": "<hashed artifact reference>",
    "depth": "<hashed reference plus metric encoding>",
    "buildingId": "<hashed reference plus BIN/version crosswalk>"
  },
  "rights": {
    "training": "not-authorized",
    "modelEffects": "not-authorized-until-reviewed",
    "historicalClaim": "none"
  },
  "model": { "provider": "none", "inferenceExecuted": false }
}
```

The placeholders are deliberate: this is **a design contract, not a generated artifact**. A later provider adapter must declare exactly which input fields the actual model accepts, what it ignores, and whether output is generated/unverified.

## Evidence and product boundaries

- **Verified:** [PR #11](https://github.com/Humank1nd/life-itself-manhattan/pull/11) merged at `5bbc61f`. [Cloud run #40799078997](https://github.com/Humank1nd/life-itself-manhattan/actions/runs/40799078997) rendered the nine-frame current geometry output. The preceding artifact verification reported 9/9 file hashes and 25/25 visible building IDs valid.
- **Preserved:** Original [PR #10](https://github.com/Humank1nd/life-itself-manhattan/pull/10) is an evidence record and was closed without merging after PR #11 landed.
- **Canon:** `docs/decision-phase-014-renderer-strategy.md` establishes **Matrix-Game as primary research**, renderer-neutral capture as infrastructure, and **LingBot as reference only**. It also records a licensing correction: current first-hand repository/model-card checks indicate permissive LingBot declarations with **unresolved gaps**, contrary to an earlier unsupported categorical CC BY-NC-SA claim. Do **not** rewrite the canon to reassert the older claim; independently review each model's code, weights and third-party terms before commercial use.
- **Unverified:** True camera pose for the 2005 source image, historical façade reconstruction, equivalent pixel ray geometry between the two capture pipelines, Matrix-Game inference on Manhattan, model output consistency, VR device behavior.

**Next action:** Phase 016 must first prove an explicit capture contract reader/converter in cloud CI, then run a small no-model conditioning dry-run. No model checkpoint download, training, GPU instance, paid API action, or Houston build is implied or authorized here.
