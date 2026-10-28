# Extraction 002 — The State Journal (deterministic time)

The second carve-out from the quarry, ruled by the founder on 2026-10-28
after the estate partition mapped the journal to Life Itself's ground.
Extraction 001 took the projection (space). This one takes time: the
island's history is now written into the same hash-chained journal the
quarry's runtime uses, so what happened on the island can be verified by
anyone, and cannot be quietly rewritten.

## Source

`Humank1nd/life-itself`, `genesis/state_journal.py` (6,663 bytes, read
firsthand 2026-10-28), with its usage in `genesis/runtime.py`: every
simulation tick is wrapped in `tick_begin` / `tick_end`, and `tick_end`
carries `world_hash = hash_world_state(world.stats())`.

## What the contract is (verified from the source, not the docs)

- Entry hash = SHA-256 hex of the canonical JSON of
  `{sequence, tick, event_type, payload, previous_hash}`.
- Canonical JSON = `json.dumps(..., sort_keys=True, separators=(",", ":"))`
  with Python's default ASCII escaping.
- `hash_world_state(stats)` = SHA-256 of the canonical stats.
- Genesis `previous_hash` is `""`; sequence starts at 0.
- `verify_chain()` recomputes sequence, linkage, and every checksum.
- `checksum_until_tick(t)` = SHA-256 of the concatenated checksums of
  `tick_end` entries with tick ≤ t.
- `recorded_at` is wall-clock and is NOT part of the hash — determinism
  does not depend on when an entry was written.

## Verification standard: checksum-for-checksum

`scripts/parity-journal.py` runs the quarry's own file, verbatim, over a
fixed input script (genesis snapshot of island-shaped stats, one wrapped
ask) and writes the expected values to `scripts/parity-expected.json`.
`scripts/test-journal.mjs` builds the identical history with the port and
asserts every value equal. On 2026-10-28 all 8 checks passed, including:

- world hash `0d41e1e3…` — identical in Python and JS;
- all four entry checksums — identical, byte for byte;
- `checksum_until_tick(1)` — identical;
- tamper test: changing one recorded answer (589 → 590) breaks
  `verifyChain()`, as it must.

## The island mapping (this repo's runtime decisions, recorded as such)

- **Tick = one completed visitor interaction.** Each ask, building
  selection, and history verification is wrapped in `tick_begin` /
  `tick_end` exactly the way the runtime wraps a step; `tick_end` carries
  the island's `world_hash`. The ground is static, so the world hash
  never moves. Only the history grows.
- **Genesis** is a `snapshot` at tick 0 whose payload is the island's
  world stats (45,172 buildings; 44,345 with a construction year; 44,929
  with a neighborhood; 38 NTAs; the Times Square origin; the three source
  datasets). The live genesis payload adds the dataset list to the stats
  shape used in the parity fixture.
- **Async appends.** SubtleCrypto is promise-based where hashlib is
  synchronous, so `append()` queues and returns a promise; ordering and
  chaining are unchanged. `recorded_at` uses `Date.now()/1000`.
- **Canonicalization in JS** reproduces Python's encoder for the payload
  domain the island uses (null, booleans, numbers in shortest round-trip
  form, strings with Python-style `\uXXXX` escaping, arrays, sorted
  objects). The parity test exercises ints, a float (15.24), nested
  objects, and strings.

## On the page

The HUD carries a journal line (entries, tick, head checksum, history
checksum) and a **Verify the island's history** button that recomputes
the whole chain in the visitor's browser and reports the result — and the
verification itself is then journaled. From the console,
`window.islandJournal` exposes the entries and the same checks.

## Provenance for the record

Pre-existing (quarry, 2025–2026): the journal's algorithm, event
taxonomy, canonicalization, and the runtime's wrap pattern. Built this
week (event window): the JavaScript port (`src/journal.js`), the island
wiring, the parity harness, and this record.
