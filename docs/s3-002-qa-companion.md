# S3-002 Broad Street / Manhattan — independent geometry QA companion

Status: Evidence-backed read-only graybox. NOT a navigable gameplay release.
Date: 2026-10-31. Base: b988bea; Muse active work untouched.

## Why this exists

The simulation's two established P017 food dumpsters are on Broad Street
(ENU near -2148, 5677), not at the Wall/Broadway crossing. This 180m-square
pilot stays centered on those exact existing simulation-owned props.

Sources:
- data/manhattan-enu.json: source-projected building footprints, not verified survey.
- data/streets-enu.json: seeded 6.2m-offset lanes via createLivingCity.
- establishAlley(city): existing dumpster-1 and dumpster-2, both simulated,
  never represented as real mapped dumpsters.

The module reads these unchanged data sources. It creates no new objects,
rat actions, physics, journal entries or movement authorization.

## Independently verified

- 18 mapped-source buildings intersect the 180m view bounds
- 27 clipped sidewalk segments and two original simulated dumpsters
- 1,261 audited lane samples at <=1m intervals; 55 overlap buildings
- Six blocked sidewalk spans across four lane corridors:
  lane_pineStreetEast_east, lane_pineStreetEast_west,
  lane_wallStreetEast_east, lane_wallStreetWest_west
- collisionFree=false. The mapped geometry is NOT collision-approved.

Muse's separate active graybox audit, which was READ and tested but not
modified, passed at a fixed center (-2148, 5677) and 2m step:
622 samples, 25 blocked, 18 buildings, two simulated props.
The two reports identify the same four affected lanes but have different
sampling/clipping rules, so their counts should not be equated.

The companion also uses exact segment/polygon edge intersection to flag
thin crossing walls missed by point-only sampling. The thin-wall regression
is a conservative geometry QA check, not a player-collision authority.

## Standalone QA browser

Open s3-graybox.html from a local HTTP server for an independent diagnostic
view of building massing, candidate sidewalks, overlaps and simulated props.
This is NOT a replacement for Muse's src/graybox-view.js or the playable UI.

Relevant files:
- src/grounded-block.js: pure classification and geometry QA
- scripts/test-grounded-block.mjs: deterministic and no-mutation unit gate
- src/graybox-viewer.js, s3-graybox.html: isolated visual smoke-test
- scripts/test-grounded-block-browser.mjs: actual Chrome browser proof
- docs/media/s3-002-broad-street-graybox-20261031.png
- docs/evidence/s3-002-broad-street-browser-proof-20261031.json
- docs/evidence/s3-002-broad-street-geometry-audit-20261031.json
- docs/evidence/s3-002-broad-street-SHA256SUMS

Reproduce:
1. node scripts/test-grounded-block.mjs
2. python3 -m http.server 8187 --bind 127.0.0.1
3. node scripts/test-grounded-block-browser.mjs (separate shell on Houston)

The Three.js page uses the game's current CDN import-map convention; it does
not prove offline mode, Quest rendering or performance.

## Muse coordination and open production gates

Muse owns current uncommitted src/graybox.js, src/graybox-view.js,
scripts/test-graybox.mjs, src/wireframe.js and index.html.
No such file was edited by this QA branch. Do not cherry-pick this view
over Muse's current gameplay graybox.

S3-002 is not fully collision-clear until:
1. Survey-source building/sidewalk disagreements are reconciled and the
   difference between projected/observed ground truth stays explicit.
2. A single simulation-owned movement/collision validator actually
   refuses travel through mapped obstacles.
3. Rat-body clearance and shelter/resource placements are independently
   validated. No surveyed shelter exists in this evidence yet.
4. The playable Muse build demonstrates the admitted safe route with
   intact movement journal and source-provenance evidence.

All files are opt-in diagnostics. Original active checkout and agent
processes remained untouched.
