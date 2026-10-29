// Life Itself Manhattan — provider-neutral conditioning envelope (Phase 016).
// A validated logical envelope over a verified capture manifest, not raw
// image files whose filenames imply a contract. No imports: runs in Node
// and the browser unchanged, like src/capture-pipeline.js. No model is
// imported, no weights are loaded, nothing here trains anything.
export const ENVELOPE_SCHEMA = 'life-itself-conditioning-envelope/1.0.0';
export const CLOUD_CONTRACT = 'life-itself-cloud-capture/1.0.0';
export const PILOT_CONTRACT = 'life-itself-capture/1.0.0';

// Pass encodings are contract-pinned. Phase 014 pilot depth is inverted
// 8-bit grayscale DISTANCE; Phase 015 cloud depth is 24-bit RGB-packed
// linear camera-space Z. A grayscale value is not a linear-Z value: any
// cross-contract numeric comparison without an audited conversion throws.
export const CLOUD_PASS_ENCODINGS = {
  rgb: 'sRGB-PNG-no-HUD',
  depth: 'rgb24-linear-camera-Z-near-far',
  buildingId: 'rgb24-id-0-background',
};
export const PILOT_PASS_ENCODINGS = {
  rgb: 'sRGB-PNG-no-HUD',
  depth: 'gray8-inverted-distance',
  segmentation: 'rgb24-index-legend',
};
const assert = (ok, why) => { if (!ok) throw new Error('envelope: ' + why); };
const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);

export function buildConditioningEnvelope({ manifest, manifestSha256, pilotSpec, buildingVersions }) {
  assert(manifest?.schemaVersion === CLOUD_CONTRACT, 'cloud manifest contract mismatch');
  assert(Array.isArray(manifest.captures) && manifest.captures.length === 9, 'cloud manifest must carry 9 captures');
  assert(manifest.modelsExecuted?.length === 0, 'models must not have executed');
  assert(manifest.trainingUseAuthorization !== true && manifest.trainingDataApproved !== true, 'training rails');
  const identityKeys = Object.keys(manifest.identity || {});
  assert(identityKeys.length === 622, 'identity map must carry 622 versioned entities');
  const byBin = new Map(buildingVersions.versions.map((v) => [v.bin, v]));
  for (const key of identityKeys) {
    const entry = manifest.identity[key];
    assert(entry && typeof entry.bin === 'string' && byBin.has(entry.bin), 'unknown BIN in identity map: ' + key);
    assert(typeof entry.versionId === 'string' && entry.versionId.length > 0, 'identity without version: ' + key);
  }
  const visible = manifest.observedVisibleBuildingIds || [];
  assert(visible.length > 0, 'no visible IDs observed');
  for (const id of visible) assert(manifest.identity[String(id)], 'visible ID outside identity map: ' + id);
  const passes = {};
  const manifestPass = { rgb: 'rgb', depth: 'depth', buildingId: 'building-id' };
  for (const [pass, encoding] of Object.entries(CLOUD_PASS_ENCODINGS)) {
    const files = manifest.captures.filter((c) => c.pass === manifestPass[pass]).map((c) => ({
      file: c.filename, sha256: c.sha256, bytes: c.bytes, width: c.width, height: c.height,
    }));
    assert(files.length === 3, 'pass must have exactly 3 camera frames: ' + pass);
    passes[pass] = { encoding, files };
  }
  return {
    schemaVersion: ENVELOPE_SCHEMA,
    worldId: 'life-itself:manhattan',
    captureContract: CLOUD_CONTRACT,
    sourceSnapshotAt: manifest.snapshotAt,
    geometryStatus: 'current-snapshot-only',
    historicalClaim: 'none',
    sourceManifest: {
      runId: manifest.workflow || 'cloud-times-square-capture',
      manifestSha256,
      cityManifestSha256: manifest.cityManifestSha256,
      buildingVersionsSha256: manifest.buildingVersionsSha256,
      gitCommit: manifest.gitCommit,
    },
    camera: {
      poseStatus: 'synthetic-unverified-demo-path',
      frame: { axes: manifest.frame.axes, units: manifest.frame.units, origin: manifest.frame.origin },
      handedness: 'right-handed-enu-east-up-minus-north',
      poses: manifest.cameras.map((c) => ({ index: c.index, positionM: [...c.positionM], targetM: [...c.targetM] })),
      intrinsics: {
        width: manifest.capture.width, height: manifest.capture.height,
        fovDeg: manifest.capture.fovDeg, nearM: manifest.capture.nearM, farM: manifest.capture.farM,
        aspect: manifest.capture.width / manifest.capture.height,
      },
      ueConversion: 'none-in-this-contract',
    },
    passes,
    identities: {
      count: identityKeys.length,
      visibleIds: [...visible],
      idSpace: 'manifest-index-crosswalked-to-BIN-and-versionId-not-color-numbers',
    },
    compatibility: {
      pilotContract: PILOT_CONTRACT,
      sharedPixelSpace: false,
      sharedCameraPath: false,
      // Machine-readable form of docs/phase015-016-capture-contract-compatibility.md:
      // same authority (current Manhattan geometry), different image contracts.
      pilotRaster: `${pilotSpec.image.width}x${pilotSpec.image.height}-fov${pilotSpec.image.fovDeg}`,
      cloudRaster: `${manifest.capture.width}x${manifest.capture.height}-fov${manifest.capture.fovDeg}`,
      pilotDepth: PILOT_PASS_ENCODINGS.depth,
      cloudDepth: CLOUD_PASS_ENCODINGS.depth,
    },
    rights: {
      training: 'not-authorized',
      modelEffects: 'not-authorized-until-reviewed',
      historicalClaim: 'none',
      licensePolicy: manifest.licensePolicy,
    },
    model: { provider: 'none', inferenceExecuted: false },
  };
}

