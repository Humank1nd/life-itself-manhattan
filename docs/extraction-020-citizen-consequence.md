# Extraction 020 — One citizen, one verified consequence (Phase 017, P017.3)

The accountable loop on the live sim: perceive → propose → validate +
commit → apply exactly once → shutdown/restart → same causal future.
Deterministic cognition (seeded traits + motives + positions); no
model, no provider, no GPU.

## What landed

- **`src/citizen-agency.js`** — `perceive` (lowest motive + nearest
  neighbor survey), `propose` (lonely→socialize in range, drained→
  rest, else step along the current lane segment), `applyEvent`
  (lawful effects: rest/socialize motive deltas in bounds, moves
  re-derived from lane geometry).
- **`scripts/test-citizen-consequence.mjs`** — the milestone proof:
  neediest citizen decides at tick 12, commits exactly once
  (duplicate rejected), effect applied, fresh-city restore replays
  the same decision, and 18 further ticks match the uninterrupted run
  bit-identically — snapshots, summaries, trajectories, motives.
- **Wiring:** `test:citizen-consequence` in `package.json` and the
  shared JS-gates workflow. README line below.

## What this proves (and what it doesn't)

Proven: a citizen decision produces a lawful, observable, persistent
consequence that survives shutdown and restart with the same causal
future. Not proven: multi-citizen interaction effects, journal sealing
of events (contract is journal-shaped; the page appends at ask/tick
time in a later slice), any neural involvement.

## Committed = applied = recovered (review hardening)

Commit checks the applied set but never mutates it; the caller records
the ID after the effect applies. On restore, `rebuildApplied` rebuilds
the set from the checkpointed event log, and `verifyRecovery` asserts
the three are one set: a logged-but-unapplied event (crash between
commit and effect) must be replayed, never silently skipped; an
applied-but-unlogged ID means the log is incomplete. Both fail closed.
There is no path that executes one committed event twice — and none
that drops one silently.

Run `npm run test:citizen-consequence` for the gate.
