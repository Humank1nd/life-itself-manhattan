# S3-001 — Parallel player-input intent slice (Muse-safe integration handoff)

## Ownership and scope

Created on `feat/s3-001-player-intent-20261031`, based on LIM `b988bea`.
Files owned by this slice only:
- `src/player-input.js` — pure held-key sampler and lawful action selection;
- `scripts/test-player-input.mjs` — P017 authority + actual Manhattan lane gate;
- this handoff document.

**Do not overwrite or automatically cherry-pick changes into another agent's
dirty checkout.** This branch does not modify `src/wireframe.js`, `index.html`,
`src/capture.js`, `package.json`, the building-renderer work, or any bridge
code. Integration must be done by the owner of those files after review.

## Existing authorities reused, not duplicated

- `citizen-agency.perceive` supplies actor-owned basis observations.
- `action-contract.validateAction` enforces current tick, target distance,
  identity, and lane-bound movement before selection returns an action.
- `citizen-agency.applyEventOnce` remains the only allowed move-effect
  mechanism after the existing journaled commit has succeeded.
- The new module does **not** mutate world state or issue receipts; it has no
  event listeners, DOM, timers, network, clock, or graphics dependencies.

## Integration seam for gameplay owner

1. Create one `createPlayerInputSampler()` for the currently possessed rat.
2. When player gameplay focus owns the keyboard, feed `KeyboardEvent.code`
   to `sampler.press(code)` / `sampler.release(code)`; do not treat key
   repeat as multiple actions. Handle arrow keys only when gameplay has focus.
3. Always `sampler.clear()` on blur, pause, chat/UI focus, camera ownership
   changes, rat death, gamepad takeover, and loss of playable world state.
4. At a *single authoritative city-tick admission point*, sample
   `sampler.axes()` and call `selectPlayerMove(livingCity, {
   actorId, ...axes, yawRadians, distanceM })`.
   `yawRadians` is ENU heading: 0 points +Z, +PI/2 points +X.
5. If status is `selected`, pass the returned **uncommitted** P017 action
   through the same journal/commit/effect/receipt transaction as the existing
   rat gameplay writer. **Do not directly invoke `applyEventOnce` in a UI
   callback** and do not write `ped.x`, `ped.z`, `fraction`, or `tickCount`
   in presentation code.
6. Define precedence for simultaneous player movement, player scavenging,
   and rat autonomy. This slice does not assume who wins. Ensure the actor
   cannot commit two incompatible events in one tick or evade deduplication.
7. Expose an honest `abstained` / `rejected` status where appropriate;
   neither is permission to move an entity directly.
8. Sample gamepad axes into the same `right`/`forward` envelope later;
   do not create a parallel controller-authority path.

## Interoperability with Muse's current S3 movement code

Muse's active checkout already has `src/player-intent.js`,
`selectPlayerMoveAction`/`stepPlayerMoveAction` in `src/rat-autonomy.js`,
and a queued keyboard-control implementation in `src/wireframe.js`.
**Do not replace those files.** The contribution here is independent
preflight, not a competing renderer or keyboard mapping.

A black-box test against Muse's uncommitted runtime reproduced a false
movement success: a rat at (10, 0) on a straight x-aligned lane may submit
(10, 7). Shared P017 distance and lane-tolerance gates accept it; the
current-segment movement effect projects back to (10, 0), yet records a
committed, valid-journal move.

`selectPlayerMoveTarget` is a pure compatibility adapter for Muse's
existing `stepToTarget` output. It returns:
- `selected`: `action.params.to` is projected onto the *actor's own*
  current lane segment and is a nonzero, lawful P017 movement;
- `abstained`: perpendicular or zero-length requested travel, or current
  segment boundary; no journal action should be submitted;
- `rejected`: malformed, over-5m, missing/dead/ambiguous actor, invalid
  basis or geometry; no journal action should be submitted.

Example **for gameplay-owner review**, not applied to Muse's files:

```js
const requested = stepToTarget({ x: rat.x, z: rat.z }, intent);
const proof = selectPlayerMoveTarget(livingCity, {
  actorId: controlledRatId,
  to: requested,
});
if (proof.status === 'selected') {
  // Use Muse's existing authoritative journaled transaction.
  await stepPlayerMoveAction(livingCity, ratCtx, livingCity.tickCount, {
    actorId: controlledRatId,
    to: proof.action.params.to,
  });
} else {
  // Surface a truthful abstention/rejection, never a committed move.
}
```

The test deliberately proves the legacy false-success counterexample and
verifies preflight prevents it. The shared `action-contract.js` remains
untouched; the simulation authority remains Muse's existing P017 path.

### Important limitations

This is an **input contract + movement-selection slice**, not a playable
camera, authored animations, or complete interaction loop. It projects onto
the rat's **current** simulator-owned lane segment and intentionally stops at
its endpoints; next-segment traversal stays with the city simulation. The
existing P017 lane tolerance does not constitute building collision proof.
The renderer and world engineering owners must establish actual collision
and navigation behavior for M1 acceptance.

The S2 city tick already moves pedestrians automatically. Possessed-rat
movement must be reconciled with that scheduled motion by the gameplay owner;
do not apply a second independent movement simulation. Checkpoint/journal
consistency must remain intact.

## Independent verification

```sh
node scripts/test-player-input.mjs
npm run test:action-contract
npm run test:citizen-consequence
npm run test:rat-player
npm run test:player-panel
npm run test:city-recovery
npm run test:city
npm run test:world-checkpoint
npm run test:rat-integrity
```

Testing validates held-key normalization and blur clearing, camera-relative
direction, same-segment and maximum-distance constraints, dead/missing/ambiguous
actors, malformed observations, deterministic selection, genuine Manhattan
lane geometry, and existing exactly-once P017 commit + effect. Browser
integration is deliberately not claimed.

**Next owner action:** inspect this three-file slice, connect it to the
active UI/renderer work at one admission point, and add a headless browser
capture demonstrating one lawful player movement and its sealed receipt.
