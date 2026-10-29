# Extraction 017 — God’s Eye View integration (slices 1–4)

Founder directive: integrate existing GEV features before inventing
replacements. Source: `projects/gods-eye-view` at `9264301` plus its
36-ahead local work (preserved under branch
`preserve/gev-dev-20261028`; dirty tree left untouched for the active
lane). GEV’s own suite: 2776/2777 green on the working tree.

## Ported (this extraction, gated)

- **Slice 1 — SUMO lane graph** (`src/sumo-lanes.js`,
  `data/sumo-network-v1.json`, `test:sumo-lanes`). 1193 edges / 1295
  lanes of LiDAR-surveyed downtown + Midtown-south topology. One
  deliberate fix vs GEV: metres run through the verified WGS84→ENU
  transform, never the flat 111320 constant (12.04 m off at Times
  Square — connections-map §4; the gate fails closed on it).
  Coverage pin: Times Square sits OUTSIDE this net (lat cap 40.7546).
- **Slice 2 — motive strip** (HUD + `motives.js crowdContext`).
  Aggregate, clock-driven, display-only; walkers untouched.
- **Slice 3 — cinematic tour** (`src/camera-tour.js`, 6 surveyed legs
  FiDi→Central Park South, 50.5 s with holds, `test:camera-tour`).
  Driven through the island's own flight machinery; grab/ESC exits.
- **Slice 4 bonus — Pacejka MF96** (`src/pacejka.js` verbatim, 72
  lines, zero imports; `test:pacejka` property gate). The tire math
  is engine-free; the arcade vehicle around it is not ported.

## Portability verdicts (assessed, not ported)

- **Pedestrian crowds / gait / scale** — already extracted (6.2 m
  lanes, gait kinematics cited in living-city). No new port needed.
- **Traffic.js + TomTom live congestion** — Cesium-bound, needs an API
  key with billing, tile cache and render governor. Options: (a) keep
  static lanes from slice 1 (done, $0); (b) live congestion as a
  separately keyed project with a cost gate. Not started.
- **Chaos destruction / VFX sim** — UE5 ports (Mass ECS, Niagara);
  the impact-strain and particle-state math is portable, the execution
  targets Unreal. A math-only port is a follow-up slice, not this one.
- **MassAI 10k crowds + UDP replication** — UE5 Mass + networking;
  Manhattan's 96 walkers are the current scale. A crowd-scale project
  needs its own perf budget and Quest frame-rate proof first.
- **Mission director + checkpoint jingles + radio synth + audio stems**
  — dialogue/mission content is a product decision, not a port task.
  Audio stems are WebAudio-side and portable later; missions await a
  design ruling.
- **Live feeds (OpenSky importer, weather)** — macOS-only script,
  credential files, live APIs. Rights + credentials + cost gate first.
- **Full GTA vehicle sim (gta.js)** — arcade physics over Pacejka
  (now in-repo) but Cesium-anchored IIIs/waypoints. A three.js vehicle
  layer is a new build using slice-1 lanes + ported tires, not a copy.

## What this means for the readiness table

Foundation items stay as-is. Newly working: SUMO lane topology (downtown),
crowd-motive display, cinematic tour, tire physics core. Still open:
live traffic, vehicle embodiment, destruction, missions, MassAI scale,
live feeds, Quest verification, DreamSuite recursive navigation.

Run `npm run test:sumo-lanes`, `npm run test:camera-tour`,
`npm run test:pacejka` (plus `test:traits`) for the new gates.
