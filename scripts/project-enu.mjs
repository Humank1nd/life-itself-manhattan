// Project Manhattan footprints into the Twin Earth runtime frame.
// Contract: life-itself-product-twin-earth-nyc, docs/part-04-earth-reality/
// geospatial-transform-contract.md — WGS84 -> ECEF -> ENU local tangent plane,
// origin Times Square (40.7580 N, 73.9855 W), meters, Y-up (X=East, Z=South
// in the contract's engine frame; three.js is Y-up with -Z as North on screen,
// so we emit x=East, z=-North to keep North pointing away from the camera).
//
// Input:  data/manhattan-footprints.geojson (NYC Open Data, WGS84 polygons)
// Output: data/manhattan-enu.json — [{ bin, h, rings: [[[x,z],...]] }] in meters.

import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = { lat: 40.7580, lon: -73.9855 };
const A = 6378137.0;                 // WGS84 semi-major axis
const F = 1 / 298.257223563;         // WGS84 flattening
const E2 = F * (2 - F);
const D2R = Math.PI / 180;
const FEET_TO_METERS = 0.3048;

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

const [ox, oy, oz] = ecef(ORIGIN.lat, ORIGIN.lon, 0);
const lat0 = ORIGIN.lat * D2R, lon0 = ORIGIN.lon * D2R;
const sLat = Math.sin(lat0), cLat = Math.cos(lat0), sLon = Math.sin(lon0), cLon = Math.cos(lon0);

// ECEF delta -> ENU meters (East, North, Up)
function enu(latDeg, lonDeg) {
  const [x, y, z] = ecef(latDeg, lonDeg, 0);
  const dx = x - ox, dy = y - oy, dz = z - oz;
  const east = -sLon * dx + cLon * dy;
  const north = -sLat * cLon * dx - sLat * sLon * dy + cLat * dz;
  return [east, north];
}

const src = JSON.parse(await readFile('data/manhattan-footprints.geojson', 'utf8'));
const out = [];
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const f of src.features) {
  const geom = f.geometry;
  if (!geom) continue;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const rings = [];
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;
    const ring = outer.map(([lon, lat]) => {
      const [e, n] = enu(lat, lon);
      const x = Math.round(e * 10) / 10;
      const z = Math.round(-n * 10) / 10; // three.js: -Z is North
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      return [x, z];
    });
    rings.push(ring);
  }
  if (!rings.length) continue;
  const feet = parseFloat(f.properties && f.properties.height_roof);
  const yr = parseInt(f.properties && f.properties.construction_year, 10);
  out.push({
    bin: f.properties && f.properties.bin,
    h: Number.isFinite(feet) && feet > 0 ? Math.round(feet * FEET_TO_METERS * 10) / 10 : 10,
    yr: Number.isFinite(yr) && yr > 1600 ? yr : null,
    rings,
  });
}
await writeFile('data/manhattan-enu.json', JSON.stringify(out));
console.log(`buildings: ${out.length}`);
console.log(`ENU extent: X (East) ${minX} .. ${maxX} m  (${((maxX - minX) / 1000).toFixed(1)} km wide)`);
console.log(`            Z (South) ${minZ} .. ${maxZ} m  (${((maxZ - minZ) / 1000).toFixed(1)} km long)`);
