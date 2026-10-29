// Life Itself Manhattan — SUMO lane graph (Extraction 017, slice 1).
// Ports gods-eye-view src/life/sumoNetwork.js lane topology + nearest-lane
// search, with one deliberate fix: GEV measures in flat 111320 m/deg
// (12.04 m off at Times Square — see docs/connections-map.md §4). Here
// every metre runs through the verified WGS84 → ECEF → ENU transform
// (x=east, y=up, z=-north, Times Square origin), the same math as
// src/streets.js and the Rust core. No imports; runs in Node and the
// browser unchanged. Coverage is downtown + Midtown-south ONLY
// (lat ≤ 40.7546 — Times Square is outside; the gate pins this).
const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const D2R = Math.PI / 180;
const ORIGIN = { lat: 40.7580, lon: -73.9855, elev: 10 };
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
const [ox, oy, oz] = ecef(ORIGIN.lat, ORIGIN.lon, ORIGIN.elev);
const lat0 = ORIGIN.lat * D2R, lon0 = ORIGIN.lon * D2R;
const sLat = Math.sin(lat0), cLat = Math.cos(lat0), sLon = Math.sin(lon0), cLon = Math.cos(lon0);
export function wgs84ToEnu3(latDeg, lonDeg, elevM = 0) {
  const [x, y, z] = ecef(latDeg, lonDeg, ORIGIN.elev + elevM);
  const dx = x - ox, dy = y - oy, dz = z - oz;
  const east = -sLon * dx + cLon * dy;
  const north = -sLat * cLon * dx - sLat * sLon * dy + cLat * dz;
  const up = cLat * cLon * dx + cLat * sLon * dy + sLat * dz;
  return [east, up, -north];
}
export function laneShapesToEnu(network) {
  const out = [];
  for (const edge of network.edges) {
    for (const lane of edge.lanes) {
      if (!lane.shape || lane.shape.length < 2) continue;
      out.push({
        edgeId: edge.id, laneId: lane.id, name: edge.name || '',
        speedMps: lane.speed || 11.11,
        points: lane.shape.map(([lon, lat, h]) => wgs84ToEnu3(lat, lon, (Number.isFinite(h) ? h : -22.26) - ORIGIN.elev)),
      });
    }
  }
  return out;
}
export function findNearestLaneEnu(lon, lat, lanes) {
  const [px, , pz] = wgs84ToEnu3(lat, lon, 0);
  let best = null;
  for (const lane of lanes) {
    const pts = lane.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, , z1] = pts[i], [x2, , z2] = pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, lenSq = dx * dx + dz * dz;
      let t = 0;
      if (lenSq > 1e-6) t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
      const dist = Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
      if (!best || dist < best.distM) best = { edgeId: lane.edgeId, laneId: lane.laneId, name: lane.name, distM: dist };
    }
  }
  return best;
}
export function validateSumoNetwork(network) {
  const assert = (ok, why) => { if (!ok) throw new Error('sumo: ' + why); };
  assert(network?.version === '1.0', 'version pin');
  assert(typeof network.source === 'string' && network.source.length > 0, 'source provenance');
  assert(Array.isArray(network.edges) && network.edges.length > 0, 'edges missing');
  let lanes = 0;
  const lats = [], lons = [];
  for (const edge of network.edges) {
    assert(Array.isArray(edge.lanes) && edge.lanes.length > 0, 'edgeless lanes: ' + edge.id);
    for (const lane of edge.lanes) {
      lanes++;
      assert(typeof lane.id === 'string' && lane.id.length > 0, 'lane id');
      assert(Number.isFinite(lane.speed) && lane.speed > 0 && lane.speed < 60, 'lane speed: ' + lane.id);
      assert(Array.isArray(lane.shape) && lane.shape.length >= 2, 'lane shape: ' + lane.id);
      for (const p of lane.shape) {
        assert(Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]), 'shape point: ' + lane.id);
        lons.push(p[0]); lats.push(p[1]);
      }
    }
  }
  const bbox = { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
  assert(bbox.west > -74.05 && bbox.east < -73.95 && bbox.south > 40.69 && bbox.north < 40.77, 'coverage drift');
  return { edges: network.edges.length, lanes, bbox };
}
