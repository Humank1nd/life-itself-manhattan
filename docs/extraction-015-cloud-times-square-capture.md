# Extraction 015 — Cloud-native renderer-neutral Times Square capture

**Founder directive:** This is a **cloud-native** build. Houston is not a build runner or artifact depot. See [Manhattan issue #9](https://github.com/Humank1nd/life-itself-manhattan/issues/9) and [DreamSuite issue #281](https://github.com/Humank1nd/DreamSuite/issues/281).

## What this phase delivers

The independent entry point `capture/times-square.html` and
`capture/times-square-scene.js` read the existing, source-grounded NYC
Open Data **2026-10-28 current snapshot** from
`data/times-square-building-versions-v1.json`. It creates a bounded
Three.js scene of extruded building footprints at their recorded heights,
then produces, from the **same synthetic camera path**, three types of
640×360 PNG frames:

1. `rgb`: clean color of approximate box/prism city geometry with
   fixed lights, **without UI, HUD, photograph textures or neural model**.
2. `depth`: 24-bit RGB encoding of *linear camera-space Z*, normalized
   between 0.5 and 1,400 meters (not GPU nonlinear depth). Background
   is black; interpretation requires metadata and encoder formula.
3. `building-id`: the exact stable 24-bit integer RGB IDs mapped by the
   JSON manifest back to source NYC BIN and building-version identifiers.
   ID **0** means background; renderer disables antialiasing.

The capture camera positions are fixed in the existing Times Square
east/up/-north ENU coordinates, with a common look-at target, 62° FOV and
fixed image dimensions. They are **synthetic**, not calibrated positions
from an archival photograph. No motion is claimed historically accurate.

The capture is a set of **2026 current-snapshot geometry observations**.
Current footprints and construction-year fields do not establish
photographic façades or building existence in 2005. The historical-photo
source catalog and façade proposals are not rendered or reclassified as
ground truth. The image passes are geometric conditioning candidates,
**not** a Manhattan-trained world model.

Geometry limitations are explicit in the output manifest:
simple extruded footprints, unsupported distinction between polygon
parts and holes, no surveyed façade textures, no detailed roof forms,
no sidewalks or real photo camera pose. The complete input manifest
is referenced by content hash.

## Cloud-only job

`.github/workflows/cloud-times-square-capture.yml` runs the capture
only on **GitHub-hosted `ubuntu-latest`**, never on Houston or a
self-hosted runner, and checks out the reviewed revision. The job:
- Uses Node 24 and installs `three@0.160.0`, `pngjs@7.0.0`,
  `puppeteer@24.31.0` inside the *ephemeral hosted runner only*.
- Runs `scripts/cloud-capture-times-square.mjs`. The script **refuses**
  to run without both `GITHUB_ACTIONS=true` and
  `RUNNER_ENVIRONMENT=github-hosted` and requires its output path to
  be inside `runner.temp`. It starts a loopback-only file server.
- Captures **three camera poses × RGB/depth/building-ID = nine PNGs**.
- Verifies PNG signature, dimensions and nonempty masks, checks every
  visible building-ID against the 622 sourced 2026 building identities,
  and compares repeat captures from the same scene for bit-identical
  output. A mock success is not accepted.
- Records file SHA-256, source JSON SHA-256, Git revision, camera poses,
  near/far, RGB/depth/ID encodings, provenance and limitations
  in `manifest.json`.
- Uploads only that output folder as a GitHub Actions artifact with
  **three-day retention**, no persistent local copy, no credential use.
- Grants only `contents:read`, runs with a short job timeout and
  avoids repository forks by default.

Run on the proposed PR by changing a capture input, entry point or
workflow. A manual `workflow_dispatch` is available once GitHub
recognizes the workflow on the default branch. Do not trigger repeated
jobs merely to accumulate generated frames; if the job fails,
inspect its cloud logs and iterate on the source branch.

## License and commercial boundary

The scene is computed from the project's existing NYC Open Data
current building footprints. This PR includes **no LingBot code,
weights, output images or inference calls**, and no pretrained
Matrix-Game code or weights. There is no transfer of the LingBot
CC BY-NC-SA 4.0 noncommercial license into the Manhattan product.

Matrix-Game is a **candidate renderer**, not a currently deployed
dependency. Its code and model repositories have separate licenses
and notices that must be reviewed prior to commercial integration.
A later provider could condition on the RGB and geometry passes
without changing authoritative building identity or timeline state.
Do not treat geometric training examples as an authorization to
train on third-party source photos. NYC source dataset terms and
attribution must also be reviewed for downstream distribution.

## Verification status and acceptance

**Proposed / implemented in PR:** isolated source renderer, 9-pass
cloud capture script, output hashes and source identity gates, hosted
workflow and TTL. Merely committing this workflow is **not** proof it ran.

**Verified only when CI runs:** GitHub Actions job succeeds, produces a
nine-frame manifest and uploaded artifact, repeats deterministic frames,
and reports valid building IDs and unchanged source hashes. Headless
WebGL results are a cloud-renderer property, not Quest performance.

**Blocked / future:** historical façade truth, calibrated camera poses,
3D polygon-hole classification, actual neural world-model conditioning,
commercial rights of any additional model, consistent generated output
and Quest hardware benchmarking.

## Proposed DreamSuite cross-section handoff

- **From:** Life Itself Manhattan / geometry-first renderer engineering.
- **To:** DreamSuite 00 Mission Control; 02 Architecture; 06 Engineering & CI.
- **Objective:** Cloud-hosted, provenance-preserving source-pass renderer
  feeding a future Matrix-Game-style model.
- **Approved direction:** Founder requires cloud-native execution and
  prohibits workstation build/artifact accumulation.
- **Evidence:** This PR source and GitHub-hosted Actions runs and output
  SHA-256 *when available*. Prior local measurements must not be promoted.
- **Next action:** Review and accept cloud capture; plan geometry-aware
  model conditioning and retention/cost controls.
- **Acceptance:** remote-only outputs, current-year truth constraints,
  deterministic geometry/pass IDs, no unauthorized model weights or
  unreviewed historical claims.
- **Coordination note:** Handoff proposal is a durable record, not proof
  another specialist chat received or executed it.
