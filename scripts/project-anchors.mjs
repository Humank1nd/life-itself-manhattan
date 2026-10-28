// Extraction 003 fixture generator: project Twin Earth NYC's canonical
// anchor registry (twin-earth-nyc, data/anchors.json) into the ENU frame,
// producing the golden vectors the Rust core's geodesy must reproduce.
// The math is project-enu.mjs's verified transform (WGS84 -> ECEF -> ENU,
// constants matched against the quarry's cesium_bridge.py in Extraction
// 001), extended with the rotation's Up row; the origin carries the
// registry's own elevation (Times Square center, elev 10.0 m, EGM96).
//
// Input:  core/tests/fixtures/anchors.json (verbatim copy of the registry)
// Output: core/tests/fixtures/anchors-enu.json — [{ id, east, north, up }]

import { readFile, writeFile } from 'node:fs/promises';

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const D2R = Math.PI / 180;

function ecef(latDeg, lonDeg, h = 0) {
  const lat = latDeg * D2R, lon = lonDeg * D2R;
  const sinLat = Math.sin(lat);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  return [
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - E2) + h) * sinLat,
  ];
}

const registry = JSON.parse(await readFile('core/tests/fixtures/anchors.json', 'utf8'));
const o = registry.metadata.origin;
const [ox, oy, oz] = ecef(o.lat, o.lon, o.elev);
const lat0 = o.lat * D2R, lon0 = o.lon * D2R;
const sLat = Math.sin(lat0), cLat = Math.cos(lat0), sLon = Math.sin(lon0), cLon = Math.cos(lon0);

const out = registry.anchors.map((a) => {
  const [x, y, z] = ecef(a.lat, a.lon, a.elev);
  const dx = x - ox, dy = y - oy, dz = z - oz;
  return {
    id: a.id,
    east: -sLon * dx + cLon * dy,
    north: -sLat * cLon * dx - sLat * sLon * dy + cLat * dz,
    up: cLat * cLon * dx + cLat * sLon * dy + sLat * dz,
  };
});

await writeFile('core/tests/fixtures/anchors-enu.json', JSON.stringify(out, null, 1) + '\n');
console.log(`projected ${out.length} geo anchors; first:`, out[0]);
