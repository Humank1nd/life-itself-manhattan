// City Scene v1 boundary validator. No external packages.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvidenceGraph } from '../src/evidence-graph.js';
import { validateCatalog } from '../src/photo-catalog.js';
import {validateBuildingVersions,validateFacadeInstances,validateFacadeMatches,validateCorroboration} from '../src/facade-matching.js';
import {validateSpatialMemory} from '../src/spatial-memory.js';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = (x, message) => assert.ok(x, message);
function dataFile(uri) {
  assert.match(uri, /^data\/[a-z0-9-]+\.json$/);
  const path = resolve(repo, uri);
  check(path.startsWith(resolve(repo, 'data') + '/'), 'out-of-tree data');
  check(existsSync(path), 'missing dataset: ' + uri);
  return path;
}
const readData = (uri) => JSON.parse(readFileSync(dataFile(uri), 'utf8'));
const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
function checkRing(ring) {
  check(Array.isArray(ring) && ring.length >= 3 && ring.every(point), 'invalid footprint or polygon ring');
}
export function validateManifestShape(m) {
  check(m?.schemaVersion === 'life-itself-city-scene/1.0.0', 'version mismatch');
  check(m.worldId === 'life-itself:manhattan', 'world mismatch');
  check(m.frame?.crs === 'WGS84' && m.frame.units === 'meters', 'coordinate reference mismatch');
  check(m.frame.axes.x === 'east' && m.frame.axes.y === 'up' && m.frame.axes.z === '-north', 'axis mismatch');
  check(m.frame.origin.lat === 40.758 && m.frame.origin.lon === -73.9855 && m.frame.origin.elev === 10, 'Twin Earth origin mismatch');
  for (const name of ['buildings', 'streets', 'anchors', 'neighborhoods']) {
    const layer = m.layers?.[name];
    check(layer && typeof layer.uri === 'string', 'missing layer: ' + name);
    check(Number.isSafeInteger(layer.count) && layer.count > 0, 'bad count: ' + name);
    check(typeof layer.source === 'string' && !!layer.source, 'missing provenance: ' + name);
    dataFile(layer.uri);
  }
  if (m.layers.evidence) {
    check(m.layers.evidence.kind === 'time-indexed-photo-and-business-records', 'evidence layer contract mismatch');
    check(typeof m.layers.evidence.source === 'string' && !!m.layers.evidence.source, 'evidence source missing');
    dataFile(m.layers.evidence.uri);
  }
  if (m.layers.photoCatalog) {
    check(m.layers.photoCatalog.uri === 'data/photo-catalog-v1.json' &&
      m.layers.photoCatalog.kind === 'licensed-metadata-discovery-only', 'photo catalog contract mismatch');
    check(typeof m.layers.photoCatalog.source==='string'&&!!m.layers.photoCatalog.source, 'photo catalog source missing');
    dataFile(m.layers.photoCatalog.uri);
  }
  if(m.layers.photoLinks) {
    check(m.layers.photoLinks.uri==='data/photo-links-v1.json' &&
      m.layers.photoLinks.kind==='unreviewed-spatial-temporal-neighbor-candidates', 'photo links contract mismatch');
    check(typeof m.layers.photoLinks.source==='string'&&!!m.layers.photoLinks.source, 'photo links source missing');
    dataFile(m.layers.photoLinks.uri);
  }
  for(const [key,uri,kind] of [
    ['buildingVersions','data/times-square-building-versions-v1.json','bounded-temporal-building-versions'],
    ['facadeInstances','data/facade-instances-v1.json','unreviewed-panoptic-facade-region-candidates'],
    ['facadeMatches','data/facade-matches-v1.json','conservative-auto-accept-or-abstain'],
    ['facadeCorroboration','data/facade-corroboration-v1.json','independently-evidenced-alignment-observations']]) {
    check(m.layers[key]?.uri===uri && m.layers[key]?.kind===kind,'facade layer contract '+key);
    check(typeof m.layers[key]?.source==='string'&&!!m.layers[key]?.source,'facade provenance missing '+key);
    dataFile(uri);
  }
  check(m.layers.spatialMemory?.uri==='data/spatial-memory-v1.json'&&
    m.layers.spatialMemory?.kind==='source-grounded-plane-and-photo-retrieval'&&
    typeof m.layers.spatialMemory?.source==='string'&&!!m.layers.spatialMemory.source,
    'spatial memory contract mismatch');
  dataFile(m.layers.spatialMemory.uri);
  check(Array.isArray(m.assets), 'assets must be listed');
  for (const a of m.assets) {
    check(['original','public-domain','licensed-for-web'].includes(a.rights), 'asset rights not approved');
    check(['glb','gltf','ktx2'].includes(a.format), 'bad asset format');
    check(typeof a.source === 'string' && !!a.source, 'missing asset source');
    check(/^assets\/[a-z0-9/_-]+\.(glb|gltf|ktx2)$/i.test(a.uri), 'asset URI invalid');
  }
  check(m.simulation?.tickMs === 5000 && Number.isSafeInteger(m.simulation.seed), 'tick contract mismatch');
  check(m.simulation.module === 'src/living-city.js' && m.simulation.journal === 'src/core-journal.js', 'runtime contract mismatch');
  check(Array.isArray(m.provenance?.previous) && m.provenance.previous.length, 'missing source list');
  return true;
}
export function validateCityScene(m) {
  validateManifestShape(m);
  const buildings = readData(m.layers.buildings.uri);
  check(buildings.length === m.layers.buildings.count, 'building count mismatch');
  const ids = new Set();
  for (const b of buildings) {
    check(/^\d{7}$/.test(b.bin) && !ids.has(b.bin), 'duplicate/invalid building id');
    ids.add(b.bin);
    check(Number.isFinite(b.h) && b.h > 0, 'invalid height');
    check(b.yr == null || (Number.isInteger(b.yr) && b.yr >= 1600 && b.yr <= 2100), 'invalid year');
    check(Array.isArray(b.rings) && b.rings.length, 'missing building rings');
    for (const r of b.rings) checkRing(r);
  }
  const streets = readData(m.layers.streets.uri);
  check(Object.keys(streets).length === m.layers.streets.count, 'street count mismatch');
  for (const v of Object.values(streets)) check(v.length >= 2 && v.every(point), 'invalid street polyline');
  const anchors = readData(m.layers.anchors.uri);
  check(anchors.anchors.length === m.layers.anchors.count, 'anchor count mismatch');
  check(anchors.origin.lat === m.frame.origin.lat && anchors.origin.lon === m.frame.origin.lon && anchors.origin.elev === m.frame.origin.elev, 'anchor origin drift');
  for (const a of anchors.anchors) check([a.x, a.y, a.z, a.lat, a.lon, a.elev, a.tolerance_m].every(Number.isFinite), 'invalid anchor');
  if (m.layers.evidence) {
    validateEvidenceGraph(readData(m.layers.evidence.uri), anchors.anchors, ids);
  }
  if(m.layers.photoCatalog) validateCatalog(readData(m.layers.photoCatalog.uri));
  const versions=readData(m.layers.buildingVersions.uri);
  const instances=readData(m.layers.facadeInstances.uri);
  const alignments=readData(m.layers.facadeMatches.uri);
  validateBuildingVersions(versions);
  validateFacadeInstances(instances,new Set(readData(m.layers.evidence.uri).photos.map(p=>p.id)));
  validateFacadeMatches(alignments,instances,versions,new Set(readData(m.layers.evidence.uri).photos.map(p=>p.id)));
  validateSpatialMemory(readData(m.layers.spatialMemory.uri));
  validateCorroboration(readData(m.layers.facadeCorroboration.uri),
    new Set(readData(m.layers.evidence.uri).photos.map(p=>p.id)),
    new Set(instances.instances.map(x=>x.id)),new Set(versions.versions.map(x=>x.id)));
  const ntas = readData(m.layers.neighborhoods.uri);
  check(ntas.length === m.layers.neighborhoods.count, 'NTA count mismatch');
  for (const n of ntas) for (const r of n.rings) checkRing(r);
  return { buildings: ids.size, streets: Object.keys(streets).length, anchors: anchors.anchors.length, neighborhoods: ntas.length, assets: m.assets.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(resolve(repo, 'data/city-scene-v1.json'), 'utf8'));
  console.log('PASS: City Scene v1 ' + JSON.stringify(validateCityScene(manifest)));
}
