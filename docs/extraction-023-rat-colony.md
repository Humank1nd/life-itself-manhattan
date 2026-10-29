# Extraction 023 — Rat colony: shared depletion and scent (Phase A)

Two rats, one patch: the first rat's grazing and scent marks measurably
change the second rat's subsequent decision. No scripts, no direct
coupling — only the patch both can smell. Deterministic.

## What landed

- **`src/ecology.js`** — `graze()` (fresh→rat, tracked in `eatenKg`
  so mass conservation holds), `markVisited` (bounded 20-mark trail),
  `crowdFactor` (0.9^recent distinct visitors).
- **`src/rat-foraging.js`** — appeal now discounts crowding alongside
  memory and disturbance; satiated rats abstain.
- **`src/city-resume.js`** — checkpointed ecology validates patch
  shape and scent-mark shape; `expected.patchIds` pins the roster;
  tampered rosters and malformed marks fail closed.
- **`scripts/test-rat-colony.mjs`** — shared depletion feeds the
  second rat less, scent marks discount revisits, satiation stops
  foraging, marks round-trip through shutdown/restart, mass conserved,
  deterministic.

## What this proves (and the boundary)

Colony members influence each other exclusively through shared,
checkpointed world state — grazed biomass and scent trails. There is
no leader, no script, no direct messaging. Not yet built: active
competition over the same bite, colony-level strategy, scent-field
diffusion between patches, multi-day memory decay schedules.

Run `npm run test:rat-colony` for the gate.
