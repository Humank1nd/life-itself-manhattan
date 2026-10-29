// Gate for the SUMO lane graph (Extraction 017, slice 1).
// Structure, coverage pins, exact-transform geodesy vs the anchor
// registry, nearest-lane sanity, and a regression guard that the flat
// 111320 m/deg constant never enters this module.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wgs84ToEnu3, laneShapesToEnu, findNearestLaneEnu, validateSumoNetwork } from '../src/sumo-lanes.js';
const network = JSON.parse(readFileSync(new URL('../data/sumo-network-v1.json', import.meta.url), 'utf8'));
const stats = validateSumoNetwork(network);
assert.equal(stats.edges, 1193);
assert.equal(stats.lanes, 1295);
// Coverage pin: downtown + Midtown-south; Times Square (40.7580) is
// OUTSIDE. If a future net extends coverage, update the doc and this pin.
assert(stats.bbox.north < 40.7580, 'Times Square must stay outside SUMO coverage until re-surveyed');
// Exact transform: all 25 anchors within a micrometer of the registry.
{
  const reg = JSON.parse(readFileSync(new URL('../data/anchors-enu.json', import.meta.url), 'utf8'));
  let maxDelta = 0;
  for (const a of reg.anchors) {
    const [e, u, n] = wgs84ToEnu3(a.lat, a.lon, a.elev - 10);
    const g = { x: e, y: u, z: n };
    const stored = { x: a.x, y: a.y, z: a.z };
    maxDelta = Math.max(maxDelta, Math.abs(g.x - stored.x), Math.abs(g.y - stored.y), Math.abs(g.z - stored.z));
  }
  assert(maxDelta < 1e-6, `anchor drift ${maxDelta}`);
}
// Nearest-lane sanity: Wall St & Broadway on-lane; 42nd & 7th off-coverage.
{
  const lanes = laneShapesToEnu(network);
  const downtown = findNearestLaneEnu(-74.0117, 40.7077, lanes);
  assert(downtown && downtown.distM < 5, 'Wall/Broadway should be on-lane');
  const midtown = findNearestLaneEnu(-73.9900, 40.7550, lanes);
  assert(midtown && midtown.distM > 50, '42nd/7th should be off-coverage');
}
// Regression guard: the flat-earth constant must never enter this module
// as code (comments may cite it). Strip line comments before checking.
{
  const src = readFileSync(new URL('../src/sumo-lanes.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert(!code.includes('111320'), 'flat m/deg constant forbidden here');
}
console.log(`PASS sumo lanes — ${stats.edges} edges, ${stats.lanes} lanes, downtown bbox locked, 25/25 anchors <1µm, nearest-lane sanity, no flat math`);
