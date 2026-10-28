# Extraction 009 — Licensed Manhattan photo atlas and semantic building masks

**Status:** development branch only. No world model was trained; real Quest or IWSDK acceptance remains pending.

## Actual pilot

- The previously empty `data/evidence-v1.json` now includes four geographically tagged Times Square observations from Wikimedia Commons, captured in 2005, 2006, 2010, and 2015.
- Photos are downloaded through the Wikimedia Commons API after filtering by EXIF capture date, valid coordinates, explicitly whitelisted CC BY / CC BY-SA licenses, and page-attributed source data.
- This first batch uses curated discovery URLs because Commons geosearch was temporarily overloaded. The importer is repeatable and idempotent with page IDs and file hashes; it does not scrape arbitrary sites.
- Geotags are **approximate evidence points**, not verified camera poses or actual 3D geometry. Keep the canonical Twin Earth 25 anchors unchanged. Sources may geotag the pictured landmark rather than the original camera.
- Photo URLs, credit, author, copyright license text/link, resize status, date, weather and illumination *unknown*, and binary SHA-256 are stored in the registry. Actual imagery is in `assets/evidence/`.
- Use `python3 scripts/ingest-commons-times-square.py --limit 4 --dry-run` to inspect potential imports; without `--dry-run`, downloads approved previews. Do not scale search without respecting Commons API limits and attribution.
- Once ingested, select 2005, 2006, 2010, or 2015 using the quick-jump chips or scrub the timeline and see image plates at approximate geotags.

## Building masks

`python3 scripts/segment-buildings.py --limit 4` runs the openly licensed
`microsoft/beit-base-finetuned-ade-640-640` semantic segmentation model
(Apache-2.0 model, ADE20K building class) on **licensed source images only**.
Originals are untouched. It saves a pixel mask and transparent building-only
cutout in `assets/evidence/masks/` and a model-provenance record per observation.

The UI checkbox **Building masks only** switches between original photos and
the transparent cutouts. All output is labeled `machine-proposed-unreviewed`.
No inpainting, missing facade generation, person-removal reconstruction,
photogrammetry, or street-level camera-pose estimation is claimed.
In particular, masking a person standing in front of a building makes a hole;
it does not recover the hidden building. Mask artifacts require human inspection.

Masks and cutouts inherit the underlying image's CC license, including
ShareAlike where applicable. The image record retains the license link,
author credit, original source, and declaration of modifications.

## Rights and future training

Converting a copyrighted photograph into a mask, cutout, painting, or 3D
reconstruction **does not** extinguish its original license or copyright.
A source with unclear or restricted rights must not enter the public dataset
or an unauthorized training run. Each image in this pilot is explicitly tagged
`modelTrainingPermission: unreviewed` even if display/derivatives are allowed.
Before any training, recheck per-license AI usage terms, provenance,
identifiable people, content restrictions, terms of service, and license
compatibility. Retain source-level audit and takedown mechanics.

## Larger sources to research (not yet ingested)

1. NYC 3D Building Model (2014 capture): https://data.cityofnewyork.us/City-Government/NYC-3D-Model-by-Community-District/u5j4-zxpn
2. NYC Buildings records and historical versions: https://data.cityofnewyork.us/d/3g6p-4u5s
3. New York Public Library public-domain historical image collection: https://digitalcollections.nypl.org/
4. NYPL building photo research guide (1870s–1970s): https://libguides.nypl.org/househistory/photographs
5. Wikimedia Commons geotagged source photos with license review: https://commons.wikimedia.org/

The NYC 2014 3D building model is an especially useful date-stamped **geometric baseline** to compare against NYC building footprints, but requires coordinate transformation / license audit before extraction.

## AWS student-credit path (proposed, no AWS usage yet)

Current segmentation ran on founder-owned RTX 3080 laptop hardware, not AWS.
A future AWS batch may store source and derivatives in separately permissioned
S3 prefixes with metadata in DynamoDB or PostGIS; process with an ephemeral
SageMaker or EC2 GPU job; persist SHA-256 and per-source license metadata;
and turn off compute immediately after each batch. Meta SAM 2.1 is available
in SageMaker JumpStart and can refine per-building masks with point/bounding
box prompts. **Actual AWS credit service eligibility, expiration, and current
balance are not verified; do not deploy billable services automatically.**

## Verification and acceptance boundaries

`npm run test:atlas` verifies four real records, provenance, source/mask
checksums, and unreviewed training restrictions.
`npm run test:evidence && npm run validate:city && npm run test:city` also pass.
Manual review of mask pixel accuracy, weather/lighting metadata, real camera pose,
public asset attribution display, and physical Quest interaction are still needed.
