# S3 Rat Embodiment — Black Rat model + animation integration

## Exact scope

The uploaded Black Rat FBX from Nestaeric now has a textured, rigged,
locally verified Three.js visual adapter. It represents existing LIM citizens;
it does not create simulated rats or alter their position, survival state,
agency, journal, checkpoint or GEV observations.

Source ZIP SHA-256: 46ca775027a14920c4b47666d464fa699fc6b81316439a364411c4b7c95afb45
Creator/license: assets/black-rat/ATTRIBUTION.md (Creative Commons BY 4.0).

## Asset and mechanics

- assets/black-rat/blackrat.glb: a glTF 2.0 skinned model with embedded
  source textures and 3 active animation clips: idle_A1, walk_A2, run_A1.
- Original FBX has 12 animated actions and 1 static pose. Blender 4.5.0
  converted it, retaining rig, material textures and NLA clip bindings.
- Blender import measured original rat length 0.43580424785614014 meters.
  Runtime calibrates this to 0.56 meters, without trusting the rest-pose
  bound (which underestimates the deformed, tail-inclusive animal).
- src/rat-visual-policy.js chooses focal actor and nearest second actor
  deterministically. Maximum 2 detailed skinned rigs in this preview.
  All 96 living-city walkers continue in the existing lightweight points.
- Idle/walk/run is inferred from authoritative simulated coordinate changes
  on ticks; presentation smoothing and AnimationMixer do not author motion.
- No death animation is invented: the dead are omitted from live visual roster.
- The View 3D Rat button frames the rat with a camera-only operation;
  the neutral ground contact disc is a preview cue, NOT physical geometry.
- Loading failure is nonfatal: the existing city remains operational.
- Game UI includes a source link and CC BY 4.0 credit.

## Muse parallel ownership

Worktree: /tmp/openai/life-s3-rat-model-20261031
Base: b988bea, independent of Muse's dirty gameplay checkout.

Only the independent asset, new visual policy and Three.js visual manager
are safe standalone cherry-pick components. Muse owns active edits in
src/wireframe.js, so the integration call sites MUST be reconciled manually
rather than overwriting that file:
  1. import and initialize createRatVisuals near the scene;
  2. attach required attribution (already implemented on this branch);
  3. update on authoritative city tick and actor selection;
  4. advance mixer each visual frame;
  5. reuse Muse's follow camera if it already provides creature-scale view.

Do not change src/rat-autonomy.js, src/player-intent.js, the P017 action
contract or rat commit/effect/journal ordering in order to add a mesh.

## Independently observed gates on Houston

node scripts/test-rat-visuals.mjs

Actual Manhattan browser:
- GLB asset HTTP 200; source material textures embedded;
- the rigged, textured rat visibly rendered in the headless Chrome screenshot;
- 2 detailed rat visuals and 96 city walkers;
- 3 runtime animation clips available;
- no page JavaScript errors; camera framing invoked.
Screenshot: docs/media/rat-s3-browser-proof.png (captured on Houston)
Proof log: /tmp/rat-final-browser-proof-20261031.log

The first FBX2glTF conversion parsed but skinned vertices collapsed; it
must NOT be reintroduced. Blender 4.5 corrected the skinning. The pure-Python
scripts/prune-black-rat-animation.py strips only constant animation channels
that match their target nodes' rest transforms.

This is a first playable visual integration, NOT final AAA art. No GPU frame
budget, Quest, ground collision, root-motion synchronization, feeding clip,
full crowd mesh LOD or deployment gate is claimed complete.

## S3 + Muse integration replay — 2026-10-31, verified on Houston

The isolated preview contains a COPY of Muse's still-uncommitted S3 control
work (overlay on local Muse HEAD a77cb7e), the model from this PR, and the
P017 movement preflight from PR #36. **This is a tested snapshot, not a
merge or publish of Muse's unfinished code.**

On the actual Manhattan page, headless Chrome:
1. Enabled the existing test-only forced-tick setting (not on normal pages).
2. Paused the world, selected living rat ped_45 and took player control.
3. Turned on Muse's follow camera and focused the textured hero rig.
4. Pressed KeyW, admitted exactly one intent through the existing P017 writer
   AFTER lane-segment preflight, and observed a committed move-effect receipt.
5. Checked that the authoritative rat moved, the AnimationMixer switched to
   walk_A2, the visual target equaled the actor's authoritative coordinates,
   and the journal's hash chain verified.
6. Checked there were zero page errors, then captured the live view.

Proof files:
- docs/evidence/rat-muse-combined-preview-20261031.json
- docs/media/rat-muse-combined-preview-20261031.png
- docs/evidence/rat-muse-combined-SHA256SUMS
- docs/evidence/rat-muse-visual-reconciliation.patch.gz (gzip, Muse-snapshot-specific, review before applying)

The reported ~10.91 m total actor displacement includes movement from the
world's normal city tick; do NOT mistake it for a 10.91 m keyboard step.
The input action itself is still bounded through the P017 move contract.

### Camera reconciliation from replay

In Muse's current S3 follow-camera loop, tracking the *simulation* target
directly can outrun the visibly interpolating rig and leave it outside frame.
This was reproduced and then fixed in the isolated combined preview.

The visual manager now exposes a read-only, immutable
displayPositionOf(actorId) result. The UI owner should follow that display
position when it exists; fallback to the authoritative position when it does
not. The camera may move using interpolated world presentation without ever
writing the simulation, gameplay state, or journal.

Suggested visual-only integration at Muse's follow-camera admission point:

    const shown = ratVisuals.displayPositionOf(playerControlledRatId);
    const want = shown
      ? new THREE.Vector3(shown.x, shown.y + 0.14, shown.z)
      : new THREE.Vector3(followed.x, 2.74, followed.z);
    const delta = want.clone().sub(controls.target);
    controls.target.copy(want);
    camera.position.add(delta);

The isolated browser replay passed again, and the screenshot visibly contains
the textured, animated rat after the movement.

### Merge boundary

Do NOT automatically cherry-pick src/wireframe.js from this PR over Muse's
active dirty working tree. The UI reconciliation lives only inside the
separate preview at /tmp/openai/life-s3-muse-rig-preview-20261031.
Muse must commit/hand off its S3 UI work before this shared-file merge is
reconciled. PR #36 preflight is also required for the demonstrated combined
browser path; prior zero-displacement P017 receipts must remain rejected.

The preview's verified unit gates include: test:player-panel,
test:rat-player, test:action-contract, test:citizen-consequence,
test:rat-integrity, test:rat-survival, test:world-checkpoint,
test:public-tree, test:licensed-content, test:solid-buildings,
test:player-embodiment, test:rat-visuals, and test:player-input.
