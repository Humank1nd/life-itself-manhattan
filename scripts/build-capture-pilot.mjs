// Build data/capture-pilot-v1.json deterministically from the
// authoritative building data. Re-running must produce identical bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCaptureSpec } from '../src/capture-pipeline.js';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildings = JSON.parse(readFileSync(resolve(repo, 'data/manhattan-enu.json'), 'utf8'));
const spec = buildCaptureSpec(buildings);
writeFileSync(resolve(repo, 'data/capture-pilot-v1.json'), JSON.stringify(spec, null, 2) + '\n');
console.log(`capture spec: ${spec.buildings.length} buildings inside ${spec.focus.radiusM} m, ${spec.frames.length} frames planned`);
