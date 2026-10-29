// Build data/photo-alignment-v1.json: proposed photograph-to-building
// candidate alignments for every dated, geotagged photograph in the
// evidence registry and the Commons catalog.
//
// Method (geometry-and-time-v1), deliberately conservative:
//   - A photo's geotag may mark the camera position OR the pictured
//     subject (the catalog's own semantics), so candidacy is radial:
//     every building whose footprint comes within MAX_DISTANCE_M of
//     the photo point is a candidate.
//   - Hard filter: a building whose recorded construction year is
//     AFTER the photograph's year cannot appear in it. Excluded, not
//     down-scored.
//   - Score = (0.55 * proximity + 0.45 * prominence) * timeFit, where
//     proximity decays exponentially with footprint distance,
//     prominence grows with height, and timeFit is 1.0 when the
//     building predates the photo and 0.55 when either year is
//     unknown. Every candidate carries its reasons in plain words.
//
// Every alignment is PROPOSED. Nothing here is a visual verification,
// and nothing is written back into the evidence registry's buildingBin
// field: a human confirms a match before it becomes a record.
// Deterministic: same inputs, byte-identical output.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// WGS84 -> ECEF -> ENU, constant-for-constant with Extraction 001.
const A = 6378137.0, E2 = 0.00669437999014;
const ORIGIN = { lat: 40.7580, lon: -73.9855, elev: 10.0 };
const rad = (d) => (d * Math.PI) / 180;
function ecef(latDeg, lonDeg, h) {
  const lat = rad(latDeg), lon = rad(lonDeg);
  const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return [
    (n + h) * Math.cos(lat) * Math.cos(lon),
    (n + h) * Math.cos(lat) * Math.sin(lon),
    (n * (1 - E2) + h) * Math.sin(lat),
  ];
}
const O = ecef(ORIGIN.lat, ORIGIN.lon, ORIGIN.elev);
const SL = Math.sin(rad(ORIGIN.lat)), CL = Math.cos(rad(ORIGIN.lat));
const SO = Math.sin(rad(ORIGIN.lon)), CO = Math.cos(rad(ORIGIN.lon));
export function projectEnu(lat, lon, elev = 0) {
  const [x, y, z] = ecef(lat, lon, elev);
  const dx = x - O[0], dy = y - O[1], dz = z - O[2];
  const east = -SO * dx + CO * dy;
  const north = -SL * CO * dx - SL * SO * dy + CL * dz;
  const up = CL * CO * dx + CL * SO * dy + SL * dz;
  return { x: east, y: up, z: -north };
}

const MAX_DISTANCE_M = 150;
const TOP_N = 5;
const MIN_SCORE = 0.05;

function pointSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}
function insideRing(px, pz, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function buildingDistance(px, pz, b) {
  let best = Infinity;
  for (const ring of b.rings) {
    if (insideRing(px, pz, ring)) return 0;
    for (let i = 0; i < ring.length - 1; i++) {
      best = Math.min(best, pointSeg(px, pz, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]));
    }
  }
  return best;
}

