# Extraction 021 — Phase A rat ecology: waste, roaches, forage

Deterministic nutrient metabolism for one city block. No individuals
below rats, no models, no providers. Follows the repo's Phase 014/017
pattern: pure modules, seeded or seed-free determinism, gated.

## What landed

- **`src/ecology.js`** — waste-node state machine
  (fresh → rot → bloom → residue → cleared), Holling-type-II roach
  consumption, logistic growth against a moisture/warmth carrying
  capacity, turnover and die-off back to residue, sanitation events
  with refuge survivors, seasonal modulation, explicit external-input
  booking (`addedKg`) so mass is exactly conserved.
- **`scripts/test-ecology.mjs`** — the gate: year-long conservation
  across seasonal swings and sanitation events, extinction without
  waste, pulse-bloom-bust cycles, 10-year stability, byte-identical
  replay, forage ranking (bloom > fresh > cleaned), fail-closed
  inputs.

## Design notes that survived contact with the numbers

- Roaches are biomass pools, not agents. The forage index keys on
  roach *density*, not standing rot — efficient colonies leave no
  leftovers, and the metric must not punish them for it.
- A fresh pulse blooms then busts in a closed system; sustained
  colonies need sustained inputs (restaurants, trash day) or
  immigration, both explicit future inputs — never conjured mass.
- Residue is history, not dinner: it scores ~0 as forage.

Run `npm run test:ecology` for the gate.
