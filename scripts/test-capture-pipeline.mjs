// Gate for the renderer-neutral capture pipeline: the committed spec
// must validate against the authoritative geometry, rebuild byte-
// identically, share its camera path with the conditioning packet,
// and reject every drift mutation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCaptureSpec, validateCaptureSpec, CAPTURE_WAYPOINTS_ENU } from '../src/capture-pipeline.js';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const spec = read('../data/capture-pilot-v1.json');
const buildings = read('../data/manhattan-enu.json');
const byBin = new Map(buildings.map((b) => [b.bin, b]));
const stats = validateCaptureSpec(spec, byBin);
// Deterministic rebuild: the spec on disk is exactly what the builder
// produces from the authoritative data today.
const rebuilt = buildCaptureSpec(buildings);
assert.equal(JSON.stringify(rebuilt, null, 2) + '\n',
  readFileSync(new URL('../data/capture-pilot-v1.json', import.meta.url), 'utf8'),
  'spec rebuild drift');
// One path, two pilots: the capture waypoints in UE cm must equal the
// conditioning packet's provider waypoints exactly.
const packet = read('../data/lingbot-conditioning-pilot-v1.json');
assert.deepEqual(spec.camera.waypointsUE, packet.camera.providerWaypointsCm);
assert.deepEqual(spec.camera.waypointsEnu, CAPTURE_WAYPOINTS_ENU);
const clone = () => JSON.parse(JSON.stringify(spec));
for (const mutate of [
  (s) => { s.buildings[1].color = s.buildings[0].color; },              // duplicate segmentation color
  (s) => { s.buildings[0].bin = '9999999'; },                           // invented building
  (s) => { s.policy.modelTraining = 'authorized'; },                    // training gate flip
  (s) => { s.geometry.historicalClaim = 'verified-2005'; },             // historical overclaim
  (s) => { s.camera.waypointsEnu[0][0] += 1; },                         // path drift
  (s) => { s.image.passes = ['rgb', 'depth', 'vendor-locked']; },       // renderer neutrality break
  (s) => { s.buildings[0].heightM += 10; },                             // geometry drift
  (s) => { s.status = 'captured-and-verified'; }                        // status overclaim
]) {
  const bad = clone(); mutate(bad);
  assert.throws(() => validateCaptureSpec(bad, byBin));
}
console.log(`PASS: renderer-neutral capture spec — ${stats.buildings} current buildings, ${stats.frames} frames (rgb/depth/segmentation x ${CAPTURE_WAYPOINTS_ENU.length} waypoints), one shared path with the conditioning packet, deterministic rebuild, 8 drift mutations rejected`);

// Recorded browser runs (data/capture-run-*-manifest.json): metadata-only
// evidence. When present, frame IDs and ENU poses must exactly equal the
// spec's; pixels never enter the repo and are not checked here.
import { existsSync } from 'node:fs';
const runPath = new URL('../data/capture-run-browser-001-manifest.json', import.meta.url);
if (existsSync(runPath)) {
  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  assert.equal(run.schemaVersion, 'life-itself-capture-run/1.0.0', 'run schema');
  assert.deepEqual(run.frames.map((f) => f.id), spec.frames.map((f) => f.id), 'run frame IDs');
  assert.deepEqual(run.frames.map((f) => f.poseEnu), spec.frames.map((f) => f.poseEnu), 'run poses');
  assert.equal(run.legend.length, spec.buildings.length, 'run legend size');
  console.log(`PASS: recorded browser run browser-001 — ${run.frames.length} frames, poses and legend match spec`);
} else {
  console.log('NOTE: no recorded browser run present (data/capture-run-browser-001-manifest.json absent)');
}
