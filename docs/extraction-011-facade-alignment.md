# Extraction 011 — Times Square façade regions and conservative auto-alignment

**Origin:** Life Itself Manhattan / ASI4XR world-model pilot.
**Founder-approved choices:** Times Square first; segment *each visible building* into individual candidate façade masks; model demolished predecessors as time-versioned separate identities; automatically accept only genuinely high-confidence, independently verified matches.
**Status:** Proposed implementation; draft / not merged / no Quest headset validation.

## Inspected sources

- Base: `Humank1nd/life-itself-manhattan` feature branch `feat/commons-time-catalog-20261028`, commit `b1a59f5a77f4cbda6efd1f7a27b81c7f4bf5c85e`.
- Existing geometry: NYC Open Data footprint rings (45,172 Manhattan BINs); ENU frame centered on Times Square; 25 Twin Earth survey anchors.
- Existing photos: 4 CC BY/CC BY-SA local originals (2005, 2006, 2010, 2015), exact image hashes, approximate Commons geotags and unreviewed building-class masks.
- Existing discovery catalog: 284 unreviewed Commons candidates, 66 both geotagged and dated.
- No verified camera orientation or calibrated photographic pose exists for those original images. Closest building centroid can be ~55–62 m away, illustrating why nearest-building lookup is not proof of identity.

## New work

- `data/times-square-building-versions-v1.json` represents **622** bounded current building identities and footprint snapshots within 520 m of the Twin Earth origin. Each has `validityStatus=current-snapshot`, `validFrom=null`, `validTo=null` and may carry an NYC construction year explicitly tagged unverified. **No current snapshot is automatically inferred to exist in earlier years.**
- Separate `entities` and `versions` support historical predecessors and successors linked by IDs. A demolished predecessor requires a separate, uniquely identified historical entity with a documented date range and archival source. Zero predecessor claims are currently ingested, because source evidence was not verified.
- `scripts/segment-facade-candidates.py` runs MIT-licensed OneFormer ADE20K panoptic segmentation on the four local images, then partitions wide building-class regions along bounded vertical edge seams. **16** distinct mask-region *proposals* were generated. The model treats buildings as a *stuff* class and can merge neighboring structures. Vertical seams may cut a single building or group multiple buildings. Thus all 16 instances have `uniqueInstance=false` and `status=machine-proposed-unreviewed`; do not label them individually identified façades yet.
- The OneFormer model checkpoint loaded with missing layer-normalization weights in this local Transformers runtime; visual accuracy is unvalidated, another reason to withhold verified-instance status.
- `data/facade-matches-v1.json`: **16** façade regions, **96** preliminary geographic candidate pairs (6 for each instance), **zero** automatically accepted. Ranking uses distance from the Commons geotag to footprints only; it is explicitly `unverified-geotag-to-footprint-proximity`, not a match probability.
- The year-filtered browser can show each source photo, its four individual candidate mask thumbnails, and buttons to highlight nearby candidate buildings in the actual map as *PROVISIONAL*, not confirmed. No historical photo is silently linked to the present-day building.
- `data/facade-corroboration-v1.json` is an **empty, typed evidence input** for independently verified camera surveys, image-to-image correspondence, geometry projection, source photo hash, and competitor-match assessment. `scripts/build-facade-matches.mjs` evaluates supplied corroboration for every proposed region/building pair and **automatically promotes a unique qualifying candidate** only when all gates in `assessMatch()` pass. If none or multiple pass, the matching record abstains. Real evidence is not yet present.

## Automatic acceptance policy (approved intent; strict implementation gate)

`assessMatch()` can yield `automatically-accepted` only if ALL checks hold (thresholds are conservative engineering hypotheses, **not yet empirically calibrated match probabilities**):
1. Photo source and exact capture date are present.
2. A locally attributed, individual (not merged/partitioned) façade instance has segmentation confidence at least **0.90**.
3. A **separately surveyed, independently sourced calibrated camera pose** exists, with source URL and at most **2 px reprojection error**.
4. The building's exact historical version has an independently documented validity interval covering the photo's capture date.
5. Visual geometry overlap (mask IoU) is at least **0.87**, with at least **18** feature inliers and inlier ratio at least **0.72**.
6. Visible projected façade fraction is at least **0.60**, geometry projection independently verified, and at least two independent evidence sources agree.
7. Combined weighted evidence score is at least **0.93**, with a **required measured** competing-candidate score and margin of at least **0.15**. No measured runner-up means abstain.
8. All inputs are typed and validated; registry references must be internally consistent. A mere Commons geotag **never** satisfies the camera-pose gate.

This is a **policy-level evaluation function**, not an end-to-end calibrated camera-pose / feature-extraction pipeline. Synthetic fixtures confirm the auto-accept branch works for fully evidenced records and adversarial fixtures confirm abstention. **No real photograph satisfies these prerequisites yet.** Do not mistake the model's building-class confidence for identity confidence.

## Reproduction and independent checks

```bash
python3 scripts/segment-facade-candidates.py --limit 4
node scripts/build-building-versions.mjs
node scripts/build-facade-matches.mjs
npm run test:facades
npm run validate:city && npm run test:city
npm run test:atlas && npm run test:evidence && npm run test:catalog
node scripts/test-journal.mjs
npm run serve
```

The segmentation model requires a first-time network download and a suitable local Python/PyTorch/Transformers environment. No model checkpoint is committed.

## Required next evidence gates

- Audit the 16 masks to distinguish actual separate façades from arbitrary panoptic partitions; if necessary, replace with per-building instance masks generated by geometry- or text-prompted segmentation.
- Obtain or infer **camera direction and pose** with verifiable calibration against mapped building corners, stable keypoints and street panorama imagery; do not treat archival Commons coordinates as camera origins until checked.
- Compute independent image-to-image and image-to-3D geometric correspondences. Held-out references must test false matches under lighting, weather, signs, renovations and façade replacement.
- Locate sourced archival demolished-building data, ownership/address/BIN history, and dates; create predecessor/successor entities with documented provenance and uncertain time precision rather than back-projecting 2026 geometry.
- Independent benchmark and threshold calibration on *real* multi-year, multi-building Manhattan examples before enabling unattended identity acceptance at scale.
- Founder final acceptance, merge review, browser/mobile/Quest performance and ongoing copyright/license compliance.

**No world model training, production identity automation, new AWS spending, or Unreal City Sample asset copying occurs in this PR.**
