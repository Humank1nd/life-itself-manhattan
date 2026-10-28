# Extraction 004 — The street corridors come home

The first extraction out of gods-eye-view, the founder's web reference
engine for the twin (`src/life/`, authored September 2026, its suites
verified running 57/57 on 2026-10-28).

## Source

`gods-eye-view/src/life/manhattanStreets.js` — `MANHATTAN_STREET_CORRIDORS`:
real WGS84 waypoints for eleven surveyed corridors, extracted there
from street geometry for the twin's traffic layer: Broadway (north and
south), Wall Street (east and west), Broad Street, Water Street,
Rector Street, Pine Street, Cedar Street, Maiden Lane, and a Times
Square Broadway segment. 86 waypoints in total.

## The joint

The engine's simulation layer speaks WGS84 natively, so the connection
needed nothing invented: the waypoints were projected through this
repo's verified transform (Extraction 001's math, Times Square origin)
into `data/streets-enu.json` and drawn as ground lines beneath the
buildings. The Times Square corridor lands at the frame's origin, a
few hundred meters from the anchor cluster — the twin's two ground
layers agree in the same frame.

## Provenance

Pre-existing: the corridor waypoints and their street geometry
(gods-eye-view, September 2026). Built this week: the projection into
the island frame, the runtime file, and the rendering.
