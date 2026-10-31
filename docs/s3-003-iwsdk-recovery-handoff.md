# S3-003 — IWSDK player-facing visual recovery

**2026-10-31. Status: isolated, actual browser-verified partial recovery.**
Muse's currently uncommitted LIM `app/` checkout was NOT edited or committed.

## What this corrects

The original IWSDK app ran from the right code and had a working LIM adapter,
but the initial camera sat at (0,1.7,0) while the controlled rat was near
(-2157,0,5698). The rat loaded into the scene but never appeared in the
player's actual view. The fixed default camera also showed a huge amber
debug marker and unlit gray blocks. The legacy root wireframe still has
the complete Manhattan source.

The patch `docs/patches/s3-003-iwsdk-visual-recovery.patch.gz` contains
**only edits to four existing files from Muse's uncommitted app snapshot**:
- `app/src/main.ts`: IWSDK player origin rather than tracked child camera,
  synchronous spawn before first RAF tick, camera tracking of visual rat,
  balanced daylight/fog, a street-facing third-person camera, lazy map-mode
  toggle, no duplicate XR button.
  It does NOT author movement or alter LIM state. Includes dev-only
  read-only `__limVisualProof` for screenshot assertions.
- `app/src/environment/manhattan.ts`: don't compile 45k-building island
  wireframe until user requests City View; correct building extrusion
  ENU sign; replace 4.4m amber debug diamond with a grounded, 1m
  green dumpster *visual* at the existing simulation-owned position. New source-derived sidewalk ribbons
  and procedural facade floor bands are purely presentation geometry;
  they do not authorize collision, imply observed windows, or add gameplay
  objects.
- `app/src/ui/game-hud.ts`: player HUD omits journal engineering fields
  unless the URL includes `?debug`. Still displays actual hunger.
- `app/public/hud.css`: brighten page, style one camera-mode control.

IMPORTANT: Full Manhattan geometry is not deleted. `createManhattanOverview`
lazily builds it on explicit request. The root diagnostic viewer remains
independent. The rat is the original CC BY 4.0 Nestaeric rig.

## Actual tests performed on Houston

- Isolated app served at `https://localhost:8195/` (Houston-local).
- IWSDK Vite endpoint HTTP 200.
- Browser: textured rig loaded, about 0.56m long; initial player origin
  moved to the simulation rat's x/z; cameraWorld now matches the player
  instead of (0,1.7,0); rat projects near NDC (0.019,-0.109).
- Actual street-level screenshot:
  `docs/media/s3-003-iwsdk-rat-street-proof-20261031.png`
- Measured headless rendering loop: 7 RAF callbacks in 2 wall seconds,
  game frame counter reached 8; **this is below a shippable FPS budget**.
- App `npm test` passed (LIM adapter, real rig clips), `npm run typecheck`
  passed. Browser image and diagnostics were inspected, not inferred
  from the server being alive.
- Hashes in `docs/evidence/s3-003-iwsdk-SHA256SUMS`.

## NOT verified; production gates still open

- The current street image shows the textured rat and cleaner HUD, but
  the nearby built environment still looks sparse and gray, even after
  the pavement ribbon and facade-band pass. It does
  **not** pass final "recognizable Manhattan street" art acceptance.
- City View is implemented using preserved full source geometry; an
  earlier eager city-mode screenshot was visually inspected, but the
  **latest lazy-loading variant has not yet had a post-change image proof**.
- Real headset/XR pose handling, Quest frame budget, full human play
  session, legal traversability and reliable interaction still need proof.
- Disk exhaustion on Houston (0 available during a screenshot) was
  encountered multiple times. Only assistant-owned, clean, already-pushed
  old worktrees and redundant model conversions were cleaned. Muse's
  active processes and files were left alone.

## For Muse to integrate

No user uncommitted code was placed into this PR. The patch was generated
relative to the active app snapshot on 2026-10-31. At that exact snapshot,
the read-only command `git apply --check` passed in the real active
checkout. Muse must review and re-check before applying.

    cd /home/humank1nd/life-itself-manhattan
     gzip -dc /path/to/docs/patches/s3-003-iwsdk-visual-recovery.patch.gz | git apply --check -
    # After gameplay owner review, optionally:
     gzip -dc /path/to/docs/patches/s3-003-iwsdk-visual-recovery.patch.gz | git apply -

Do not wholesale replace uncommitted `app/`, `src/wireframe.js`,
`src/rat-autonomy.js`, or `src/graybox.js`.

Next concrete game-facing gates: 1) curb/sidewalk and mapped facade visuals
at street scale, 2) sustained browser FPS, 3) a verified real WASD
commit/action receipt in IWSDK, 4) actual city-toggle screenshot and
return-to-rat continuity, 5) IWER and physical Quest testing.
