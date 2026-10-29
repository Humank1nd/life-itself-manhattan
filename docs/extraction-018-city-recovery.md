# Extraction 018 — Deterministic city shutdown/restart (P016-L2b)

Proves continuation instead of assuming it. Uses the actual living-city
simulation — never a fixture.

## What landed

- **`src/city-resume.js`** — `buildResumptionRecord` (snapshot + pinned
  corridor SHA + world config + tick length + contract version) and
  `resumeLivingCity(corridors, record, {corridorsSha256?})`, which
  rebuilds immutable lane geometry from pinned corridors and proves
  every entity consistent before the first post-restart tick:
  pedestrian on-lane proof (positions recomputed from lane/segment/
  fraction), zone geography pinned to zone definitions, traits and
  motives range-checked, motive rates recomputed deterministically,
  duplicate identities rejected, optional strict corridor-hash pin.
- **Snapshot extension** (`src/living-city.js`): zones now carry their
  static fields (lat/lon/type/radiusKm) so resumption can pin them;
  wholly deterministic, all existing gates unchanged.
- **`scripts/test-city-recovery.mjs`** — the round-trip gate: 30 ticks
  uninterrupted vs tick-12 → JSON serialize (fresh-process simulation)
  → restore → continue. Snapshots, summaries, trajectories and motives
  bit-identical at every remaining tick. 10 fail-closed negatives
  (contract, hash pin/mismatch, malformed expectation, zone geography,
  unknown zone, lane assignment, trait/motive bounds, duplicated
  citizen, truncated JSON) + 2 divergence proofs (tampered world
  config, dropped citizen provably change the future instead of
  silently matching).

## What this answers (handoff §1–2)

The snapshot gaps are closed by construction: lane geometry is rebuilt
from pinned corridors and each pedestrian is proved on-lane; zone
statics are pinned to definitions; world config rides in the record
and any tamper provably diverges; motive rates are recomputed from
stored traits. Versioned contract rejects unknown futures.

## L2c integrity — trusted binding, not just divergence (review condition)

The first version detected tampering as downstream divergence. The
merged version rejects it before continuation: resumption requires a
caller-supplied trusted pin (`corridorsSha256`, exact world config,
exact citizen roster). Altered world config and dropped/added citizens
throw `world config mismatch` / `citizen roster mismatch`; the
duplicate-ID check remains as a per-entity backstop. `data/corridors-sha256.txt`
commits the pinned corridor hash; the gate fails if the file drifts
from the recomputed value.

Run `npm run test:city-recovery` for the gate. No model, no GPU, no
durable storage yet — atomic-commit semantics for a future store are
still open, as is Quest verification.
