# Extraction 010 — Discovery-scale Manhattan photo catalog (metadata-only)

**Status:** draft feature branch `feat/commons-time-catalog-20261028`, stacked on photo atlas PR #3. Not merged or headset-accepted.

## What exists now

- Scans **300 category-member file identifiers** across 12 explicitly selected Wikimedia Commons Times Square categories spanning early twentieth-century history through 2024.
- Fetches and screens source file metadata from the official Wikimedia Commons Action API with pagination, backoff, an identifying user agent, source attribution and exact reusable-license allowlist.
- Keeps **284 licensed metadata candidates**, of which **186 have usable original-date metadata**, **76 have a Commons geotag**, and **66 have both**. These are discovery candidates, not independent historical verification.
- Stores this light, reproducible index as `data/photo-catalog-v1.json`; does **not** download 284 images or bulk-modify files.
- Original four locally downloaded and semantically segmented photographs from PR #3 are preserved without changes.
- The Manhattan browser timeline can now preview up to the geotagged, dated candidates using Commons-hosted thumbnails, labeled **catalog-only / unreviewed**. Items missing date or location stay staged for review rather than being assigned fictitious spatial/temporal coordinates.
- The preview transforms candidate WGS84 geotags into the existing Twin Earth ENU frame; the Rust/WASM geodesy is preferred, and the WGS84 JS fallback is checked against all 25 canonical anchors.
- `data/photo-links-v1.json` contains **87** bounded candidate cross-year proximity connections (within 75 meters, up to two neighbors per item). This is *not* proof the same buildings or camera views appear in both images; no learned visual similarity, correspondence or world-model training is implemented.

## Source-date safety

EXIF `DateTimeOriginal` takes precedence; a Commons original-date field is a fallback. Images categorized under an explicit historical decade or year are rejected for chronological display if the claimed EXIF/Commons date falls outside that category, because scanned archival photographs may have a modern digitization date. Unknown historical years remain unknown. The importer does **not** infer an exact capture date from the file title, category, upload time or camera date without provenance. Some dates provided by the archive may still be approximate or incorrect and require human verification.

## Geographic safety

The Commons location might designate a depicted landmark rather than the camera itself. Treat these as approximate **geotagged observations**, not surveyed camera poses, building geometry, depth maps or image-to-image matches. Geographic bounds are conservative (Manhattan), but categorization as Times Square does not guarantee the picture was taken there. Never silently overwrite the existing 25 surveyed Twin Earth anchors.

## Workflow

1. `python3 scripts/discover-commons-catalog.py --max-files 360 --per-category 85`
   updates metadata catalog (not image assets). The API is used politely, with modest request caps.
2. `npm run build:photo-links` computes reproducible candidate cross-year spatial neighbors.
3. `npm run test:catalog` validates counts, source allowlists, missing-data behavior,
   projection parity, candidate-edge properties, training prohibition and coordinate integrity.
4. `npm run serve`, select a sourced year, and inspect photo cards and translucent 3D preview planes.
5. Promote a candidate into the durable evidence registry **only** after verifying actual depicted location,
   capture date or date precision, original author, license, privacy conditions, source image,
   and repeatable hashing; then review segmentation outputs separately.

Do not use the catalog for any model training. Every record is explicitly
`discoveryStatus=candidate-unreviewed` and `modelTrainingPermission=unreviewed`.
CC BY/CC BY-SA attribution and derivative license terms apply; modifying or masking a photo
never erases the photographer's rights.

## NYPL / AWS dependencies

- The old NYPL Repo API announced retirement on August 1, 2026. The newer
  NYPL Collections API (`https://api-collections.nypl.org/docs`) returned
  an authentication error during this investigation. Do not build automatic
  bulk ingestion against the retired API, or claim NYPL records were collected.
- Future NYPL public-domain ingest must respect source/image-specific rights
  and the current API authentication/terms.
- The current catalog discovery uses Commons only. No new AWS/S3/SageMaker resources
  or credits were consumed. For future scale, keep source binaries in rights-tagged
  object storage, persist metadata and reviews in an indexed DB, and schedule
  bounded GPU segmentation separately from catalog discovery. Actual AWS student-credit
  eligibility and account state have not been checked, so billable deployments are blocked.

## Acceptance limits

The browser UI, local tests, source catalog schema, dataset snapshots and
link generation can be validated independently. Remaining gates: human audit of
sample locations/dates/masks and licensed reuse; browser/mobile memory/cost
testing at full index; reliable thumbnail caching and fallbacks;
verified 3D view-to-image alignment; multi-year matching using image features;
Quest/WebXR performance; founder acceptance and merging the stacked PR chain.
