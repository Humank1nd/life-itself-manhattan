# Renderer-neutral capture pipeline

**Status:** spec and browser tool implemented and logic-gated in Node;
first browser run recorded 2026-10-29 (`data/capture-run-browser-001-manifest.json`).
A run records itself: the tool downloads a `capture-manifest.json` next to
the frames, and that file is the run's evidence.

**Extraction number:** pending the founder's ruling on the
extraction ladder. This document deliberately carries no number yet.

## Why this exists

Per the founder's Phase 014 ruling
(`docs/decision-phase-014-renderer-strategy.md`), Manhattan's
advantage is its own world representation, spatial memory, and
renderer-neutral interfaces. No model owns the architecture. The
capture pipeline is the first interface built under that ruling: it
turns the authoritative geometry into the four products any neural
renderer or evaluator needs, in open formats, with provenance.

## The four products

For each camera waypoint, three frames and one pose record:

1. **RGB** — solid prisms rendered plainly from the real footprints
   and roof heights. No HUD, no text, no controls in frame.
2. **Depth** — per-pixel distance in meters, encoded as grayscale:
   `gray = 255 * (1 - clamp((d - 0.5) / (400 - 0.5)))`. The encoding
   is documented in the spec; its 8-bit precision limit is part of
   the contract, not a surprise.
3. **Segmentation** — every building in its own color. The color is
   the building's index packed as RGB; index 0 (pure black) is
   reserved for background and ground. The spec's legend maps every
   color back to a real BIN.
4. **Camera pose** — each waypoint in ENU meters and in UE
   centimeters. The conversion is the same one the conditioning
   packet uses, and a test asserts the two pilots' UE waypoints are
   exactly equal: one path, two pilots.

## The pilot

- Focus: Times Square, 320 m radius, **182 current buildings**.
- Path: the same synthetic three-waypoint lateral path as the
  conditioning pilot (2.5 m of eastward travel at 1.68 m eye height,
  facing east). It is a controlled demo path. It is not the 2005
  photograph's camera position, and nothing here claims it is.
- Frames: 3 waypoints x 3 passes = **9 frames** at 512 x 512, plus
  the run manifest.

## Honesty rails

- Geometry is the **current snapshot only**. The spec's
  `historicalClaim` field is `none`, and the validator rejects any
  other value.
- The spec status is `spec-ready-not-captured` until real runs
  exist; the validator rejects a status overclaim.
- Model training is **not authorized** on captures, and the
  validator rejects flipping that gate, relabeling the pipeline as
  single-vendor, inventing a building, duplicating a segmentation
  color, or drifting a waypoint.

## How to run it

Open `capture.html` (live site or any static server at the repo
root). The tool loads the spec and the building data, previews the
first waypoint, and one click downloads the 9 frames and the run
manifest. Rebuild or re-verify the spec any time:

```
npm run build:capture   # rebuilds data/capture-pilot-v1.json
npm run test:capture    # validates spec, determinism, shared path — plus the recorded browser run when present
```

Recorded runs live under `data/capture-run-*-manifest.json` (metadata
only; pixels stay out of the repo). The first: `browser-001`, captured
headless Chromium 2026-10-29, 9/9 frames, zero page errors, frame IDs
and ENU poses exactly the spec's. Re-verify: `npm run test:capture`.

## Files

- `src/capture-pipeline.js` — spec builder + validator (no imports;
  runs in Node and the browser unchanged).
- `scripts/build-capture-pilot.mjs` — deterministic spec builder.
- `scripts/test-capture-pipeline.mjs` — the gate.
- `data/capture-pilot-v1.json` — the committed spec (182 buildings,
  legend, waypoints, frame plan).
- `capture.html` + `src/capture.js` — the browser tool.
- Registered as the `capturePipeline` layer of the City Scene
  manifest, beside the layers it feeds from.
