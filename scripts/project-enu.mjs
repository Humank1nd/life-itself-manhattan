// Project Manhattan footprints into the Twin Earth runtime frame.
// Contract: life-itself-product-twin-earth-nyc, docs/part-04-earth-reality/
// geospatial-transform-contract.md — WGS84 -> ECEF -> ENU local tangent plane,
// origin Times Square (40.7580 N, 73.9855 W), meters, Y-up (X=East, Z=South
// in the contract's engine frame; three.js is Y-up with -Z as North on screen,
// so we emit x=East, z=-North to keep North pointing away from the camera).
//
// Input:  data/manhattan-footprints.geojson (NYC Open Data, WGS84 polygons)
//         data/manhattan-ntas.geojson (2020 Neighborhood Tabulation Areas)
// Output: data/manhattan-enu.json — [{ bin, h, yr, nb, rings: [[[x,z],...]] }]
//         in meters; nb is the building's NTA neighborhood name (point-in-
//         polygon on the footprint centroid), so "in the East Village" is a
//         fact from real boundaries, not a guess.

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

// --- Neighborhood assignment (lon/lat point-in-polygon against real NTAs) ---
const ntaSrc = JSON.parse(await readFile('data/manhattan-ntas.geojson', 'utf8'));
const ntas = ntaSrc.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
  for (const poly of polys) for (const [lon, lat] of poly[0]) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { name: String(f.properties.ntaname || '').trim(), polys, bbox: [minLon, minLat, maxLon, maxLat] };
});
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function neighborhoodOf(lon, lat) {
  for (const nta of ntas) {
    const [a, b, c, d] = nta.bbox;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    for (const poly of nta.polys) {
      if (!inRing(lon, lat, poly[0])) continue;
      let inHole = false;
      for (let k = 1; k < poly.length; k++) if (inRing(lon, lat, poly[k])) { inHole = true; break; }
      if (!inHole) return nta.name;
    }
  }
  return null;
}

const src = JSON.parse(await readFile('data/manhattan-footprints.geojson', 'utf8'));
const out = [];
let noNb = 0;
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
  const firstOuter = (polys[0] && polys[0][0]) || [];
  let cLon = 0, cLat = 0;
  for (const [lon, lat] of firstOuter) { cLon += lon; cLat += lat; }
  const nb = firstOuter.length ? neighborhoodOf(cLon / firstOuter.length, cLat / firstOuter.length) : null;
  if (!nb) noNb++;
  const feet = parseFloat(f.properties && f.properties.height_roof);
  const yr = parseInt(f.properties && f.properties.construction_year, 10);
  out.push({
    bin: f.properties && f.properties.bin,
    h: Number.isFinite(feet) && feet > 0 ? Math.round(feet * FEET_TO_METERS * 10) / 10 : 10,
    yr: Number.isFinite(yr) && yr > 1600 ? yr : null,
    nb,
    rings,
  });
}
await writeFile('data/manhattan-enu.json', JSON.stringify(out));
console.log(`buildings: ${out.length} | without a neighborhood: ${noNb}`);
console.log(`ENU extent: X (East) ${minX} .. ${maxX} m  (${((maxX - minX) / 1000).toFixed(1)} km wide)`);
console.log(`            Z (South) ${minZ} .. ${maxZ} m  (${((maxZ - minZ) / 1000).toFixed(1)} km long)`);
