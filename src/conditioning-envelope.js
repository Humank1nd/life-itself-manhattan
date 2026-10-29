// Phase 016 — deterministic, renderer-neutral conditioning metadata.
// This module does not call models, decode images or authorize training.
import {createHash} from 'node:crypto';

export const ENVELOPE_SCHEMA='life-itself-conditioning-envelope/1.0.0';
export const CAPTURE_SCHEMA='life-itself-cloud-capture/1.0.0';
export const SNAPSHOT='2026-10-28';
export const PASSES=['rgb','depth','building-id'];
const CAMERAS=[
 {positionM:[160,115,210],targetM:[0,48,-22]},
 {positionM:[140,115,210],targetM:[0,48,-22]},
 {positionM:[120,115,210],targetM:[0,48,-22]}
];
const requireThat=(condition,why)=>{if(!condition)throw Error('conditioning-envelope: '+why)};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const label=(i,pass)=>`pose-${String(i).padStart(2,'0')}-${pass}.png`;

export function validateCaptureSource(manifest,versions,source){
 requireThat(manifest?.schemaVersion===CAPTURE_SCHEMA,'unknown capture producer');
 requireThat(manifest?.worldId==='life-itself:manhattan','world ID');
 requireThat(manifest?.snapshotAt===SNAPSHOT&&
   manifest.geometryStatus==='current-snapshot-only'&&
   manifest.geometryLimitations?.noHistoricalReconstruction===true,
   'historical geometry cannot be asserted');
 requireThat(manifest.renderOrigin==='Three.js authoritative current 2026 building snapshot',
   'render source differs');
 requireThat(manifest.outputsAreHistoricalGroundTruth===false&&
   manifest.trainingUseAuthorization==='not-established'&&
   manifest.trainingDataApproved===false&&
   Array.isArray(manifest.modelsExecuted)&&manifest.modelsExecuted.length===0,
   'generated/history/training policy overclaim');
 requireThat(manifest.geometrySource==='data/times-square-building-versions-v1.json',
   'geometry source mismatch');
 requireThat(validHash(source?.cityManifestSha256)&&
   validHash(source?.buildingVersionsSha256)&&
   manifest.cityManifestSha256===source.cityManifestSha256&&
   manifest.buildingVersionsSha256===source.buildingVersionsSha256,
   'source SHA-256 mismatch');
 requireThat(versions?.schemaVersion==='life-itself-building-versions/1.0.0'&&
   versions.worldId==='life-itself:manhattan'&&
   Array.isArray(versions.versions)&&versions.versions.length===622,
   'source building versions missing');
 const sorted=[...versions.versions].sort((a,b)=>a.id.localeCompare(b.id));
 requireThat(manifest.buildingVersions===622&&manifest.meshes===622,
   'capture building count mismatch');
 const identity=manifest.identity;
 requireThat(identity&&typeof identity==='object'&&
   Object.keys(identity).length===sorted.length,
   'exact source crosswalk required');
 for(let i=0;i<sorted.length;i++){
  const row=sorted[i],ref=identity[String(i+1)];
  requireThat(row.validityStatus==='current-snapshot'&&row.snapshotAt===SNAPSHOT,
    'source building temporal claim');
  requireThat(typeof row.bin==='string'&&row.bin.length>0&&
   ref?.bin===row.bin&&ref?.versionId===row.id&&
   ref?.sourceStatus==='2026-current-snapshot-only',
   'BIN/version identity mismatch at label '+(i+1));
 }
 requireThat(manifest.capture?.width===640&&
   manifest.capture?.height===360&&manifest.capture?.fovDeg===62&&
   manifest.capture?.pixelRatio===1&&manifest.capture?.antialias===false&&
   manifest.capture?.nearM===0.5&&manifest.capture?.farM===1400&&
   manifest.capture?.depthEncoding==='linear-camera-z-rgb24-near-far'&&
   manifest.capture?.idEncoding==='rgb24-id-0-background'&&
   manifest.capture?.rgbEncoding==='sRGB-PNG-no-HUD',
   'raster or depth semantic mismatch');
 requireThat(manifest.frame?.units==='meters'&&
   same(manifest.frame?.axes,['east','up','-north'])&&
   Number.isFinite(manifest.frame?.origin?.lat)&&
   Number.isFinite(manifest.frame?.origin?.lon),
   'ENU coordinate authority mismatch');
 requireThat(Array.isArray(manifest.cameras)&&manifest.cameras.length===3,
   'camera count mismatch');
 for(let i=0;i<3;i++){
  const c=manifest.cameras[i],reference=CAMERAS[i];
  requireThat(c?.index===i&&same(c?.positionM,reference.positionM)&&
    same(c?.targetM,reference.targetM)&&same(c?.up,[0,1,0])&&
    c.poseStatus==='synthetic-demo-camera-not-photographic-pose',
    'uncalibrated camera must not be relabelled/aligned');
 }
 requireThat(Array.isArray(manifest.captures)&&manifest.captures.length===9&&
   manifest.outputCount===9,'nine frame records required');
 const seen=new Set();
 for(const record of manifest.captures){
  requireThat(Number.isInteger(record.cameraIndex)&&record.cameraIndex>=0&&
    record.cameraIndex<3&&PASSES.includes(record.pass),'unexpected capture pass');
  const filename=label(record.cameraIndex,record.pass);
  requireThat(record.filename===filename&&!seen.has(filename),'wrong or duplicate frame path');
  seen.add(filename);
  requireThat(validHash(record.sha256)&&record.bytes>32&&
    Number.isSafeInteger(record.bytes)&&
    record.width===640&&record.height===360&&
    Number.isInteger(record.nonBlackPixels)&&record.nonBlackPixels>150,
    'frame hash or dimensions invalid');
 }
 requireThat(seen.size===9,'missing pass/camera pair');
 const observed=manifest.observedVisibleBuildingIds;
 requireThat(Array.isArray(observed)&&observed.length>=3&&
  new Set(observed).size===observed.length&&
  observed.every(i=>Number.isInteger(i)&&i>=1&&i<=622&&identity[String(i)]),
  'observed ID not grounded in source');
 return {identity,sorted,observed,source};
}

