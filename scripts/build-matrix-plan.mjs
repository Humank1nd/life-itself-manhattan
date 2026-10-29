// Build data/matrix-invocation-plan-v1.json deterministically from the
// committed conditioning envelope. Metadata only: frame hashes, video
// spec, unselected scene. No weights, no inference, no pixels.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatrixPlan } from '../src/matrix-adapter.js';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envelope = JSON.parse(readFileSync(resolve(repo, 'data/conditioning-envelope-v1.json'), 'utf8'));
const plan = buildMatrixPlan({ envelope });
writeFileSync(resolve(repo, 'data/matrix-invocation-plan-v1.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(`matrix plan: ${plan.video.inputFrames} RGB frames -> ${plan.video.outputFrames} @ ${plan.video.fps}fps ${plan.video.width}x${plan.video.height}, scene ${plan.scene.checkpoint}`);
