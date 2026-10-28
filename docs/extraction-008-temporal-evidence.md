# Extraction 008 — Spatiotemporal photographic evidence and business history

**Status:** proposed in `feat/spatiotemporal-evidence-20261028`. Not in main; no headset signoff, no training runs.

## Spatial truth versus observations

The canonical Twin Earth ENU frame and 25 survey anchors remain immutable.
`data/evidence-v1.json` references them by ID. Each photograph has a capture date (or a capture year explicitly marked
as year-only, without inventing a day; NOT its upload date), anchor ID,
optional NYC BIN, local image
path, lighting and weather annotations, approximate orientation, provenance,
license, and evidential status. An anchor is a reference location; it does
not by itself establish the original camera's true optical position or pose.

The photo viewer renders year-matching images as translucent planes and
scrollable image cards, with original capture metadata and source links.
It does not fabricate imagery, infer 3D depth, or imply source validation.
Actual photos are currently **zero** and must be added only after independent
rights/attribution checks. Tests use synthetic records which are never shipped
as factual historical observations.

Building occupancy records use a NYC BIN and `[validFrom,validTo)` intervals,
with a source and an evidential status. A year overlaps an interval if any day
of that calendar year overlaps the interval. A reported business occupancy
is not silently promoted to a verified fact. A building selected in the
wireframe displays only the records overlapping the selected year.

Graph links currently express **geographic proximity only**, not learned
semantic links. The graph toggle is off by default; its edges are computed
from canonical anchor positions.

## Why separate models?

- Building footprint: *where* (the persistent geographic entity).
- Photo: *what a sourced observation shows* at a capture date and viewpoint.
- Occupancy interval: *which business was reported to be there* during a dated span.
- World-model prediction: *a hypothesis derived from evidence*, not a source fact.

The timeline can be used to assemble properly attributed, rights-cleared
training/evaluation sets and to compare time slices, but **no model is being
trained by this PR**. Future work should add camera calibration, spatial
overlap estimation, stable photo hashing, evidence versioning, uncertain time
intervals, occlusion/geometry checks, source trust policy, and evaluation
against held-out dated photographs. A visual reconstruction should be labeled
as generated.

## Run

`npm run test:evidence` validates the temporal contract and year filtering.
`npm run serve` opens the app. Change the year using the fixed bottom rail,
click a red survey anchor to focus one location, or select a building to see
dated occupancy records. Without ingested evidence, counts are zero and the
interface explicitly says so. The experience remains a desktop WebGL preview;
Meta IWSDK and Quest verification are separate future gates.

## Event-window provenance

Previous: Life Itself Manhattan's canonical 25 survey anchors, NYC BIN records,
God's Eye View and Twin Earth frame. New: this project's graph schema, timeline
UI, native Three.js display planes, synthetic tests, and dated evidence interface.
No third-party photograph or Obsidian proprietary code is copied.
