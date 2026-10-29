# Extraction 019 — Autonomous action/event contract (Phase 017, slice 017.2)

Versioned Observation → ProposedAction → WorldEvent → Receipt. Pure,
fail-closed, no model. Committed events are journal-shaped so the
island's StateJournal can seal them unchanged.

## What landed

- **`src/action-contract.js`** — validators + deterministic committer.
  Space is closed: moves beyond one tick of travel are rejected as
  teleports, `socialize` needs a real citizen in range, observations
  cannot come from the future, unknown actors/types fail. Event IDs
  derive from tick + action ID; committed events carry
  `generated: false`.
- **`scripts/test-action-contract.mjs`** — 3 happy paths (move, rest,
  socialize with proximity) and 11 fail-closed rejections.
- **Wiring:** `test:action-contract` in `package.json` and the shared
  JS-gates workflow. README line below.

## Boundaries

- No journal writes here: commitment produces the event object; the
  page appends it to the StateJournal at ask/tick time (a later slice
  wires walker actions into the tick loop once seating covers acting,
  not just motives).
- No provider, no model, no GPU. Cognition stays on-demand and
  out of scope until a bounded-inference proposal with rights and
  spend caps is approved.
- Social range (25 m) and move range (10 m / 5 s tick) are simulation
  plausibility bounds, not physics claims.

Run `npm run test:action-contract` for the gate.
