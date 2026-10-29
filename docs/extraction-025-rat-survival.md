# Extraction 025 — Rat survival: thirst, aging, terminal mortality (Phase B, B02)

Death is terminal, deterministic, and checkpointed. No model, no
provider, no random numbers beyond seeded init.

## What landed

- **`src/motives.js`**: ninth motive `thirst` (drains, recovers only
  when drinking); energy recovery ×0.85 past 200 days of age
  (`context.ageDays`, defaults to full recovery so old callers are
  unaffected).
- **`src/living-city.js`**: per-citizen `ageTicks`/`injury`/
  `starveTicks`/`alive`/`death`; `TICKS_PER_DAY = 288`,
  `LIFESPAN_DAYS = 365`; exported `checkMortality` (injury ≥ 100,
  3 starved ticks, age past one year); dead citizens are frozen but
  kept in history; snapshot carries vitals; summary reports deaths.
- **`src/city-resume.js`**: vitals validated on restore
  (non-negative age, bounded injury, integer starve counter,
  boolean alive).
- **`scripts/test-rat-survival.mjs`**: thirst drain/recovery,
  age-weakened recovery, exact mortality boundaries, scheduled
  starvation/injury/age deaths in the live sim, frozen corpses,
  checkpoint round-trip with tamper rejection.

The main-path/completionist hour targets remain playtest measurements.
Cold exposure beyond age-weakened recovery, weather, and water-source
geography belong to B03 (seasonal ecology). Water has no map presence
yet — `drinking` is a context flag awaiting fountains.

Run `npm run test:rat-survival`.
