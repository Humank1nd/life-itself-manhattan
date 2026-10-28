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
