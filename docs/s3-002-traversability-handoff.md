# S3-002 — traversability authority admission, Muse-safe

Date: 2026-10-31.
Source: PR #38, feat/s3-002-grounded-block-20261031.
State: tested at the P017 commitAction boundary with actual map geometry,
NOT switched on in Muse's uncommitted playable runtime.

## Verified

- src/traversability.js is a pure, fail-closed segment and building-footprint validator.
- src/action-contract.js accepts an OPTIONAL traversability context for
  move actions. When supplied, it validates BEFORE creating an event/receipt.
- Existing S2 historical action contexts (no policy supplied) are unchanged.
- Live actor identity, alive status, own lane/segment/fraction, actual
  starting position, same-segment target, nonzero movement, source map
  coverage, body radius and footprint polygon clearance are checked.
- Building footprints are read from the current ENU map. Path/polygon edge
  crossings and narrow walls between sampling endpoints are refused.
- Candidate rat-body radius is 0.15 meters. This is gameplay clearance,
  not a biological measurement.

## Real-world-source acceptance on Houston

node scripts/test-traversability.mjs — PASS

- Broad Street: 0.687m on existing lane_broadStreetSouth_east
  committed, yielded a receipt, applied once, duplicate rejected.
- Pine Street: 1.20m on existing lane_pineStreetEast_east
  rejected before commit: building-obstacle:1001020.
- 10 malformed/invalid authority contexts fail closed; no state mutation.
- The earlier S2 ungated context retains exact historical behavior.
- 24 existing authority, recovery, ecology and gameplay suites passed.
- Proof: docs/evidence/s3-002-p017-traversability-proof-20261031.json
  and accompanying SHA256SUMS.

## Integration for Muse: one explicit authority boundary only

Muse's primary uncommitted src/rat-autonomy.js, src/wireframe.js, and
S3 graybox modules remain untouched. Do not replace those files.

In Muse's commitRatAction writer, after obtaining the live actor and
a complete block derived from actual data/manhattan-enu.json and
live city-owned lanes/objects, supply the gate only for intentionally
opted-in player movement in the bounded 180m pilot:

    const navigation = selected.action.type === 'move'
      && ctx.traversabilityRequired
        ? {
          actor: state.pedestrians.find(p => p.id === selected.action.actorId),
          block: ctx.traversabilityBlock,
          bodyRadiusM: 0.15,
        }
        : null;
    const event = commitAction(selected.action, {
      citizenIds, positions, tick, lanes: state.lanes,
      patchesById, objectsById, agentsById,
      traversability: navigation,
    }, ctx.applied, ctx.lastTick.n);

This is an illustrative insertion, not a replacement for existing commit
ordering, receipts, journal and integrity-fault handling. A required but
missing block MUST reject; never silently fall back to the legacy path.
The actor comes from live simulation state at commit time; the building
source must be provided by the authoritative world loader, not the UI,
GEV, an LLM-synthesized proxy, or an untrusted client argument.

PR #36's player preflight protects against false zero-displacement moves,
but this action validator must repeat source-map checks at COMMIT time.

## What is NOT yet complete

1. Muse's active gameplay writer has not yet enabled this opt-in gate.
2. Simulation-owned automatic walker movement runs outside P017 player
   commit and may still cross the mapped building conflicts.
3. The 6.2m lane offset still intersects source footprints. This rejects
   invalid moves; it does not invent a continuous repaired route.
4. Footprints are source-projected rather than verified field surveys;
   no physically verified shelter, height clearance, 3D body collisions
   or full playthrough is established.

Keep the PR draft until Muse reconciles the single authority seam and
a complete browser demonstration proves lawful movement and a verified
journal across the proposed block.
