// Life Itself — Street Corridors Engine.
// Extracted from gods-eye-view/src/life/manhattanStreets.js.
// Surveyed WGS84 waypoints for iconic Lower Manhattan & Midtown thoroughfares
// projected into the Times Square ENU coordinate frame (x=East, z=-North).
// Zero external dependencies; runs identically in Node.js and browser.

const ORIGIN = { lat: 40.7580, lon: -73.9855 };
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
const [ox, oy, oz] = ecef(ORIGIN.lat, ORIGIN.lon, 0);
const lat0 = ORIGIN.lat * D2R, lon0 = ORIGIN.lon * D2R;
const sLat = Math.sin(lat0), cLat = Math.cos(lat0), sLon = Math.sin(lon0), cLon = Math.cos(lon0);

export function wgs84ToEnu(latDeg, lonDeg) {
  const [x, y, z] = ecef(latDeg, lonDeg, 0);
  const dx = x - ox, dy = y - oy, dz = z - oz;
  const east = -sLon * dx + cLon * dy;
  const north = -sLat * cLon * dx - sLat * sLon * dy + cLat * dz;
  return [east, -north]; // x=East, z=-North (three.js -Z North)
}

export const SURVEYED_CORRIDORS = {
  // Broadway from Bowling Green past Wall St to Fulton St
  broadwayLower: [
    { lat: 40.704051, lon: -74.013189 }, // Bowling Green
    { lat: 40.705039, lon: -74.013327 }, // Morris St
    { lat: 40.705916, lon: -74.013224 }, // Exchange Pl
    { lat: 40.706514, lon: -74.012727 }, // Rector St
    { lat: 40.706813, lon: -74.012478 }, // Trinity Church
    { lat: 40.707422, lon: -74.011979 }, // Wall St
    { lat: 40.707726, lon: -74.011734 }, // 1 Wall St
    { lat: 40.708020, lon: -74.011492 }, // Pine St
    { lat: 40.708313, lon: -74.011250 }, // Cedar St
    { lat: 40.708602, lon: -74.011013 }, // Liberty St
    { lat: 40.709162, lon: -74.010544 }, // Maiden Ln
    { lat: 40.709745, lon: -74.010047 }, // Fulton St
  ],
  // Wall Street Eastbound (Trinity Church to East River Pier 11)
  wallStreet: [
    { lat: 40.707764, lon: -74.011704 }, // Broadway / Trinity Church
    { lat: 40.707590, lon: -74.011390 }, // New St
    { lat: 40.707208, lon: -74.010802 }, // Broad St / Federal Hall
    { lat: 40.706613, lon: -74.009864 }, // William St
    { lat: 40.706069, lon: -74.008906 }, // Hanover St
    { lat: 40.705526, lon: -74.007907 }, // Pearl St
    { lat: 40.704922, lon: -74.007024 }, // Water St
    { lat: 40.704359, lon: -74.006111 }, // South St / Pier 11
  ],
  // Broad Street from Wall St to Pearl St
  broadStreet: [
    { lat: 40.707125, lon: -74.010678 },
    { lat: 40.706300, lon: -74.010850 },
    { lat: 40.705200, lon: -74.011000 },
    { lat: 40.703500, lon: -74.011150 },
    { lat: 40.701790, lon: -74.011167 },
  ],
  // Water Street Northbound
  waterStreet: [
    { lat: 40.702417, lon: -74.012828 },
    { lat: 40.703500, lon: -74.010500 },
    { lat: 40.704922, lon: -74.007024 },
    { lat: 40.706413, lon: -74.005648 },
  ],
  // Maiden Lane
  maidenLane: [
    { lat: 40.709743, lon: -74.009820 },
    { lat: 40.708200, lon: -74.008200 },
    { lat: 40.706800, lon: -74.006700 },
    { lat: 40.705802, lon: -74.005528 },
  ],
  // Times Square Broadway Spine
  timesSquareBroadway: [
    { lat: 40.7557, lon: -73.9868 },
    { lat: 40.7565, lon: -73.9862 },
    { lat: 40.7573, lon: -73.9857 },
    { lat: 40.7580, lon: -73.9855 }, // Origin (42nd-47th St)
    { lat: 40.7592, lon: -73.9846 },
  ]
};

/**
 * Returns Float32Array of line positions [x1, y1, z1, x2, y2, z2, ...] for all surveyed corridors.
 * Elevation is lifted slightly to y = 0.8m above ground grid.
 */
export function getStreetSegmentsPositions(yElevation = 0.8) {
  let segCount = 0;
  for (const pts of Object.values(SURVEYED_CORRIDORS)) {
    segCount += pts.length - 1;
  }

  const positions = new Float32Array(segCount * 6);
  let pIdx = 0;

  for (const pts of Object.values(SURVEYED_CORRIDORS)) {
    const enuPts = pts.map(p => wgs84ToEnu(p.lat, p.lon));
    for (let i = 0; i < enuPts.length - 1; i++) {
      const [x1, z1] = enuPts[i];
      const [x2, z2] = enuPts[i + 1];

      // Point A
      positions[pIdx++] = x1;
      positions[pIdx++] = yElevation;
      positions[pIdx++] = z1;

      // Point B
      positions[pIdx++] = x2;
      positions[pIdx++] = yElevation;
      positions[pIdx++] = z2;
    }
  }

  return positions;
}
