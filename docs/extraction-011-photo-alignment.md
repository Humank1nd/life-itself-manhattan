# Extraction 011 — Photograph-to-building alignment

The photo lane's stated next milestone after the time catalog
(Extraction 010): start connecting photographs to the island's actual
building records. This extraction builds the first, deliberately
conservative version — geometric and temporal candidacy, fully
explained, nothing confirmed.

## What landed

- `scripts/build-photo-alignment.mjs` — the deterministic builder.
- `data/photo-alignment-v1.json` — 70 photographs aligned (the 4
  evidence photos plus the 66 catalog records that carry both a
  geotag and a capture date), 350 proposed candidate pairs.
- `src/photo-alignment.js` — the layer validator, wired into the City
  Scene validator; the layer is registered in the scene manifest as
  kind `proposed-geometry-time-candidates`, and the contract test now
  rejects any attempt to relabel it a verified match.
- `scripts/test-photo-alignment.mjs` — the gate (2,250 checks).

## Method (geometry-and-time-v1)

A Commons geotag may mark the camera position or the pictured subject
(the catalog's own semantics), so candidacy is radial: every building
whose footprint comes within 150 m of the photo point is considered.

- **Hard filter:** a building recorded as built after the
  photograph's year is excluded outright. A 2005 photograph cannot
  contain a 2010 tower, whatever the geometry says.
- **Score** = (0.55 · proximity + 0.45 · prominence) · timeFit.
  Proximity decays exponentially with footprint distance
  (exp(−d/45)); prominence grows with height (min(1, h/60)); timeFit
  is 1.0 when the building predates the photo and 0.55 when either
  year is unknown. Top five per photograph, minimum score 0.05.
- **Reasons:** every candidate states its footprint distance, its
  build year against the photo year, and its height, in plain words.

Projection uses the verified transform (Extraction 001 constants).
Cross-check: the builder's ENU point for the 2005 Times Square
evidence photo reproduces the evidence record's own stored position
to the centimeter.

Strongest proposal in the set: catalog photo commons-153095542 (2024)
sits inside the footprint of BIN 1085682 (built 1998) — score 1.0.
The 2005 Times Square wide-angle's top candidates are the square's
own towers, 17–27 m away, all built 1970–1989.

## What this is not

No photograph has been visually matched to a façade. Scores rank
geometric and temporal plausibility only. The evidence registry's
`buildingBin` fields remain null: a confirmed assignment is a human
act, recorded there, not a builder output. Nothing here is approved
for model training.

## Next

The visual pass: compare the stored photos' building masks
(Extraction 009) and catalog previews against candidate façades, and
promote or reject proposals with evidence a person can inspect.
