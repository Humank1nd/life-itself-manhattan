# Extraction 013 — LingBot-World local conditioning adapter (Times Square)

**Status:** Developer pilot, draft-only. Not a trained Manhattan world model, historical reconstruction, rendered video, Quest experience, or merged implementation.

## Recovered canonical interfaces (verified on Houston, October 28, 2026)

- Base: `Humank1nd/life-itself-manhattan` draft PR #6, commit
  `805dd75430ee2067ec9d73aad97fcef3d8342b71`. Historical
  photo timeline, source-grounded 6,623-current-plane / 69-photo memory index
  and spatially bounded retrieval preserved.
- Local world-model code: `/home/humank1nd/lingbot-world-v2` and
  `/home/humank1nd/projects/dream-caesar/backend/serve_worldmodel.py`.
  The actual Dream Caesar loopback bridge on **127.0.0.1:8013** exposes
  `GET /health` and `POST /v1/viewport/generate`. Supported request fields
  include `prompt`, `init_image_hex`, `pose_cm`, `camera_path`,
  `frames`, `seed`, `photosensitivity_safe`.
  **Important:** this bridge cannot directly consume structured spatial planes,
  historical building graphs or semantic feature embeddings yet. The
  data-rich world-memory record is a separate sidecar.
- Health observed `{"status":"degraded","weights_ready":false}`;
  **no usable LingBot weights verified**. HTTP inference MUST NOT run until
  `weights_ready=true`. Running service does not prove model readiness.
- Source photograph for the pilot: Wikimedia Commons
  [NYC Times Square wide angle](https://commons.wikimedia.org/wiki/File:NYC_Times_Square_wide_angle.jpg)
  by Daniel Schwen, CC BY-SA 2.5, capture date **2005-12-08**.
  Local file is `assets/evidence/commons-1284794.jpg`; verify recorded
  SHA-256 before invoking any provider. Reuse license and photographer
  attribution must remain attached to any output. This image's
  `modelTrainingPermission` remains **unreviewed**; there is no training.

## Implementation

- `src/world-model-conditioning.js` composes a fixed, deterministic
  2005 pilot conditioning packet from the existing spatial-memory retrieval
  and the original source evidence. It validates date, license, source digest
  identifier, no 2026 geometry in 2005, and no invented camera calibration.
- `data/lingbot-conditioning-pilot-v1.json` is the durable, auditable
  **metadata-only packet** (3 KB). It contains *no image pixels or model weights*.
- Three controlled synthetic poses in the Twin Earth ENU frame:
  `[-5,1.68,0]`, `[-3.75,1.68,0]`, `[-2.5,1.68,0]` meters.
  The adapter maps to the bridge's Z-up, centimeter `[x,y,z]`
  as `[east,south,up]*100`, yaw 0 and pitch 0.
  This describes a **synthetic 2.5 m eastward move** in model coordinates,
  not the actual 2005 camera's pose, not verified relative scene scale.
  It also provides an explicit negative historical-evidence qualifier in
  the prompt. Model conditioning on a single photo does not make generated
  frames historically accurate.
- `scripts/lingbot-pilot.mjs`:
    - `--prepare`: rebuild immutable metadata packet without contacting provider.
    - `--health`: read only the known loopback endpoint.
    - `--execute --approve-local-inference --rights-reviewed`: requires
      both explicit flags, model ready, file digest match, no external host.
      Only then loads the original photo into hex and submits a **single**
      supported provider request. Service failures do not get described as
      generated frames. These flags require an actual source rights/derivative
      review by the operator, not automatic assumption.
- `src/spatial-memory-viewer.js` gains a read-only button **Prepare LingBot
  2005 pilot**. It shows the source ID and three-waypoint plan only;
  **no browser-to-loopback requests, no inference**, no misleading video UI.
- Original simulation, source provenance and source 3D mapping remain the
  authoritative state.

## Verification

```bash
npm run pilot:prepare
npm run pilot:health
npm run test:lingbot
npm run test:memory
npm run validate:city
npm run test:city
npm run test:facades && npm run test:atlas && npm run test:evidence && npm run test:catalog
node scripts/test-journal.mjs
```

`test:lingbot` checks deterministic source + photo hash, 3-waypoint
ENU→Z-up transform, exact supported LingBot request keys, year=2005 with
zero current planes, blocked unreviewed training, degraded health
causing **zero POSTs**, missing local-license authorization, disallowed
remote hosts, and a **mocked** success response. Mock responses do not
establish real model output.

### Browser smoke check (verified on Houston)

Headless Chrome exercised the actual full Manhattan browser scene:
- In year 2026, the new pilot button **blocked** preparation with an explicit
  instruction to select 2005; `pilotPrepared=false`.
- In year 2005, the button prepared `commons-1284794`, with **3** synthetic
  camera waypoints, **no historic geometry** and **no provider request**.
- Changing back to 2026 cleared the pilot state.
- Existing **96 simulated pedestrians** remained active.
- **Zero** requests to port 8013 or the viewport endpoint were observed;
  zero browser page or console errors.
- Test runtime was ~51 seconds in headless software graphics mode. This is
  **not** a headset or real-model performance benchmark.

## Cross-section handoff proposal

- **From:** Life Itself Manhattan world-model integration engineering.
- **To:** DreamSuite 00 Mission Control, 02 Architecture, 06 Engineering & CI.
- **Objective:** Review optional local LingBot video inference contract.
- **Verified:** Existing Houston API, schema, health state, prepared packet,
  dry-run/mocked service safety, code/test evidence and browser smoke test
  (when independently reported).
- **Approved product direction:** Research-driven hybrid engine / world-model
  renderer. Historical/source knowledge remains authoritative.
- **Open dependencies:** local model weights, model service health,
  license/derivative review, calibrated camera source, shared 3D memory
  conditioning API, Quest/WebXR performance, real output quality tests.
- **Next action:** Verify provider model readiness (without automatic weight
  download); license audit; run a single real keyframe inference; compare
  apparent motion against the prescribed trajectory, retain output as
  *generated/unverified*, and measure GPU resources.
- **Acceptance:** no unauthenticated external provider calls, no inferred
  historic fact, source attribution and hash retained, no auto-training,
  reproducible single-run checkpoint, safe failure when weights absent.
- **No implied synchronization:** this handoff file does not notify or
  activate another ChatGPT section.

**No AWS billing, model download, model training, production activation
or repository merge is part of this PR.**
