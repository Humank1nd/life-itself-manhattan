// Life Itself Manhattan — renderer-neutral capture pipeline (Phase 014).
// The capture interface belongs to the world representation, not to any
// renderer. A consumer (Matrix-Game-style neural renderer, an evaluator,
// a future model) receives RGB, depth, segmentation and camera pose
// rendered from the authoritative CURRENT geometry, all in the Twin
// Earth ENU frame, with each pose also expressed in UE cm using the
// same conversion as the conditioning packet. No model is imported,
// no weights are loaded, and nothing here trains anything.
export const CAPTURE_SCHEMA = 'life-itself-capture/1.0.0';
export const CAPTURE_PASSES = ['rgb', 'depth', 'segmentation'];
// The same synthetic three-waypoint path as the conditioning pilot, so
// captures and conditioning packets stay directly comparable. The path
// is a controlled demo path; it is NOT the 2005 photograph's camera.
export const CAPTURE_WAYPOINTS_ENU = [[-5, 1.68, 0], [-3.75, 1.68, 0], [-2.5, 1.68, 0]];
const assert = (ok, why) => { if (!ok) throw new Error('capture: ' + why); };
const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
export function enuToUE(enu) {
  // ENU [east, up, -north] m -> UE [east, south, up] cm. enu[2] is
  // already -north, which is the south component. Matches posUE in
  // src/world-model-conditioning.js exactly.
  return { x: Math.round(enu[0] * 100), y: Math.round(enu[2] * 100), z: Math.round(enu[1] * 100), yaw_deg: 0, pitch_deg: 0 };
}
export function segColor(index) {
  // Segmentation color for building index >= 1. Index 0 is reserved
  // for background (pure black) and is never assigned to a building.
  assert(Number.isInteger(index) && index >= 1 && index <= 0xffffff, 'segmentation index bounds');
  return '#' + [(index >> 16) & 255, (index >> 8) & 255, index & 255]
    .map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function ringCentroid(ring) {
  assert(Array.isArray(ring) && ring.length >= 3, 'ring too small');
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}
const round2 = (v) => Math.round(v * 100) / 100;
export function selectCaptureBuildings(buildings, radiusM = 320) {
  assert(Array.isArray(buildings) && buildings.length > 0, 'buildings missing');
  assert(Number.isFinite(radiusM) && radiusM >= 20 && radiusM <= 650, 'radius bounds');
  const chosen = [];
  for (const b of buildings) {
    const c = ringCentroid(b.rings[0]);
    if (Math.hypot(c[0], c[1]) <= radiusM) chosen.push({ building: b, centroid: c });
  }
  chosen.sort((a, b) => a.building.bin.localeCompare(b.building.bin));
  return chosen.map((entry, i) => ({
    bin: entry.building.bin,
    index: i + 1,
    color: segColor(i + 1),
    heightM: entry.building.h,
    yr: entry.building.yr ?? null,
    centroid: [round2(entry.centroid[0]), round2(entry.centroid[1])]
  }));
}
export function buildCaptureSpec(buildings, { radiusM = 320, size = 512, fovDeg = 55, nearM = 0.5, farM = 400 } = {}) {
  const entries = selectCaptureBuildings(buildings, radiusM);
  assert(entries.length > 0, 'no buildings inside the capture radius');
  const frames = [];
  CAPTURE_WAYPOINTS_ENU.forEach((pose, wi) => {
    for (const pass of CAPTURE_PASSES) {
      frames.push({
        id: `wp${wi}-${pass}`,
        waypoint: wi,
        pass,
        poseEnu: [...pose],
        poseUE: enuToUE(pose),
        file: `frames/wp${wi}-${pass}.png`
      });
    }
  });
  return {
    schemaVersion: CAPTURE_SCHEMA,
    worldId: 'life-itself:manhattan',
    status: 'spec-ready-not-captured',
    frame: { originId: 'twin-earth-times-square', axes: 'east/up/-north', units: 'meters' },
    geometry: {
      source: 'data/manhattan-enu.json',
      temporalBasis: 'current-snapshot-only',
      historicalClaim: 'none'
    },
    focus: { name: 'Times Square', radiusM },
    image: {
      width: size, height: size, fovDeg,
      passes: [...CAPTURE_PASSES],
      depthEncoding: { nearM, farM, mapping: 'gray = 255 * (1 - clamp((distanceM - nearM) / (farM - nearM), 0, 1))' },
      segmentationBackground: '#000000'
    },
    buildings: entries,
    camera: {
      poseStatus: 'synthetic-unverified-demo-path',
      facing: '+east',
      waypointsEnu: CAPTURE_WAYPOINTS_ENU.map((p) => [...p]),
      waypointsUE: CAPTURE_WAYPOINTS_ENU.map(enuToUE)
    },
    frames,
    policy: {
      modelTraining: 'not-authorized',
      rendererNeutral: true,
      generatedOutputIsHistoricalEvidence: false
    }
  };
}
export function validateCaptureSpec(spec, buildingsByBin) {
  assert(spec?.schemaVersion === CAPTURE_SCHEMA && spec.worldId === 'life-itself:manhattan', 'schema/world mismatch');
  assert(spec.status === 'spec-ready-not-captured', 'spec status overclaim');
  assert(spec.frame?.originId === 'twin-earth-times-square' && spec.frame.axes === 'east/up/-north', 'frame mismatch');
  assert(spec.geometry?.source === 'data/manhattan-enu.json' &&
    spec.geometry.temporalBasis === 'current-snapshot-only' &&
    spec.geometry.historicalClaim === 'none', 'geometry basis overclaim');
  assert(spec.policy?.modelTraining === 'not-authorized' &&
    spec.policy.rendererNeutral === true &&
    spec.policy.generatedOutputIsHistoricalEvidence === false, 'policy rails');
  assert(JSON.stringify(spec.image?.passes) === JSON.stringify(CAPTURE_PASSES), 'pass list drift');
  assert(spec.image.width === 512 && spec.image.height === 512 && spec.image.fovDeg === 55, 'image contract drift');
  assert(spec.image.segmentationBackground === '#000000', 'background reservation');
  assert(JSON.stringify(spec.camera?.waypointsEnu) === JSON.stringify(CAPTURE_WAYPOINTS_ENU), 'waypoint drift');
  assert(spec.camera.poseStatus === 'synthetic-unverified-demo-path', 'pose overclaim');
  spec.camera.waypointsUE.forEach((ue, i) => {
    assert(JSON.stringify(ue) === JSON.stringify(enuToUE(CAPTURE_WAYPOINTS_ENU[i])), 'UE conversion drift at waypoint ' + i);
  });
  const radius = spec.focus?.radiusM;
  assert(Number.isFinite(radius) && radius >= 20 && radius <= 650, 'radius bounds');
  assert(Array.isArray(spec.buildings) && spec.buildings.length > 0, 'buildings missing');
  const colors = new Set();
  spec.buildings.forEach((entry, i) => {
    assert(entry.index === i + 1, 'segmentation index sequence');
    assert(entry.color === segColor(entry.index) && !colors.has(entry.color), 'segmentation color drift/duplicate');
    colors.add(entry.color);
    const source = buildingsByBin.get(entry.bin);
    assert(source, 'building BIN not in the authoritative data: ' + entry.bin);
    assert(entry.heightM === source.h, 'height drift for BIN ' + entry.bin);
    assert(Math.hypot(entry.centroid[0], entry.centroid[1]) <= radius + 0.02, 'building outside radius: ' + entry.bin);
  });
  assert(Array.isArray(spec.frames) && spec.frames.length === CAPTURE_WAYPOINTS_ENU.length * CAPTURE_PASSES.length, 'frame count');
  const files = new Set();
  for (const f of spec.frames) {
    assert(f.id === `wp${f.waypoint}-${f.pass}` && CAPTURE_PASSES.includes(f.pass), 'frame identity');
    assert(f.file === `frames/${f.id}.png` && !files.has(f.file), 'frame file drift/duplicate');
    files.add(f.file);
    assert(isVec(f.poseEnu) && JSON.stringify(f.poseEnu) === JSON.stringify(CAPTURE_WAYPOINTS_ENU[f.waypoint]), 'frame pose drift');
    assert(JSON.stringify(f.poseUE) === JSON.stringify(enuToUE(f.poseEnu)), 'frame UE drift');
  }
  return { buildings: spec.buildings.length, frames: spec.frames.length, radiusM: radius };
}
