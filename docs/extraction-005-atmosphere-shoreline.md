# Extraction 005 — Ground Corridors, Diurnal Atmosphere & Shoreline

**Sources (pre-existing):**
1. `gods-eye-view/src/life/manhattanStreets.js` (Surveyed Manhattan road corridors)
2. `gods-eye-view/src/life/diurnalAtmosphere.js` (Astronomical solar vector & elevation math)
3. `data/manhattan-ntas.geojson` (NYC Open Data official 2020 Neighborhood Tabulation Area boundaries)

**Destination (built this week):**
1. `src/streets.js`
2. `src/atmosphere.js`
3. `src/boundaries.js` & `data/manhattan-boundaries-enu.json`
4. Integration in `src/wireframe.js` and `index.html`.

This is the third clean extraction in the Life Itself untangle. While Extractions 001 and 002 established the mathematical projection and deterministic time, Extraction 005 grounds the island in physical light and surveyed urban circulation.

## What was taken

### 1. Surveyed Street Corridors (`src/streets.js`)
Extracted surveyed WGS84 waypoints for iconic Lower Manhattan and Midtown thoroughfares:
- Broadway (Lower Manhattan corridor from Bowling Green past Wall St to Fulton St)
- Wall Street (Trinity Church to East River Pier 11)
- Broad Street (Wall St to Pearl St)
- Water Street (FDR corridor)
- Maiden Lane
- Times Square Broadway Spine

Projected into the Times Square ENU frame and rendered as illuminated road ribbons at $y = 0.8\text{ m}$ above the base grid, tracing the real road network between building footprints.

### 2. Diurnal Solar Atmosphere (`src/atmosphere.js`)
Astronomical solar equations computed for Manhattan's exact geographic coordinate ($40.7580^\circ\text{ N}$):
- Solar declination $\delta = 23.44^\circ$, hour angle $H = (h - 12.0) \times \frac{\pi}{12}$.
- Solar elevation:
  $$\sin \alpha = \sin \phi \sin \delta + \cos \phi \cos \delta \cos H$$
- Photometric atmosphere transitions:
  - **Solar Daylight (12:00):** Deep navy sky (`#081326`), crisp blue building wires (`#2b6cb0` $\to$ `#aee7ff`), ice-blue streets.
  - **Golden Hour Dusk (18:30):** Twilight rose sky (`#1a0d14`), warm radiant gold building wires (`#9a3412` $\to$ `#fde047`), glowing fiery amber street ribbons (`#f97316`).
  - **Night Urban Grid (23:00):** Obsidian sky (`#030508`), dark steel building bases with electric cyan tower crowns (`#0f1c2e` $\to$ `#38bdf8`), glowing yellow night street grid.

### 3. Shoreline & NTA Boundaries (`src/boundaries.js`)
All 38 official 2020 NYC Neighborhood Tabulation Area (NTA) polygons projected into the ENU coordinate plane (`data/manhattan-boundaries-enu.json`):
- Traces the exact waterline shoreline along the Hudson River, East River, Battery, and Harlem River at $y = 0.2\text{ m}$.
- Outlines every official neighborhood boundary, providing a physical ground truth beneath the building prisms.

### 4. Deterministic State Journaling
Every time-of-day shift (☀️ Noon, 🌅 Dusk, 🌙 Night) is logged as an immutable tick in `StateJournal`, preserving complete auditability.
