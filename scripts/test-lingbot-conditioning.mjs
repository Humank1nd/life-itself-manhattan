import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {createTimesSquareConditioning,validateConditioningPacket,lingbotRequest,
 pingLingbot,runLingbotOnce}from'../src/world-model-conditioning.js';
const root=new URL('../',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const memory=read('data/spatial-memory-v1.json');
const evidence=read('data/evidence-v1.json');
const saved=read('data/lingbot-conditioning-pilot-v1.json');
const packet=createTimesSquareConditioning(memory,evidence);
assert.deepEqual(packet,saved,'committed packet must match source-derived content');
assert.deepEqual(validateConditioningPacket(packet),{
 year:2005,source:'commons-1284794',waypoints:3,historicalPlanes:0,training:'not-authorized'});
assert.equal(packet.photo.capturedAt,'2005-12-08');
assert.equal(packet.camera.sourceImagePoseMatched,false);
assert.equal(packet.camera.providerWaypointsCm[0].x,-500);
assert.equal(packet.camera.providerWaypointsCm[0].z,168);
assert.equal(packet.camera.providerWaypointsCm.at(-1).x,-250);
assert.equal(packet.camera.providerWaypointsCm[0].y,0);
assert.equal(packet.worldMemory.retrievedCurrentGeometryPlanes,0);
assert.equal(packet.worldMemory.historicalGeometry,'unavailable');
assert.ok(packet.worldMemory.retrievedPhotoIds.includes('commons-1284794'));
assert.ok(!('world_planes' in packet.provider.supportedInputs));
const image=readFileSync(new URL(packet.photo.localAsset,root));
assert.equal(createHash('sha256').update(image).digest('hex'),packet.photo.sha256);
const hex=image.toString('hex');
const payload=lingbotRequest(packet,hex);
assert.deepEqual(Object.keys(payload).sort(),['camera_path','frames','init_image_hex','photosensitivity_safe',
 'pose_cm','prompt','seed'].sort());
assert.equal(payload.camera_path.length,3);
assert.equal(payload.frames,9);
assert.equal(payload.photosensitivity_safe,true);
assert.equal(payload.init_image_hex,hex);
assert.ok(!('planes' in payload),'LingBot cannot ingest planar memory yet');
let posts=0,healthCalls=0,lastPost;
const degraded=async(url,options)=>{
 assert.equal(url,'http://127.0.0.1:8013/health');
 assert.equal(options.method,'GET');
 healthCalls++;
 return {status:200,json:async()=>({status:'degraded',weights_ready:false})};
};
assert.deepEqual(await pingLingbot({fetcher:degraded}),{status:'degraded',weightsReady:false});
const blocked=await runLingbotOnce(packet,hex,{fetcher:degraded,
 approvedLocalInference:true,rightsReviewed:true});
assert.equal(blocked.status,'blocked-weights-not-ready');
assert.equal(blocked.posted,false);
assert.equal(posts,0);
await assert.rejects(()=>runLingbotOnce(packet,hex,{fetcher:degraded,rightsReviewed:false,
 approvedLocalInference:true}),/explicit local inference/);
await assert.rejects(()=>pingLingbot({fetcher:degraded,base:'https://bad.example'}),/loopback/);
const fake=async(url,options)=>{
 if(url.endsWith('/health'))return {status:200,json:async()=>({status:'healthy',weights_ready:true})};
 if(url.endsWith('/v1/viewport/generate')){
  posts++;lastPost=JSON.parse(options.body);
  assert.equal(options.method,'POST');
  return {status:200,json:async()=>({status:'WORLDMODEL_FRAMES_RETURNED',
   frames_hex_png:['89504e470d0a1a0a'+'00'.repeat(28)],
   photosensitivity_safe:true,
   peak_interframe_delta:0.2,chunk_dir:'/tmp/SYNTHETIC_FIXTURE_ONLY'})};
 }
 throw new Error('unexpected URL '+url);
};
const mock=await runLingbotOnce(packet,hex,{fetcher:fake,approvedLocalInference:true,rightsReviewed:true});
assert.equal(mock.status,'provider-reported-frames');
assert.equal(mock.frameCount,1);
assert.equal(mock.providerPersistedFrames,true);
assert.equal(posts,1);
const fakeOldShape=async(url,options)=>{
 if(url.endsWith('/health'))return {status:200,json:async()=>({status:'healthy',weights_ready:true})};
 return {status:200,json:async()=>({status:'WORLDMODEL_FRAMES_RETURNED',
  frames:[{index:0}],video:null})};
};
const obsolete=await runLingbotOnce(packet,hex,{fetcher:fakeOldShape,
 approvedLocalInference:true,rightsReviewed:true});
assert.equal(obsolete.status,'invalid-provider-frames','wrong response shape must fail closed');
const fakeInvalid=async(url,options)=>{
 if(url.endsWith('/health'))return {status:200,json:async()=>({status:'healthy',weights_ready:true})};
 return {status:200,json:async()=>({status:'WORLDMODEL_FRAMES_RETURNED',
  frames_hex_png:['not_png']})};
};
const invalid=await runLingbotOnce(packet,hex,{fetcher:fakeInvalid,
 approvedLocalInference:true,rightsReviewed:true});
assert.equal(invalid.status,'invalid-provider-frames');
assert.equal(lastPost.camera_path[2].x,-250);
assert.equal(lastPost.init_image_hex,hex);
const bad=structuredClone(packet);bad.camera.sourceImagePoseMatched=true;
assert.throws(()=>validateConditioningPacket(bad),/camera calibration/);
const bad2=structuredClone(packet);bad2.worldMemory.retrievedCurrentGeometryPlanes=7;
assert.throws(()=>validateConditioningPacket(bad2),/anachronistic/);
const bad3=structuredClone(packet);bad3.photo.trainingPermission='approved';
assert.throws(()=>validateConditioningPacket(bad3),/source trust/);
const bad4=structuredClone(packet);bad4.provider.supportedInputs.push('planes');
assert.throws(()=>validateConditioningPacket(bad4),/provider capability/);
assert.throws(()=>lingbotRequest(packet,'not-hex!'),/image hex/);
console.log('PASS: exact source photo and 3-waypoint ENU→UE cm conditioning; 2005 has zero 2026 planes; degraded service never POSTs; mocked LingBot route works; strict provenance/authorization cases rejected');
