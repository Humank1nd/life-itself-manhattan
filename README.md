# Life Itself — Manhattan

Life Itself, grounded in Manhattan: a life simulation built on the real island — every building in Manhattan from the city's own open data, streamed into the browser.

Built during the Meta Global AI Developer Hackathon, October 26 – November 4, 2026 (Indie Dev Track, Push the Frontier).

**What was pre-existing:** Life Itself, the simulation concept — a Sims-meets-GTA world grounded in real-world data — and DreamSuite, the platform it grows inside. Both predate this event.

**What is built this week, in this repo:** the Manhattan grounding itself. The whole island's building stock (45,172 footprints with roof heights, 45,513 building records with construction years and ground elevations) pulled from NYC Open Data, and the web experience that stands the island up in the browser so Meta's models can work on a real place.

## Data

Ground truth is NYC Open Data, the city's current BUILDING and BUILDING_P datasets (Department of Information Technology and Telecommunications / Department of Buildings / Department of City Planning):

- Building footprints (polygons, roof height, construction year, ground elevation)
- Building points (one record per building, same attributes)
- 2020 Neighborhood Tabulation Areas (dataset 9nt8-h7nd) — the city's real neighborhood boundaries; each building is assigned its neighborhood by point-in-polygon during projection, so "in the East Village" is a fact, not a guess (44,929 of 45,172 buildings carry a neighborhood; the rest stand on piers and shorelines outside every boundary)

Manhattan is every record whose BIN falls in 1000000–1999999. Reproduce the pull:

```
node scripts/fetch-data.mjs
```

The fetched data is committed under `data/` so the live demo is self-contained; it is public city data, re-pullable at any time from the commands in the script.

## Running it

Serve the folder with any static server and open `index.html`:

```
npm run serve
```

## The stack

- **Node 24** runs the data pipeline: `scripts/fetch-data.mjs` pulls the island from NYC Open Data; `scripts/project-enu.mjs` projects it into the Twin Earth runtime frame (WGS84 → ECEF → ENU, origin Times Square, meters, Y-up), following the geospatial transform contract in `life-itself-product-twin-earth-nyc`. The transform itself is an extraction from the Life Itself core repo's `multiverse/vision/cesium_bridge.py`, verified against its source: see `docs/extraction-001-geospatial-bridge.md`.
- **three.js** draws the wireframe (`index.html` + `src/wireframe.js`): every building as a wireframe prism at its real roof height, one draw call for the whole island, colored by height.
- **Ask the Island** (`src/ask.js`): ask the island a question in plain words (or tap a preset question chip); the question becomes a structured query over the real records, matches light up gold, the camera glides to frame them, and every number in the answer is computed from the records. The design and the Meta model contract live in `docs/ask-the-island.md`.
- **Rust** is the planned home of the geometry pipeline, following the Rust/WASM pattern of DreamSuite's `dreamrooms-core`; the Node pipeline ships this week and defines the data contract the Rust port will take over.
- `cesium.html` + `src/main.js` keep the first CesiumJS extrusion viewer for comparison.

## Status

Event-window build in progress. Deadline: November 4, 2026, 9:00 PM ET.


## City Scene Contract v1 — living city development branch

The city data shared by the browser viewer and future IWSDK/Unreal reference
tools is described by data/city-scene-v1.json. It points to the existing
NYC Open Data buildings, surveyed God’s Eye View streets, Twin Earth NYC
anchors, and NTA boundaries. See docs/extraction-007-city-scene-contract.md.

The browser's initial living-city adapter animates 96 deterministic walkers
on 22 sidewalk lanes (from 11 surveyed corridors) and advances five simulated
city zones once every five seconds, with mutable city-state hashes recorded
in the journal. It is a lightweight street preview, not the original complete
Unreal crowd engine, collision system, or headset-verified experience.

Validation: npm run validate:city && npm run test:city

Unreal Engine City Sample is reference-only here. No Unreal-only assets are
bundled, and any future web asset requires documented rights and provenance.

## Time-aware evidence rail (feature branch)

The same survey anchors now support an Obsidian-style 3D geographic graph,
with a bottom-of-screen **year slider** filtering only photos actually captured
in that year. Clicking a building also shows sourced tenant/business records
whose validity interval overlaps that year. The browser can display a photo
as a translucent local-asset plane near its reference anchor, but that does
not establish a calibrated camera pose or actual depth.

The new `data/evidence-v1.json` is intentionally empty until properly
attributed, rights-cleared images and historical records are supplied.
No photograph is invented and no world model has been trained.
See `docs/extraction-008-temporal-evidence.md`. Test with
`npm run test:evidence`.

## Licensed historical photo atlas — development branch

A new read-only year-filtered photo atlas now includes **four** actual CC BY/CC BY-SA
Wikimedia Commons images of Times Square (captured 2005, 2006, 2010 and 2015),
with original photos, citation/credit/license metadata, geotags, and separate
machine-proposed building-only cutouts. Use the year chips or slider, and toggle
`Building masks only` to see raw vs. segmented evidence. A source date
or geotag is not a verified historical reconstruction or exact camera pose.
No model training has been performed; photo training rights remain unreviewed.

Ingestion: `python3 scripts/ingest-commons-times-square.py --limit 4 --dry-run`.
Segmentation: `python3 scripts/segment-buildings.py --limit 4`.
Validation: `npm run test:atlas`.
Full rights and research constraints: `docs/extraction-009-licensed-photo-atlas.md`.

