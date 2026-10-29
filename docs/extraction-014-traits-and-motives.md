# Extraction 014 — Quarry traits + Sims motives (dark code)

Fills the skipped 014 slot in the extraction ladder with the quarry's
personality core. No walker behavior changes: this is dark code with a
gate. Seating the trait engine (which system drives walkers) remains the
founder's open ruling.

## Source (read-only)

`Humank1nd/life-itself` (local: `projects/life-itself`, untouched):
- `multiverse/biosim/development.py` — 16-trait constraints+attractors+
  downloads model: `TRAITS`, `GenomePriors`/`default_genome()`,
  `sample_priors()` (Mersenne Twister jitter ±0.12), `CulturePackage.
  compatibility()`, `init_agent()`, `DevelopmentEngine`.
- `gods-eye-view` `src/life/simsDashboard.js` — the eight Sims motives
  (hunger, comfort, hygiene, bladder, energy, fun, social, env).

## What landed

- **`src/traits.js`** — TRAITS, GENOME_PRIORS, priorFor, sampleTraits,
  cultureCompatibility, motiveRateModifiers. Pure functions, seeded,
  no imports.
- **`src/motives.js`** — the eight motives as pure tick functions with
  trait-modulated drains/recoveries (same keys as the Sims dashboard).
- **`scripts/trait-parity.json`** — ground truth generated verbatim
  from `development.py` (trait list, priors, 5 seeded vectors,
  one compatibility value).
- **`scripts/test-traits.mjs`** — the gate.

## Deliberate adaptation (not a copy bug)

The quarry samples jitter from Python's Mersenne Twister; the port
samples from mulberry32 (platform-stable integer math, same ±0.12
bounds). Same traits, priors, bounds, determinism — different stream.
The compatibility formula is bit-exact (same ops, same order;
verified against the quarry's own output).

## The seating question — DECIDED (founder ruling 1a)

Traits (slow: who the sim *is*) and motives (fast: what the sim *needs*)
are different timescales, not competitors. Ruling 1a seats
**trait-seeded motives**: every walker carries a seeded 16-trait
personality (`seed * 31 + index`); motive drain/recovery rates derive
from it; motives tick with the 5-second city clock under clock-derived
context; snapshots carry traits+motives (traits stay seed-derivable
but are explicit for audit); summaries carry crowd mood. Verified:
sleepiest walker 55.4 vs most-rested 65.7 energy after 60 ticks.

Traits (who the sim IS, slow) and motives (what the sim NEEDS,
fast) use these rate maps (`motiveRateModifiers`): sleep_need drives
energy drain, social_drive drives social drain/recovery,
novelty_seeking drives fun drain/recovery, stress_recovery_rate drives
comfort rebound, emotional_intensity scales recovery amplitude.

Run `npm run test:traits` for the gate.
