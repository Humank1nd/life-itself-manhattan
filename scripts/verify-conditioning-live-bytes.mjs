#!/usr/bin/env node
// Phase 016 live-byte complement (S016-02): hosted-only verification that
// the FRESH cloud capture bytes match their manifest and the committed
// conditioning envelope. Runs in the same workflow after the capture job
// renders into runner.temp. Throws anywhere else — there are no live
// bytes on a laptop, and guessing is not verification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join, sep, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

assert(process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_TEMP,
  'Cloud-only gate: GitHub-hosted runner required');
assert(process.env.RUNNER_ENVIRONMENT === 'github-hosted',
  'Cloud-only gate: github-hosted environment required');
const OUT = process.env.CAPTURE_OUT;
assert(typeof OUT === 'string' && isAbsolute(OUT) &&
  OUT.startsWith(resolve(process.env.RUNNER_TEMP) + sep),
  'All generated artifacts must remain in ephemeral runner.temp');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const repo = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const readRepo = (p) => readFileSync(join(repo, p));
const fresh = (name) => readFileSync(join(OUT, basename(name)));

const manifest = JSON.parse(fresh('manifest.json').toString('utf8'));
const versions = JSON.parse(readRepo('data/times-square-building-versions-v1.json').toString('utf8'));
const committedManifest = JSON.parse(readRepo('data/cloud-capture-manifest-40799078997.json').toString('utf8'));
const envelope = JSON.parse(readRepo('data/conditioning-envelope-v1.json').toString('utf8'));

// 1. Live bytes: 9/9 frame hashes verify against the fresh manifest.
let verified = 0;
for (const c of manifest.captures) {
  assert(!c.filename.includes('..') && basename(c.filename) === c.filename, 'frame path traversal: ' + c.filename);
  const bytes = fresh(c.filename);
  assert(bytes.length > 0, 'empty frame: ' + c.filename);
  assert.equal(sha256(bytes), c.sha256, 'frame content/hash mismatch: ' + c.filename);
  verified++;
}
assert.equal(verified, 9, 'frame count');

// 2. Fresh manifest determinism: same main, same bytes of evidence.
assert.deepEqual(manifest.captures, committedManifest.captures, 'fresh captures differ from committed manifest');
assert.deepEqual(manifest.identity, committedManifest.identity, 'fresh identity map differs');
assert.deepEqual(manifest.observedVisibleBuildingIds, committedManifest.observedVisibleBuildingIds, 'visible IDs differ');

// 3. Exact version-identity equality with authoritative source records.
const byBin = new Map(versions.versions.map((v) => [v.bin, v]));
for (const [key, entry] of Object.entries(manifest.identity)) {
  const source = byBin.get(entry.bin);
  assert(source, 'identity BIN without source record: ' + key);
  assert.equal(entry.versionId, source.id, 'versionId mismatch for BIN ' + entry.bin);
}
assert.equal(Object.keys(manifest.identity).length, 622, 'identity count');

// 4. Committed envelope agrees with the fresh capture.
for (const [pass, block] of Object.entries(envelope.passes)) {
  const manifestPass = pass === 'buildingId' ? 'building-id' : pass;
  for (const f of block.files) {
    const live = manifest.captures.find((c) => c.filename === f.file && c.pass === manifestPass);
    assert(live && live.sha256 === f.sha256, 'envelope frame not in fresh capture: ' + f.file);
  }
}
for (const id of envelope.identities.visibleIds) assert(manifest.identity[String(id)], 'envelope visible ID not fresh: ' + id);

// 5. Provenance rails on the fresh manifest (fail closed).
const checkFresh = (m) => {
  assert(m.snapshotAt === '2026-10-28', 'snapshot year');
  assert(m.geometryStatus === 'current-snapshot-only', 'geometry status');
  assert(m.outputsAreHistoricalGroundTruth !== true, 'historical ground truth overclaim');
  assert(m.trainingUseAuthorization === 'not-established', 'training authorization rails');
  assert(m.trainingDataApproved === false, 'training approval rails');
  assert(Array.isArray(m.modelsExecuted) && m.modelsExecuted.length === 0, 'models executed');
  assert(m.capture.width === 640 && m.capture.height === 360 && m.capture.fovDeg === 62, 'raster/intrinsics');
  assert(m.capture.depthEncoding !== '8bit-grayscale-distance', 'pilot depth encoding in cloud manifest');
  for (const c of m.cameras) {
    assert(c.poseStatus === 'synthetic-demo-camera-not-photographic-pose', 'pose overclaim');
    assert(c.positionM[1] > 50, 'camera pose moved to ground level');
  }
};
checkFresh(manifest);

// 6. Adversarial mutations, each must fail.
const clone = () => JSON.parse(JSON.stringify(manifest));
const bad = (fn, re) => { const m = clone(); fn(m); assert.throws(() => checkFresh(m), re); };
bad((m) => { m.snapshotAt = '2005-12-08'; }, /snapshot year/);
bad((m) => { m.geometryStatus = 'verified-2005'; }, /geometry status/);
bad((m) => { m.outputsAreHistoricalGroundTruth = true; }, /historical/);
bad((m) => { m.trainingUseAuthorization = 'authorized'; }, /training/);
bad((m) => { m.trainingDataApproved = true; }, /training/);
bad((m) => { m.modelsExecuted.push('matrix-game'); }, /models executed/);
bad((m) => { m.capture.width = 512; }, /raster/);
bad((m) => { m.capture.depthEncoding = '8bit-grayscale-distance'; }, /pilot depth/);
bad((m) => { m.cameras[0].positionM = [-5, 1.68, 0]; }, /ground level/);
bad((m) => { m.cameras[0].poseStatus = 'calibrated-2005-photo'; }, /pose overclaim/);
// Bit-flipped PNG bytes must mismatch.
{
  const first = manifest.captures[0];
  const altered = Buffer.from(fresh(first.filename));
  altered[altered.length - 1] ^= 1;
  assert.notEqual(sha256(altered), first.sha256, 'bit flip must break the hash');
}
// Committed envelope carries no pixels or provider secrets.
{
  const text = JSON.stringify(envelope);
  assert(!text.includes('init_image_hex') && !text.includes('base64') && !text.includes('data:image'), 'pixel/provider leak');
}
console.log(`PASS live-byte complement — ${verified}/9 fresh frame hashes, exact 622-entity identity equality, envelope agrees, 10 adversarial + 1 bit-flip + 1 leak guard`);