## Scaled Commons discovery catalog — feature branch (Extraction 010)

**284** reusable-license metadata candidates were indexed from **300** Commons
Times Square category files (12 historical categories). **186** have usable
original-date metadata, **76** have unverified Commons geotags, and **66** have
both. These 66 are shown as **catalog-only previews** on the timeline; they
have not been downloaded or independently approved as geographic/historical
evidence. The original four locally licensed images and building masks remain.

Run `python3 scripts/discover-commons-catalog.py --max-files 360 --per-category 85`
to refresh metadata using the official Commons API (no bulk image downloads).
Run `npm run build:photo-links` to recompute **87** candidate cross-year
geographic links within 75m; no visual similarity or shared object is claimed.
Run `npm run test:catalog` to verify the catalog, rights restrictions, geospatial
transform parity, and synthetic adversarial contracts.

The draft is not a trained or trained-on world model. Each preview is flagged
unreviewed and explicitly ineligible for automatic training. See
`docs/extraction-010-time-catalog.md` for history, rights, source limitations,
NYPL API retirement and AWS expenditure gates.

## Photograph-to-building alignment (Extraction 011)

Every dated, geotagged photograph — the **4** evidence photos and the **66**
dated, geotagged catalog records — now carries up to five **proposed**
building candidates in `data/photo-alignment-v1.json`: **350** candidate
pairs, each scored by footprint distance and height and hard-filtered so no
building is ever proposed for a photograph taken before it was built. Every
candidate carries its reasons in plain words. Nothing is visually verified
and nothing is written back into the evidence registry: a human confirms a
match before it becomes a record.

Run `npm run build:alignment` to recompute the alignments deterministically,
and `npm run test:alignment` to verify them. See
`docs/extraction-011-photo-alignment.md`.
## Times Square individual façade alignment prototype (Extraction 011)

Founder choices: Times Square pilot; distinct candidate façade masks per source photograph;
time-versioned building identities including the ability to represent separately
documented demolished predecessors; automated acceptance **only** for uniquely
high-scoring matches that satisfy independent pose/visual/historical-evidence gates.

Locally generated: **16 candidate façade mask regions** from the original four
licensed Times Square photos using MIT-licensed OneFormer ADE20K panoptic output
and tentative vertical seam subdivisions; **622 current NYC footprint snapshots**
with time-versioned entity structures; **96 proposed region-to-building pairs**.
**Zero** real identities auto-accepted because the original images lack
calibrated camera pose, verified single-building instances, independent 2D/3D
feature correspondence and sourced historical building version intervals.
Do not interpret masks or geotag distances as confirmed building identity.

`data/facade-corroboration-v1.json` is the optional (currently empty)
independent visual/pose evidence input; running `npm run build:facades`
re-evaluates all candidate pairs and auto-promotes only uniquely qualifying
records. `npm run test:facades` includes synthetic acceptance plus adversarial
abstention. The 3D browser can highlight suggested nearby buildings in cyan,
explicitly labeled **PROVISIONAL**. The current city simulation remains intact.

Full architecture, source rights and acceptance limits:
`docs/extraction-011-facade-alignment.md`. No world model has been trained.

## Research-grounded spatial memory — Extraction 012 (draft)

A new optional **Spatial memory** panel in the historical timeline can:
focus Times Square, retrieve dated photo source references near the current
camera direction and location, and display bounded wire outlines from the
**current (2026 only)** geometry snapshot. The underlying, deterministic
source-grounded index contains **6,623 current wall-plane references** and
**69 distinct dated photo observations**, preserving explicit geotag
uncertainty, source attribution, source references and training ineligibility.

This is not PPMem / GEAR inference, trained world-model weights, camera
calibration, historic 3D reconstruction, or verified photo-to-building alignment.
The design borrows published principles: oriented planes as compact structural
memory; geometry-guided addressing of prior observations; and a separation of
executable world state from optional neural rendering. Occlusion and true
camera pose remain unknown. No third-party inference code was copied.

Run `npm run build:memory` to rebuild the source snapshot and
`npm run test:memory` for gated retrieval tests. See
`docs/extraction-012-spatial-memory.md` for evidence, sources, and remaining
Quest/lingbot integration blockers.

## Optional LingBot conditioning pilot — Extraction 013

We now have a reproducible **one source photograph + three controlled camera
waypoints** metadata packet for the 2005 Times Square pilot. The exact Houston
bridge only accepts `prompt`, `init_image_hex`, `pose_cm`, `camera_path`,
`frames`, `seed` and `photosensitivity_safe`, so this integration
does **not** feed the plane graph directly into LingBot or generate a world.
The source-grounded 3D memory remains a separate, authoritative sidecar.

Use `npm run pilot:prepare` to regenerate `data/lingbot-conditioning-pilot-v1.json`
without contacting the service. `npm run pilot:health` checks
`127.0.0.1:8013/health` only. The service currently reported
`weights_ready=false`, so model inference remains blocked. A real
one-off local generation additionally requires explicit rights and
inference flags (see `docs/extraction-013-lingbot-conditioning.md`).
No training, AWS spend or model checkpoint download occurs here.

The spatial memory browser panel adds **Prepare LingBot 2005 pilot**, a
read-only metadata preview that does not trigger generation. Use
`npm run test:lingbot` for protocol and safety tests.
