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
