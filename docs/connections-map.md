# Connections map — where the codebase already joins

Searched 2026-10-28 across four bodies of the founder's work:
`Humank1nd/life-itself` (the quarry), `Humank1nd/twin-earth-nyc`,
`gods-eye-view` (the laptop web app and its `src/life/` engine), and
this repo. Every connection below is stated with its evidence. States:
**joined** (live), **measured** (quantified, not yet unified),
**ready** (the joint is clean, work not yet done).

## 1. One anchor registry, three consumers — joined

Twin Earth NYC's `data/anchors.json` is consumed by: this repo's Rust
core (conformance fixtures), this repo's live page (the red points),
and gods-eye-view itself (`src/twinEarthAnchors.js` loads the registry
as a GeoJSON overlay). One canon, three readers, no copies drifting.

## 2. The scale canon matches across repos — joined by value

The registry's scale anchor SA-01 (a standard door, 2.1 m ± 0.05) is
the same value as gods-eye-view's `src/life/scaleContract.js`
(`civic.doorHeightM: 2.1`, against a 1.75 m human datum, with NYC lane
width 3.2 m and curb 0.15 m). The scale contract is the twin's physical
dimension layer; candidate for single-sourcing into the core.

## 3. Streets → island — joined (Extraction 004)

gods-eye-view's simulation layer speaks WGS84 natively: corridors,
zones, and sims are all lat/lon. Its `manhattanStreets.js` waypoints
project through the verified transform with no adaptation beyond the
projection itself. Eleven corridors now underlie the island.

## 4. Two local frames, one measured delta — measured

gods-eye-view's `spatialBridge.js` converts with a flat tangent
approximation (111,320 m/deg) around One World Trade Center, in
centimeters, for Unreal. The contract frame is the exact ellipsoid
rotation around Times Square, in meters. Measured at Times Square,
5.6 km from the bridge's origin: the two frames disagree by **12.04 m**
— fine inside the bridge's downtown purpose, twenty-four times the
tightest anchor tolerance at the island's origin. This is the concrete
case for the Rust core as the single conversion authority: its
`Origin` is a parameter, so both datums are one function, and the flat
approximation retires to a documented local adapter.

## 5. Diurnal atmosphere — ready

`diurnalAtmosphere.js` is pure functions of time (`computeSolarElevation`,
`evaluateAtmosphereState`) with no rendering dependency — the cleanest
port shape in the engine. One honest adaptation: it hardcodes its
latitude at 40.7075° (downtown); the port parameterizes latitude from
the frame origin (40.7580°).

## 6. Sims and zones speak WGS84 — ready

`tick.js` builds zones and sims in lat/lon (`makeZone(id, lat, lon)`,
`makePed(id, lat, lon)`, a 5-second city tick). The inhabitants layer
therefore docks through the same transform as the streets: sims anchor
to real buildings, and their positions render in the island frame.
The trait question (the quarry's development.py vs the Sims
dashboard's eight motives) remains the founder's open ruling; the
transport joint exists regardless of which engine he seats.

## 7. Three ticks, one journal — ready

The quarry ticks a simulation and journals it; the island journals
interactions; gods-eye ticks a city every 5 seconds. The journal's
tick_begin / tick_end wrap fits the city tick unchanged, so when the
sim docks, its history lands in the same chain the island already
keeps.
