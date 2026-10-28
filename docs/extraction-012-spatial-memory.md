# Extraction 012 — Source-grounded viewpoint memory for Manhattan

**Status:** Draft feature work, not merged, not headset/Quest accepted, no trained world model.
**Origin:** Life Itself Manhattan engineering, grounded in ASI4XR spatial research.

## Research verified (October 2026)

1. **Persistent Planar Memory for Video World Models** — Yuze He et al.,
   NeurIPS 2026, October 16. [Paper](https://arxiv.org/abs/2610.23795) /
   [Apache-2.0 source](https://github.com/robbyant-research/PPMem).
   Their DiT jointly predicts RGB video and 3D plane primitives with depth feedback.
   **We do not claim to run the reference model.** Its default inference uses
   about 19 GiB VRAM; 24 GB recommended. Our planes instead come directly from
   existing NYC footprint edges (2.5D building prism walls), not neural output.
2. **Geometry as Address (GEAR)** — Zesong Yang et al., September 28.
   [Paper](https://arxiv.org/abs/2609.34722) /
   [Project](https://zju3dv.github.io/geometry-as-address/).
   Historical visual memory remains separate from geometry; geometry addresses
   correspondences and occlusion filters unreliable matches. Our retrieval
   indexes approximate original photo geotags and source IDs separately from
   surveyed building geometry. We **do not** implement GEAR's attention network,
   depth estimation, or Invisible Octree. Occlusion stays explicitly **unknown**.
3. **Matrix-Game 4.0** — Skywork AI, October 2026.
   [MIT source](https://github.com/SkyworkAI/Matrix-Game).
   Executable simulation manages state and physics; a generative model handles
   visuals. Life Itself keeps its existing city simulation, dated source index,
   and renderer independent of any future video-model adapter. No models or
   assets from Matrix-Game or Unreal City Sample have been copied.

## Recovered and preserved

Parent is `feat/times-square-facade-alignment-20261028`, commit
`0b5ea66f3a7dc0549a4189a41948879b7120409d` (draft PR #5).
The 45,172 NYC building footprints, 622 Times Square versioned-current
geometry records, four locally sourced Commons photographs, 284 catalog
candidates, 16 proposed façade masks, and 96 **unverified** building
associations remain untouched.

## New data contract

`scripts/build-spatial-memory.mjs` deterministically produces
`data/spatial-memory-v1.json` with:

- **6,623** 2.5D wall-plane references from **2026 snapshot only** footprints.
  A plane stores endpoints, middle position, width, height, two-sided
  approximate normal, the stable NYC BIN and building version ID. It is *not*
  a photographed historical façade, generated geometry, or proof of occupancy.
- **69 unique dated photograph references** (4 local source images plus
  non-duplicate metadata entries among 66 dated + geotagged catalog
  candidates); no extra images are downloaded.
- Photo geotags, labels, license and source links are stored without asserting
  verified pose, mapped building association, historical correctness, or
  training rights. Every photo remains `trainingPermission=unreviewed`.
- `frame` is existing Twin Earth ENU, east/up/-north, origin Times Square;
  versioned under `life-itself-spatial-memory/1.0.0`.

## Runtime

`src/spatial-memory.js` validates all records, builds a bounded x/z grid,
and retrieves source IDs within radius, timestamp and approximate camera
direction. Each retrieval is capped to at most 18 photo observations and
220 planes by default. It does **not** test depth visibility, occlusion,
correctness of photographic geotags, true building correspondence or
historical geometry.

For year **2026** the current building planes may be retrieved as a snapshot
layer. **For any other selected year, zero 2026 building planes are returned**;
the dated photo references remain available independently.

`src/spatial-memory-viewer.js` adds a voluntary collapsible panel inside the
existing timeline:
- Focus Times Square (camera view only).
- Retrieve current view (bounded metadata and plane search).
- Show the available **current-geometry planes** using simple Three.js lines,
  only in 2026.
- Dated original/catalog photo source links with provenance labels.

The viewer does not instantiate a video model, run training, increase model
context window, or claim that a retrieved photograph was truly visible from
the same camera viewpoint. It deliberately avoids background polling.

## Verification commands

```bash
npm run build:memory
npm run test:memory
npm run validate:city
npm run test:city
npm run test:evidence && npm run test:atlas && npm run test:catalog
npm run test:facades
node scripts/test-journal.mjs
npm run serve
```

`test:memory` checks source preservation, bounds, deterministic retrieval,
2026-only geometry, 2005 source retrieval, empty 1995 result, look-away cone,
maximum result caps, invalid dates/poses and blocked training/visibility claims.
200 Node queries completed in ~137 ms on Houston during the initial test;
this is not an FPS estimate or GPU performance guarantee.

Headless Chrome verified on this branch:
- 2005, Times Square focus: **1 photo reference / 0 historical planes**.
- 2026, same focus: **0 dated photos / 220 bounded current wall planes**.
- 1995: **0 photos / 0 planes**.
- Optional wall-plane checkbox toggled, 96 simulated walkers stayed active,
  source references remained separated, **0 page/console errors**.
- Browser startup/interaction test took ~64 seconds in headless software
  rendering; this is **not** proof of a responsive Quest/WebXR deployment.

## Next acceptance and research gates

1. Verify source pose and view overlap with calibrated cameras before
   claiming PPMem-like geometric scene memory or GEAR-level correspondence.
2. Validate occlusion using surveyed geometry/depth and confidence intervals.
3. Provide policy-bounded, source-grounded image/depth reference contracts to
   an **optional** LingBot/other world-model adapter; LingBot-World v2's local
   bridge currently reported `weights_ready=false` at the prior check.
4. Benchmark low-poly scene condition → model frames against the Matrix-Game
   paradigm and test hybrid presentation in WebXR on actual Quest hardware.
5. Evaluate offscreen loading, cache budgets, and legal reuse before scaling
   beyond Times Square. No AWS resource/charge was created.
6. Approve source review, PR merge chain, and founder final acceptance
   separately. Passing local tests is **not** production acceptance.

## Cross-section handoff proposal

**From:** Life Itself Manhattan world-model engineering.
**To:** DreamSuite 00 Mission Control, 02 Architecture, 06 Engineering & CI.
**Objective:** Review bounded and source-grounded retrieval as optional
world-model conditioning input. **Verified:** current-geometry plane index,
metadata retrieval, time gates, local tests and browser smoke check if recorded
in the PR. **Decisions approved:** keep world state/source evidence authoritative;
retrieve visuals by space and time; separate generation. **Dependencies:**
true camera calibration and feature matching, historic building records,
independent license audit, headset tests. **Next action:** source-backed
architecture and XR performance review; do not merge or activate production.
**Acceptance:** conservative historical truth, provenance preserved, no
unauthorized training, reproducible tests, bounded performance on Quest.
Handoff document is not a synchronized agent message.
