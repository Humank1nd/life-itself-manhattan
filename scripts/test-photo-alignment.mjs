// Gate for data/photo-alignment-v1.json (builder:
// scripts/build-photo-alignment.mjs, method geometry-and-time-v1).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
let checks = 0;
const check = (ok, label) => { if (!ok) throw new Error(`alignment check failed: ${label}`); checks++; };

const out = read('data/photo-alignment-v1.json');
const buildings = new Map(read('data/manhattan-enu.json').map((b) => [b.bin, b]));
const evidence = read('data/evidence-v1.json');
const catalog = read('data/photo-catalog-v1.json');

check(out.schemaVersion === 'life-itself-photo-alignment/1.0.0', 'schema version');
check(out.method?.name === 'geometry-and-time-v1', 'method named');
check(/Candidates only/.test(out.semantics) && /no visual verification/i.test(out.semantics), 'semantics stay honest');

const expectedPhotos =
  evidence.photos.filter((p) => p.location && p.capturedAt).length +
  catalog.records.filter((r) => r.location && r.capturedAt).length;
check(out.alignments.length === expectedPhotos, `one alignment per dated geotagged photo (${expectedPhotos})`);

for (const a of out.alignments) {
  check(a.status === 'proposed' && a.validatedVisualOverlap === false, `${a.photoId}: stays proposed/unverified`);
  check(Number.isFinite(a.point.x) && Number.isFinite(a.point.z), `${a.photoId}: finite point`);
  check(a.candidates.length >= 1 && a.candidates.length <= 5, `${a.photoId}: 1..5 candidates`);
  const photoYear = Number(a.capturedAt.slice(0, 4));
  for (let i = 0; i < a.candidates.length; i++) {
    const c = a.candidates[i];
    const b = buildings.get(c.bin);
    check(!!b, `${a.photoId}: BIN ${c.bin} exists in the island records`);
    check(c.score > 0 && c.score <= 1, `${a.photoId}: score in (0, 1]`);
    check(c.distanceM <= out.method.maxDistanceM + 0.05, `${a.photoId}: within radius`);
    check(b.yr == null || b.yr <= photoYear, `${a.photoId}: BIN ${c.bin} built ${b.yr} not after the ${photoYear} photo`);
    check(Array.isArray(c.reasons) && c.reasons.length === 3, `${a.photoId}: reasons recorded`);
    if (i) check(a.candidates[i - 1].score >= c.score, `${a.photoId}: candidates sorted by score`);
  }
  if (a.storedPoint) {
    check(Math.abs(a.point.x - a.storedPoint.x) <= 0.01 && Math.abs(a.point.z - a.storedPoint.z) <= 0.01,
      `${a.photoId}: projection reproduces the evidence record's stored ENU`);
  }
}

const ts = out.alignments.find((a) => a.photoId === 'commons-1284794');
check(!!ts && ts.candidates[0].distanceM <= 25, 'Times Square 2005 photo: nearest candidate within 25 m');

// Determinism: rebuild and compare bytes.
const file = join(ROOT, 'data/photo-alignment-v1.json');
const before = createHash('sha256').update(readFileSync(file)).digest('hex');
execFileSync('node', [join(ROOT, 'scripts/build-photo-alignment.mjs')], { stdio: 'pipe' });
const after = createHash('sha256').update(readFileSync(file)).digest('hex');
check(before === after, 'builder is deterministic (byte-identical rebuild)');

const pairs = out.alignments.reduce((n, a) => n + a.candidates.length, 0);
console.log(`PASS: ${out.alignments.length} photographs aligned, ${pairs} proposed candidate pairs; every BIN real, no building from the future, projection cross-checked, deterministic (${checks} checks)`);