export function align() {
  const buildings = read('data/manhattan-enu.json');
  const evidence = read('data/evidence-v1.json');
  const catalog = read('data/photo-catalog-v1.json');

  const boxes = buildings.map((b) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const ring of b.rings) for (const [x, z] of ring) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    return { b, x0, x1, z0, z1 };
  });

  const photos = [];
  for (const p of evidence.photos) {
    if (p.location && p.capturedAt) {
      photos.push({ photoId: p.id, source: 'evidence', capturedAt: p.capturedAt, lat: p.location.lat, lon: p.location.lon, stored: { x: p.location.x, z: p.location.z } });
    }
  }
  for (const r of catalog.records) {
    if (r.location && r.capturedAt) {
      photos.push({ photoId: r.id, source: 'catalog', capturedAt: r.capturedAt, lat: r.location.lat, lon: r.location.lon });
    }
  }
  photos.sort((a, b2) => (a.photoId < b2.photoId ? -1 : 1));

  const alignments = [];
  for (const photo of photos) {
    const pt = projectEnu(photo.lat, photo.lon);
    const photoYear = Number(photo.capturedAt.slice(0, 4)) || null;
    const candidates = [];
    for (const { b, x0, x1, z0, z1 } of boxes) {
      if (pt.x < x0 - MAX_DISTANCE_M || pt.x > x1 + MAX_DISTANCE_M || pt.z < z0 - MAX_DISTANCE_M || pt.z > z1 + MAX_DISTANCE_M) continue;
      if (b.yr != null && photoYear != null && b.yr > photoYear) continue; // cannot photograph the future
      const d = buildingDistance(pt.x, pt.z, b);
      if (d > MAX_DISTANCE_M) continue;
      const proximity = Math.exp(-d / 45);
      const prominence = Math.min(1, (b.h ?? 0) / 60);
      const timeFit = b.yr != null && photoYear != null ? 1.0 : 0.55;
      const score = Math.round(((0.55 * proximity + 0.45 * prominence) * timeFit) * 1000) / 1000;
      if (score < MIN_SCORE) continue;
      const reasons = [
        d === 0 ? 'photo point falls inside the footprint' : `footprint ${Math.round(d * 10) / 10} m from the photo point`,
        b.yr != null && photoYear != null
          ? `built ${b.yr}, ${photoYear - b.yr} years before the ${photoYear} photograph`
          : 'build year unknown; time fit reduced',
        `height ${Math.round((b.h ?? 0) * 10) / 10} m`,
      ];
      candidates.push({ bin: b.bin, score, distanceM: Math.round(d * 10) / 10, builtYear: b.yr ?? null, heightM: Math.round((b.h ?? 0) * 10) / 10, reasons });
    }
    candidates.sort((a, b2) => b2.score - a.score || a.distanceM - b2.distanceM || a.bin - b2.bin);
    const entry = {
      photoId: photo.photoId,
      source: photo.source,
      capturedAt: photo.capturedAt,
      point: { x: Math.round(pt.x * 100) / 100, z: Math.round(pt.z * 100) / 100 },
      candidates: candidates.slice(0, TOP_N),
      status: 'proposed',
      validatedVisualOverlap: false,
    };
    if (photo.stored) entry.storedPoint = photo.stored;
    alignments.push(entry);
  }

  return {
    schemaVersion: 'life-itself-photo-alignment/1.0.0',
    worldId: evidence.worldId,
    method: {
      name: 'geometry-and-time-v1',
      maxDistanceM: MAX_DISTANCE_M,
      score: '(0.55 * proximity + 0.45 * prominence) * timeFit; proximity = exp(-distanceM / 45); prominence = min(1, heightM / 60); timeFit = 1.0 known-predates, 0.55 year-unknown',
      hardFilters: ['construction year after the photograph year is excluded'],
    },
    semantics:
      'Candidates only: a geotag may identify the pictured landmark rather than the camera position, so candidacy is radial. Scores explain geometric and temporal fit; no visual verification has been performed, no match is confirmed, and no record here is approved for model training.',
    alignments,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = align();
  writeFileSync(join(ROOT, 'data/photo-alignment-v1.json'), JSON.stringify(out, null, 2) + '\n');
  const withC = out.alignments.filter((a) => a.candidates.length).length;
  const pairs = out.alignments.reduce((n, a) => n + a.candidates.length, 0);
  console.log(`photo-alignment: ${out.alignments.length} photographs, ${withC} with candidates, ${pairs} proposed candidate pairs`);
  const top = out.alignments.flatMap((a) => a.candidates.map((c) => ({ p: a.photoId, ...c }))).sort((a, b) => b.score - a.score)[0];
  if (top) console.log(`strongest proposal: ${top.p} -> BIN ${top.bin} (score ${top.score}, ${top.distanceM} m, built ${top.builtYear})`);
}