export function validateEnvelope(env, { manifest, manifestSha256, buildingVersions }) {
  assert(env?.schemaVersion === ENVELOPE_SCHEMA, 'schema mismatch');
  assert(env.worldId === 'life-itself:manhattan', 'world mismatch');
  assert(env.captureContract === CLOUD_CONTRACT, 'capture contract mismatch');
  assert(env.geometryStatus === 'current-snapshot-only', 'geometry basis overclaim');
  assert(env.historicalClaim === 'none', 'historical overclaim');
  assert(env.sourceManifest?.manifestSha256 === manifestSha256, 'stale manifest SHA');
  assert(env.sourceManifest?.cityManifestSha256 === manifest.cityManifestSha256, 'city manifest drift');
  assert(env.sourceManifest?.buildingVersionsSha256 === manifest.buildingVersionsSha256, 'versions drift');
  assert(env.camera?.poseStatus === 'synthetic-unverified-demo-path', 'pose overclaim');
  assert(env.camera?.ueConversion === 'none-in-this-contract', 'UE conversion overclaim');
  assert(env.camera?.handedness === 'right-handed-enu-east-up-minus-north', 'handedness drift');
  assert(Array.isArray(env.camera?.poses) && env.camera.poses.length === 3, 'pose count');
  for (const p of env.camera.poses) assert(isVec(p.positionM) && isVec(p.targetM), 'pose vector');
  const intr = env.camera.intrinsics;
  assert(intr.width === 640 && intr.height === 360 && intr.fovDeg === 62, 'intrinsics drift');
  assert(intr.nearM === 0.5 && intr.farM === 1400, 'depth range drift');
  for (const [pass, encoding] of Object.entries(CLOUD_PASS_ENCODINGS)) {
    assert(env.passes?.[pass]?.encoding === encoding, 'pass encoding drift: ' + pass);
    const files = env.passes[pass].files;
    assert(Array.isArray(files) && files.length === 3, 'pass file count: ' + pass);
    const seen = new Set();
    const manifestPass = pass === 'buildingId' ? 'building-id' : pass;
    for (const f of files) {
      const live = manifest.captures.find((c) => c.filename === f.file && c.pass === manifestPass);
      assert(live, 'envelope file not in manifest: ' + f.file);
      assert(live.sha256 === f.sha256, 'frame hash drift: ' + f.file);
      assert(!seen.has(f.sha256), 'duplicated frame hash: ' + f.file);
      seen.add(f.sha256);
    }
  }
  assert(env.identities?.count === 622, 'identity count drift');
  assert(Array.isArray(env.identities?.visibleIds) && env.identities.visibleIds.length > 0, 'visible IDs missing');
  const byBin = new Set(buildingVersions.versions.map((v) => v.bin));
  for (const id of env.identities.visibleIds) {
    const entry = manifest.identity[String(id)];
    assert(entry && byBin.has(entry.bin), 'visible ID without source BIN: ' + id);
  }
  assert(env.compatibility?.sharedPixelSpace === false, 'pixel-space overclaim');
  assert(env.compatibility?.sharedCameraPath === false, 'shared-path overclaim');
  assert(env.compatibility?.pilotDepth === PILOT_PASS_ENCODINGS.depth, 'pilot depth relabel');
  assert(env.compatibility?.cloudDepth === CLOUD_PASS_ENCODINGS.depth, 'cloud depth relabel');
  assert(env.rights?.training === 'not-authorized', 'training gate flip');
  assert(env.rights?.historicalClaim === 'none', 'rights historical overclaim');
  assert(env.model?.provider === 'none' && env.model?.inferenceExecuted === false, 'model execution overclaim');
  return { passes: 3, frames: 9, identities: env.identities.count, visible: env.identities.visibleIds.length };
}

// Depth values are contract-pinned. Callers must name the contract they
// decoded under; cross-contract numeric use without an audited conversion
// fails closed. There is currently NO audited 014<->015 conversion.
export function decodeDepthFrame({ contract, bytes }) {
  assert(contract === CLOUD_CONTRACT || contract === PILOT_CONTRACT, 'unknown depth contract');
  assert(bytes && bytes.length > 0, 'empty depth payload');
  if (contract === CLOUD_CONTRACT) return { semantic: 'linear-camera-Z-meters', precision: '24bit-channel-packed', bytes: bytes.length };
  return { semantic: 'inverted-grayscale-distance-UNAUDITED', precision: '8bit', bytes: bytes.length };
}
export function assertSameDepthContract(a, b) {
  assert(a === b, 'cross-contract depth comparison without audited conversion');
  assert(a === CLOUD_CONTRACT || a === PILOT_CONTRACT, 'unknown depth contract');
  return true;
}
