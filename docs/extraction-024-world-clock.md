# Extraction 024 — 365-day world clock (Phase B, B01)

The calendar all seasonal systems share. Deterministic skips are
identical to continuous stepping (same code path, fewer decision
points — compression, not approximation). Checkpoints carry the
ecological day and validate it on restore.

## What landed

- **`src/world-clock.js`** — `DAYS_IN_YEAR`, named seasons, year
  rollover, `tickDay`/`skipDays` over any patch set.
- **Resumption record carries `ecoDay`** (optional, validated when
  present); restored state exposes it. No city shape changes.
- **`scripts/test-world-clock.mjs`** — calendar boundaries, year
  rollover, skip==continuous byte-identical, autumn checkpoint at
  day 300 restored and continued identically through the winter
  boundary, fail-closed inputs and bad `ecoDay`s.

The main-path/completionist hour targets from the design remain
playtest measurements, not asserts: the gate proves determinism and
continuity, not pacing. Aging, injury, and mortality are B02.

Run `npm run test:world-clock`.