// The array reader receives a validated filename; no arbitrary disk paths or URLs.
export async function verifyFrameHashes(manifest,readFrameBytes){
 requireThat(typeof readFrameBytes==='function','missing byte reader');
 for(const record of manifest.captures){
  const data=await readFrameBytes(record.filename);
  requireThat(Buffer.isBuffer(data)&&data.byteLength===record.bytes&&
    data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&
    sha256(data)===record.sha256,'frame content/hash mismatch: '+record.filename);
 }
 return true;
}

export function buildConditioningEnvelope(manifest,versions,source,manifestBytes){
 const {identity,sorted,observed}=validateCaptureSource(manifest,versions,source);
 requireThat(Buffer.isBuffer(manifestBytes)&&manifestBytes.byteLength>500,
   'capture manifest bytes required for provenance hash');
 requireThat(same(JSON.parse(manifestBytes.toString('utf8')),manifest),
   'capture manifest bytes differ from parsed data');
 const byFrame=new Map(manifest.captures.map(c=>[c.filename,c]));
 return {
  schemaVersion:ENVELOPE_SCHEMA,producerSchema:CAPTURE_SCHEMA,
  worldId:manifest.worldId,
  geometry:{
   snapshotAt:SNAPSHOT,status:'current-snapshot-only',
   historicalClaim:'none',source:manifest.geometrySource,
   cityManifestSha256:source.cityManifestSha256,
   buildingVersionsSha256:source.buildingVersionsSha256,
   captureManifestSha256:sha256(manifestBytes)
  },
  camera:{
   coordinateSystem:'Twin Earth ENU',axes:['east','up','-north'],
   units:'meters',origin:manifest.frame.origin,
   poseStatus:'synthetic-unverified-not-archival',
   intrinsics:{width:640,height:360,fovDeg:62,nearM:0.5,farM:1400,
    pixelRatio:1,antialias:false},
   imageOrigin:'upper-left',
   waypoints:manifest.cameras.map(c=>({
    index:c.index,positionM:c.positionM,targetM:c.targetM,up:c.up
   }))
  },
  passEncodings:{
   rgb:{kind:'sRGB-PNG-no-HUD'},
   depth:{kind:'linear-camera-z-rgb24-near-far',nearM:0.5,farM:1400,
    background:'black',backgroundMayOverlapNearPlane:true,
    validityMask:'building-id-nonzero-required',
    precision:'packed RGB24',notEquivalentToPhase014GrayscaleDistance:true},
   buildingId:{kind:'rgb24-id-0-background',indexScope:'capture-manifest-only',
    stableIdentity:'BIN-and-versionId-not-color',backgroundIndex:0}
  },
  buildingIdentity:{
   sourceVersionCount:sorted.length,
   crosswalk:sorted.map((_,i)=>({index:i+1,bin:identity[String(i+1)].bin,
    versionId:identity[String(i+1)].versionId})),
   observedVisibleIndices:[...observed]
  },
  frames:manifest.cameras.map(c=>({
   waypointIndex:c.index,
   passes:Object.fromEntries(PASSES.map(p=>{
    const record=byFrame.get(label(c.index,p));
    return [p,{path:record.filename,sha256:record.sha256,bytes:record.bytes}];
   }))
  })),
  policy:{modelTraining:'not-authorized',modelEffects:'not-authorized-until-reviewed',
   generatedOutputIsHistoricalEvidence:false,
   referencePhotoPoseEstablished:false,
   licensedGeometryReuseNeedsReview:true},
  provider:{kind:'none',inferenceExecuted:false,modelWeightsLoaded:false,
   unsupportedInferenceInputsNotAssumed:true},
  artifact:{hosting:'GitHub Actions ephemeral',retentionDays:3,
   expiresAt:'managed-by-GitHub-Actions; resolve from run artifact metadata'},
  comparison:{phase014Alignment:'not-established',imageTensorsInterchangeable:false,
   comparisonRequiresCameraAndDepthCalibration:true}
 };
}
