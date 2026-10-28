// Life Itself Manhattan: deterministic source-to-world-model conditioning.
// The provider consumes prompt, image pixels and pose_cm/camera_path only.
// Historic geometry and source references remain sidecar, NOT LingBot inputs.
import {createSpatialMemoryIndex,retrieveSpatialMemory} from './spatial-memory.js';

export const PACKET_SCHEMA='life-itself-world-conditioning/1.0.0';
const assert=(ok,reason)=>{if(!ok)throw new Error('conditioning: '+reason)};
const clamp=(s,n)=>String(s).slice(0,n);
const isVec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const waypoints=[
  [-5.0,1.68,0.0],
  [-3.75,1.68,0.0],
  [-2.5,1.68,0.0]
];
const posUE=enu=>({
  x:Math.round(enu[0]*100), // East
  y:Math.round(enu[2]*100), // South, ENU z = -North
  z:Math.round(enu[1]*100), // Up
  yaw_deg:0,pitch_deg:0
});
export function createTimesSquareConditioning(memory,evidence,{year=2005,seed=20261028}={}){
  assert(year===2005,'pilot locked to 2005 until another date is independently reviewed');
  assert(Number.isInteger(seed)&&seed>=0&&seed<=2147483647,'seed bounds');
  assert(Array.isArray(evidence?.photos),'source evidence missing');
  const index=createSpatialMemoryIndex(memory);
  const retrieval=retrieveSpatialMemory(index,{year,focus:[0,0],radiusM:320,
    maxPhotos:18,maxPlanes:220}); // camera direction not asserted from unsurveyed geotags
  const chosen=evidence.photos.find(p=>p.id==='commons-1284794');
  assert(chosen&&chosen.capturedAt==='2005-12-08'&&
    retrieval.photos.some(p=>p.id===chosen.id),'dated pilot source missing');
  assert(chosen.modelTrainingPermission==='unreviewed'&&chosen.rights==='licensed-for-web'&&
    chosen.license?.label==='CC BY-SA 2.5'&&chosen.license?.author&&
    chosen.source?.url?.startsWith('https://commons.wikimedia.org/wiki/File:'),
    'source copyright/provenance contract not established');
  assert(/^assets\/evidence\/commons-\d+\.jpg$/.test(chosen.imageUri)&&
    /^[a-f0-9]{64}$/.test(chosen.sha256),'source image path/hash unsafe');
  assert(retrieval.planes.length===0&&retrieval.geometryStatus==='historical-geometry-unavailable',
    'current geometry may not be used as historical geometry');
  assert(retrieval.modelTrainingPermission==='not-authorized','training denied');
  const poses=waypoints.map(p=>[...p]);
  assert(poses.every(isVec),'camera path invalid');
  const prompt='Experimental Manhattan Times Square 2005 visual continuation from one licensed reference photograph. '+
    'Controlled smooth lateral camera movement of 2.5 meters in a local coordinate frame. '+
    'No claim of authentic 2005 facades, exact camera calibration, or verified historic reconstruction. '+
    'Preserve source-appearance continuity where visible; do not treat generated details as ground truth.';
  const packet={
    schemaVersion:PACKET_SCHEMA,worldId:'life-itself:manhattan',
    status:'prepared-not-generated',year,seed,framesRequested:9,
    photo:{id:chosen.id,capturedAt:chosen.capturedAt,
      sourceUrl:chosen.source.url,sourceTitle:chosen.source.title,
      author:chosen.license.author,license:chosen.license.label,
      licenseUrl:chosen.license.url,localAsset:chosen.imageUri,sha256:chosen.sha256,
      trainingPermission:'unreviewed',cameraPose:'unknown',
      approximateGeotag:chosen.location&&{lat:chosen.location.lat,lon:chosen.location.lon}},
    worldMemory:{
      retrievedPhotoIds:retrieval.photos.map(p=>p.id),
      retrievedCurrentGeometryPlanes:retrieval.planes.length,
      historicalGeometry:'unavailable',
      geometryIsAuthoritativeForYear:false,occlusion:'unknown',
      actualVisualCorrespondence:'not-established'
    },
    camera:{
      origin:'Times Square Twin Earth ENU origin',
      poseStatus:'synthetic-unverified-demo-path',
      sourceImagePoseMatched:false,
      transformation:'ENU [east,up,-north] m -> UE [east,south,up] cm, uncalibrated orientation',
      enuWaypointsM:poses,
      providerWaypointsCm:poses.map(posUE),
      motionDescription:'3 positions, +2.5m eastward; camera faces UE +X (yaw 0)',
      speed:'not-verified'
    },
    provider:{
      kind:'lingbot-world-local-bridge-8013',
      supportedInputs:['prompt','init_image_hex','pose_cm','camera_path','frames','seed','photosensitivity_safe'],
      unsupportedStructuredInputs:['source-grounded planes','historical version graph','licensed attribution graph'],
      prompt:clamp(prompt,1400)
    },
    policy:{modelTraining:'not-authorized',generation:'blocked-until-local-service-ready-and-license-reviewed',
      generatedOutputIsHistoricalEvidence:false}
  };
  return packet;
}
export function validateConditioningPacket(packet){
  assert(packet?.schemaVersion===PACKET_SCHEMA&&packet.worldId==='life-itself:manhattan','packet version/world');
  assert(packet.year===2005&&packet.photo?.id==='commons-1284794','pilot source mismatch');
  assert(packet.photo.trainingPermission==='unreviewed'&&
    packet.photo.license==='CC BY-SA 2.5'&&packet.photo.cameraPose==='unknown',
    'source trust boundary');
  assert(packet.worldMemory?.historicalGeometry==='unavailable'&&
    packet.worldMemory.retrievedCurrentGeometryPlanes===0&&
    packet.worldMemory.geometryIsAuthoritativeForYear===false,'anachronistic geometry');
  assert(packet.camera?.poseStatus==='synthetic-unverified-demo-path'&&
    packet.camera.sourceImagePoseMatched===false,'camera calibration implied');
  assert(packet.camera.providerWaypointsCm?.length===3&&
    packet.camera.providerWaypointsCm.every(p=>['x','y','z','yaw_deg','pitch_deg'].every(k=>Number.isFinite(p[k]))),
    'waypoint contract');
  assert(packet.provider?.kind==='lingbot-world-local-bridge-8013'&&
    !packet.provider.supportedInputs.includes('planes')&&
    typeof packet.provider.prompt==='string'&&packet.provider.prompt.length<=1400,
    'provider capability overclaim');
  assert(packet.policy.modelTraining==='not-authorized'&&
    packet.policy.generatedOutputIsHistoricalEvidence===false,'training/history guard');
  return {year:packet.year,source:packet.photo.id,waypoints:3,
    historicalPlanes:0,training:'not-authorized'};
}
export function lingbotRequest(packet,initImageHex){
  validateConditioningPacket(packet);
  assert(typeof initImageHex==='string'&&/^[a-f0-9]+$/.test(initImageHex)&&
    initImageHex.length>=20&&initImageHex.length<=10000000,'image hex missing/oversize');
  return {
    prompt:packet.provider.prompt,
    init_image_hex:initImageHex,
    pose_cm:packet.camera.providerWaypointsCm[0],
    camera_path:packet.camera.providerWaypointsCm,
    seed:packet.seed,
    frames:packet.framesRequested,
    photosensitivity_safe:true
  };
}
const LOOPBACK_URL='http://127.0.0.1:8013';
export async function pingLingbot({fetcher=fetch,base=LOOPBACK_URL}={}){
  assert(base===LOOPBACK_URL,'LingBot restricted to known Houston loopback');
  const response=await fetcher(base+'/health',{method:'GET',
    signal:AbortSignal.timeout(4000),headers:{Accept:'application/json'}});
  assert(response.status===200,'health HTTP '+response.status);
  const data=await response.json();
  assert(['healthy','initializing','degraded'].includes(data.status)&&
    typeof data.weights_ready==='boolean','malformed health response');
  return {status:data.status,weightsReady:data.status==='healthy'&&data.weights_ready===true};
}
export async function runLingbotOnce(packet,initImageHex,{fetcher=fetch,base=LOOPBACK_URL,
  approvedLocalInference=false,rightsReviewed=false}={}){
  validateConditioningPacket(packet);
  assert(approvedLocalInference===true&&rightsReviewed===true,
    'explicit local inference and licensed derivative review required');
  const health=await pingLingbot({fetcher,base});
  if(!health.weightsReady)return {status:'blocked-weights-not-ready',health,posted:false};
  const request=lingbotRequest(packet,initImageHex);
  const response=await fetcher(base+'/v1/viewport/generate',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(request),signal:AbortSignal.timeout(120000)
  });
  const reply=await response.json();
  if(response.status!==200||reply?.status!=='WORLDMODEL_FRAMES_RETURNED')
    return {status:'provider-failure',httpStatus:response.status,posted:true};
  // Verified against the actual Dream Caesar serve_worldmodel.py:
  // {"status":"WORLDMODEL_FRAMES_RETURNED","frames_hex_png":[...],
  //  "photosensitivity_safe":bool,"peak_interframe_delta":...,"chunk_dir":...}
  // A successful status without valid frame bytes must NOT count as generation.
  const frames=reply.frames_hex_png;
  const signature='89504e470d0a1a0a';
  if(!Array.isArray(frames)||frames.length<1||frames.length>64||
     !frames.every(hex=>typeof hex==='string'&&hex.length>=64&&
       hex.length%2===0&&hex.startsWith(signature)&&
       /^[0-9a-f]+$/i.test(hex))){
    return {status:'invalid-provider-frames',httpStatus:response.status,
      posted:true,frameCount:0};
  }
  return {status:'provider-reported-frames',posted:true,
    frameCount:frames.length,
    providerPersistedFrames:typeof reply.chunk_dir==='string'&&reply.chunk_dir.length>0,
    historicalTruth:'not-verified',modelTraining:'not-permitted'};
}
