# Extraction 001 — Geospatial bridge math

**Source (pre-existing):** `Humank1nd/life-itself`, `multiverse/vision/cesium_bridge.py`
**Destination (built this week):** `scripts/project-enu.mjs` in this repo.

Life Itself's core repo is the asset pool. This is the first clean extraction
from it into a standalone container, per the untangle: proven engines are
carved out into their own homes; the rest of the monolith stays behind.

## What was taken

The WGS84 geodetic → ECEF → ENU transform, verified constant-for-constant
and rotation-for-rotation against the source on 2026-10-28:

- Semi-major axis a = 6378137.0; e² = 0.00669437999014 (source and destination agree).
- ECEF: N = a / √(1 − e² sin²φ); x = (N+h) cosφ cosλ; y = (N+h) cosφ sinλ; z = (N(1−e²)+h) sinφ.
- ENU rotation about the origin (Times Square, 40.7580 N, 73.9855 W, per the
  Twin Earth geospatial transform contract in `life-itself-product-twin-earth-nyc`):
  East = −sinλ·dx + cosλ·dy; North = −sinφ·cosλ·dx − sinφ·sinλ·dy + cosφ·dz.

## The one divergence, flagged not buried

The source bridge returns Vec3(East, Up, North) — North as positive Z.
The Twin Earth contract specifies Z pointing South, and three.js reads
−Z as away-from-camera North. The wireframe therefore emits z = −North so
Manhattan points the right way on screen. One-line change if the founder
rules for the bridge's convention instead.

## Not taken

Everything else in the monolith: the tick engine, the trait dynamics, the
unrelated fictional-universe and agent-council material. They stay in the pool until a sibling project
needs them. Manhattan needed the ground to be true; this is the piece that
makes it true.
