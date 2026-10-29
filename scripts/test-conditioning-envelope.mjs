// Gate for the provider-neutral conditioning envelope (Phase 016,
// S016-01/02): the committed envelope must validate against the verified
// cloud manifest and source specs, rebuild byte-identically, and reject
// every drift mutation — including cross-contract depth confusion and
// pixel-space overclaims. No model, no weights, no inference.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  buildConditioningEnvelope, validateEnvelope,
  decodeDepthFrame, assertSameDepthContract,
  CLOUD_CONTRACT, PILOT_CONTRACT,
} from '../src/conditioning-envelope.js';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const manifestBytes = readFileSync(new URL('../data/cloud-capture-manifest-40799078997.json', import.meta.url));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
const pilotSpec = read('../data/capture-pilot-v1.json');
const buildingVersions = read('../data/times-square-building-versions-v1.json');
const env = read('../data/conditioning-envelope-v1.json');
const stats = validateEnvelope(env, { manifest, manifestSha256, buildingVersions });
// Deterministic rebuild: the envelope on disk is exactly what the builder
// produces from the manifest and sources today.
const rebuilt = buildConditioningEnvelope({ manifest, manifestSha256, pilotSpec, buildingVersions });
assert.equal(JSON.stringify(rebuilt, null, 2) + '\n',
  readFileSync(new URL('../data/conditioning-envelope-v1.json', import.meta.url), 'utf8'),
  'envelope rebuild drift');
// Depth contracts are pinned: same-contract decode works, cross-contract
// numeric comparison without an audited conversion fails closed.
assert.equal(decodeDepthFrame({ contract: CLOUD_CONTRACT, bytes: new Uint8Array([1, 2, 3]) }).semantic, 'linear-camera-Z-meters');
assert.equal(decodeDepthFrame({ contract: PILOT_CONTRACT, bytes: new Uint8Array([9]) }).semantic, 'inverted-grayscale-distance-UNAUDITED');
assert.throws(() => assertSameDepthContract(CLOUD_CONTRACT, PILOT_CONTRACT), /cross-contract/);
assert.throws(() => decodeDepthFrame({ contract: 'life-itself-capture/9.9.9', bytes: new Uint8Array([1]) }), /unknown depth contract/);
const clone = () => JSON.parse(JSON.stringify(env));
for (const mutate of [
  (e) => { e.rights.training = 'authorized'; },                              // training gate flip
  (e) => { e.historicalClaim = 'verified-2005'; },                            // historical overclaim
  (e) => { e.geometryStatus = 'reconstructed-2005'; },                        // geometry overclaim
  (e) => { e.sourceManifest.manifestSha256 = '0'.repeat(64); },               // stale manifest SHA
  (e) => { e.passes.depth.encoding = 'gray8-inverted-distance'; },            // cross-contract depth relabel
  (e) => { e.compatibility.sharedPixelSpace = true; },                        // pixel-space overclaim
  (e) => { e.compatibility.sharedCameraPath = true; },                        // shared-path overclaim
  (e) => { e.camera.poseStatus = 'calibrated-photographic'; },                // pose overclaim
  (e) => { e.passes.rgb.files[0].sha256 = 'f'.repeat(64); },                  // frame hash drift
  (e) => { e.identities.visibleIds.push(999999); },                           // visible ID without source BIN
  (e) => { e.model.provider = 'matrix-game'; },                               // unexecuted provider claim
  (e) => { e.model.inferenceExecuted = true; },                               // inference overclaim
]) {
  const bad = clone(); mutate(bad);
  assert.throws(() => validateEnvelope(bad, { manifest, manifestSha256, buildingVersions }));
}
console.log(`PASS: conditioning envelope — ${stats.identities} identities, ${stats.visible} visible, ${stats.frames} frames hashed, deterministic rebuild, 12 drift + 4 depth-contract guards`);
