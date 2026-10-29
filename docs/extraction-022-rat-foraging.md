# Extraction 022 — Ecology drives decisions (Phase A integration)

The report asked for proof that different ecological conditions produce
different rat behavior. This is that proof, on the living sim.

## What landed

- **`src/rat-foraging.js`** — distance-limited scent (`sensePatches`,
  60 m), memory-discounted patch appeal, deterministic forage
  proposals (hungry rats move toward the best patch; satiated rats
  abstain), visit memory with decay.
- **Citizen memory is now persisted**: walkers carry
  `memory: {visits}` from spawn, `citySnapshot` includes it, and
  `resumeLivingCity` validates its shape. Memory survives shutdown
  and restart like motives do.
- **`scripts/test-rat-foraging.mjs`** — scent radius, rich-beats-poor,
  satiation abstains, memory discounts, forage→commit→apply→checkpoint
  →restore→identical future, duplicate rejected post-restore.

## What this proves (and the boundary)

Proven: ecological state changes what a specific rat does — same rat,
rich-vs-poor swapped patches, different targets. And the whole loop
survives a checkpoint round-trip. Not proven: multi-rat competition,
colony-level strategy, scent-trail laying (memory is per-citizen
visits, not a shared field — that's the next slice).

Run `npm run test:rat-foraging`.
