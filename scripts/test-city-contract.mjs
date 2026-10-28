import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifestShape } from './validate-city-scene.mjs';
const source = JSON.parse(readFileSync(new URL('../data/city-scene-v1.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(source));
assert.equal(validateManifestShape(source), true);
for (const change of [
  (m) => m.schemaVersion = 'other',
  (m) => m.frame.axes.z = 'north',
  (m) => m.frame.origin.lon += 0.1,
  (m) => m.layers.buildings.uri = '../../secret.json',
  (m) => m.layers.evidence.uri = '../secret.json',
  (m) => m.layers.photoCatalog.uri = '../secret.json',
  (m) => m.layers.photoLinks.kind = 'verified-visual-match',
  (m) => m.layers.photoAlignment.kind = 'verified-visual-match',
  (m) => m.layers.facadeInstances.kind='verified-individual-buildings',
  (m) => m.layers.buildingVersions.uri='../../secret.json',
  (m) => m.layers.facadeMatches.kind='always-approved',
  (m) => m.layers.facadeCorroboration.uri='../fake.json',
  (m) => m.assets.push({id:'epic',uri:'assets/citysample.glb',format:'glb',rights:'unreal-only',source:'City Sample'}),
  (m) => m.assets.push({id:'unknown',uri:'assets/unknown.glb',format:'glb',rights:'licensed-for-web',source:''}),
]) {
  const bad = clone(); change(bad);
  assert.throws(() => validateManifestShape(bad));
}
console.log('PASS: manifest accepts canon and rejects 12 unsafe/drifted variants');
