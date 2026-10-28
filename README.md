# Life Itself — Manhattan

Life Itself, grounded in Manhattan: a life simulation built on the real island — every building in Manhattan from the city's own open data, streamed into the browser.

Built during the Meta Global AI Developer Hackathon, October 26 – November 4, 2026 (Indie Dev Track, Push the Frontier).

**What was pre-existing:** Life Itself, the simulation concept — a Sims-meets-GTA world grounded in real-world data — and DreamSuite, the platform it grows inside. Both predate this event.

**What is built this week, in this repo:** the Manhattan grounding itself. The whole island's building stock (45,172 footprints with roof heights, 45,513 building records with construction years and ground elevations) pulled from NYC Open Data, and the web experience that stands the island up in the browser so Meta's models can work on a real place.

## Data

Ground truth is NYC Open Data, the city's current BUILDING and BUILDING_P datasets (Department of Information Technology and Telecommunications / Department of Buildings / Department of City Planning):

- Building footprints (polygons, roof height, construction year, ground elevation)
- Building points (one record per building, same attributes)

Manhattan is every record whose BIN falls in 1000000–1999999. Reproduce the pull:

```
node scripts/fetch-data.mjs
```

The fetched GeoJSON lands in `data/` and is not committed; it is public city data, re-pullable at any time from the commands in the script.

## Running it

Serve the folder with any static server and open `index.html`:

```
python3 -m http.server 8000
```

The viewer loads the footprint geometry, extrudes each building by its real roof height, and opens over Manhattan.

## Status

Event-window build in progress. Deadline: November 4, 2026, 9:00 PM ET.
