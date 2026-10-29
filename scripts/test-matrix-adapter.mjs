// Gate for the Matrix-Game adapter plan (Phase 016, S016-03b): the
// committed plan must validate against the committed envelope, rebuild
// byte-identically, and reject every overclaim — including an asserted
// scene checkpoint, depth frames as video input, and any execute path.
// The ffmpeg assembly path is exercised with synthetic frames only;
// real RGB bytes never enter the repo. No model, no weights, no inference.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildMatrixPlan, validateMatrixPlan, MATRIX_SCENES } from '../src/matrix-adapter.js';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const envelope = read('../data/conditioning-envelope-v1.json');
const plan = read('../data/matrix-invocation-plan-v1.json');
const stats = validateMatrixPlan(plan, { envelope });
// Deterministic rebuild.
const rebuilt = buildMatrixPlan({ envelope });
assert.equal(JSON.stringify(rebuilt, null, 2) + '\n',
  readFileSync(new URL('../data/matrix-invocation-plan-v1.json', import.meta.url), 'utf8'),
  'plan rebuild drift');
assert.deepEqual(plan.scene.allowed, MATRIX_SCENES);
// ffmpeg path with synthetic frames (proves the SHA gate fails closed on
// non-verified bytes; real capture bytes are CI-only and never committed).
// Do not claim the synthetic-byte rejection ran if FFmpeg is unavailable.
execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
{
  const dir = mkdtempSync(join(tmpdir(), 'matrix-test-frames-'));
  for (const f of plan.video.inputFrameFiles) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=0x1a2b3c:s=640x360:d=1:r=8',
      '-frames:v', '1', join(dir, f)]);
  }
  const out = join(dir, 'adapter-test.mp4');
  assert.throws(() => execFileSync('node', ['scripts/assemble-matrix-video.mjs', dir,
    new URL('../data/matrix-invocation-plan-v1.json', import.meta.url).pathname, out],
    { stdio: 'pipe' }), /hash drift/);
}
const clone = () => JSON.parse(JSON.stringify(plan));
for (const mutate of [
  (p) => { p.scene.checkpoint = 'racing'; },            // unapproved scene assertion
  (p) => { p.scene.sink = 'supplied-sink-as-frame-zero-future-rope'; }, // sink without approval
  (p) => { p.model.provider = 'matrix-game'; },          // provider claim
  (p) => { p.model.weightsDownloaded = true; },          // weights claim
  (p) => { p.model.inferenceExecuted = true; },          // inference overclaim
  (p) => { p.execute = { now: true }; },                 // execute path smuggled in
  (p) => { p.prompt.text = 'Times Square flythrough'; }, // unreviewed prompt as approved
  (p) => { p.rights.training = 'authorized'; },          // training flip
  (p) => { p.rights.historicalClaim = 'verified-2005'; }, // historical overclaim
  (p) => { p.video.width = 512; },                       // raster drift from 864x480 contract
  (p) => { p.basedOn.frameShas[0] = '0'.repeat(64); },    // frame hash drift
  (p) => { p.basedOn.manifestSha256 = '0'.repeat(64); }, // stale manifest
]) {
  const bad = clone(); mutate(bad);
  assert.throws(() => validateMatrixPlan(bad, { envelope }));
}
console.log(`PASS matrix adapter — ${stats.inputFrames} RGB frames -> ${stats.outputFrames} @ plan fps, synthetic-byte rejection, deterministic rebuild, 12 overclaim guards`);
