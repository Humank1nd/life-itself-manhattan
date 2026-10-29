// Build data/conditioning-envelope-v1.json deterministically from the
// verified cloud capture manifest and the authoritative source specs.
// Metadata only: frame hashes and identity crosswalks, never pixels.
// Re-running must produce identical bytes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConditioningEnvelope } from '../src/conditioning-envelope.js';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(repo, 'data/cloud-capture-manifest-40799078997.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
const pilotSpec = JSON.parse(readFileSync(resolve(repo, 'data/capture-pilot-v1.json'), 'utf8'));
const buildingVersions = JSON.parse(readFileSync(resolve(repo, 'data/times-square-building-versions-v1.json'), 'utf8'));
const env = buildConditioningEnvelope({ manifest, manifestSha256, pilotSpec, buildingVersions });
writeFileSync(resolve(repo, 'data/conditioning-envelope-v1.json'), JSON.stringify(env, null, 2) + '\n');
console.log(`conditioning envelope: ${env.identities.count} identities, ${env.identities.visibleIds.length} visible, manifest ${manifestSha256.slice(0, 12)}…`);
