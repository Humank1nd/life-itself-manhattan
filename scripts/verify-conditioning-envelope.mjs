#!/usr/bin/env node
// GitHub-hosted Phase 016 gate: verify 9 actual frame bytes + source provenance,
// reject adversarial manifests, and produce one metadata-only conditioning file.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,sep,isAbsolute} from 'node:path';
import {
 sha256,validateCaptureSource,verifyFrameHashes,
 buildConditioningEnvelope,ENVELOPE_SCHEMA
} from '../src/conditioning-envelope.js';

assert(process.env.GITHUB_ACTIONS==='true'&&
 process.env.RUNNER_ENVIRONMENT==='github-hosted'&&process.env.RUNNER_TEMP,
 'Cloud-only gate: GitHub-hosted runner required');
const out=process.env.CAPTURE_OUT;
assert(typeof out==='string'&&isAbsolute(out)&&
 out.startsWith(resolve(process.env.RUNNER_TEMP)+sep),
 'All generated artifacts must remain in ephemeral runner.temp');
const fromOut=name=>join(out,name);
const manifestBytes=await readFile(fromOut('manifest.json'));
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const cityBytes=await readFile('data/city-scene-v1.json');
const versionsBytes=await readFile('data/times-square-building-versions-v1.json');
const versions=JSON.parse(versionsBytes.toString('utf8'));
const source={
 cityManifestSha256:sha256(cityBytes),
 buildingVersionsSha256:sha256(versionsBytes)
};
const frameReader=name=>readFile(fromOut(name));
validateCaptureSource(manifest,versions,source);
await verifyFrameHashes(manifest,frameReader);
const envelope=buildConditioningEnvelope(manifest,versions,source,manifestBytes);
assert.equal(envelope.schemaVersion,ENVELOPE_SCHEMA);
assert.equal(envelope.frames.length,3);
assert.equal(envelope.buildingIdentity.crosswalk.length,622);
assert.equal(envelope.policy.modelTraining,'not-authorized');
assert.equal(envelope.comparison.imageTensorsInterchangeable,false);
assert.equal(envelope.provider.inferenceExecuted,false);
assert.equal(envelope.geometry.historicalClaim,'none');
const mutate=(fn)=>{
 const copy=structuredClone(manifest);
 fn(copy);
 assert.throws(()=>validateCaptureSource(copy,versions,source),
  /conditioning-envelope:/);
};
mutate(m=>{m.snapshotAt='2005-12-08'});
mutate(m=>{m.geometryStatus='verified-2005'});
mutate(m=>{m.outputsAreHistoricalGroundTruth=true});
mutate(m=>{m.trainingUseAuthorization='authorized'});
mutate(m=>{m.trainingDataApproved=true});
mutate(m=>{m.modelsExecuted.push('matrix-game')});
mutate(m=>{m.capture.width=512});
mutate(m=>{m.capture.fovDeg=55});
mutate(m=>{m.capture.depthEncoding='8bit-grayscale-distance'});
mutate(m=>{m.cameras[0].positionM[0]=-5});
mutate(m=>{m.cameras[0].poseStatus='calibrated-2005-photo'});
mutate(m=>{m.identity[1].bin='UNKNOWN_BIN'});
mutate(m=>{m.identity[1].versionId='invented-1995-version'});
mutate(m=>{m.observedVisibleBuildingIds.push(999999)});
mutate(m=>{m.captures[0].filename='../outside.png'});
mutate(m=>{m.captures[0].sha256='0'.repeat(64); m.captures[0].width=400});
mutate(m=>{m.captures[0].pass='building-id'});
mutate(m=>{m.cityManifestSha256='0'.repeat(64)});
mutate(m=>{m.buildingVersionsSha256='0'.repeat(64)});

const corrupted=new Map();
const first=manifest.captures[0].filename;
const originalFrame=await frameReader(first);
const altered=Buffer.from(originalFrame);
altered[altered.length-1]^=1;
corrupted.set(first,altered);
await assert.rejects(
 ()=>verifyFrameHashes(manifest,name=>
  corrupted.has(name)?Promise.resolve(corrupted.get(name)):frameReader(name)),
 /frame content\/hash mismatch/);
const alteredManifest=Buffer.from(JSON.stringify({...manifest,outputCount:0}));
assert.throws(
 ()=>buildConditioningEnvelope(manifest,versions,source,alteredManifest),
 /capture manifest bytes differ/);
const json=JSON.stringify(envelope,null,2)+'\n';
assert(!json.includes('init_image_hex')&&!json.includes('base64'),
 'No image pixels or proprietary provider fields in metadata');
await writeFile(fromOut('conditioning-envelope-v1.json'),json,{flag:'wx'});
console.log('PASS Phase 016 conditioning envelope:',{
 schema:ENVELOPE_SCHEMA,frames:manifest.captures.length,
 captureWaypoints:envelope.frames.length,
 crosswalkEntries:envelope.buildingIdentity.crosswalk.length,
 visibleBuildingIds:envelope.buildingIdentity.observedVisibleIndices.length,
 sourceCitySha256:source.cityManifestSha256,
 sourceBuildingVersionsSha256:source.buildingVersionsSha256,
 frameHashesVerified:9,negativeManifestCases:19,
 negativeByteCases:1,negativeManifestProvenanceCases:1,
 modelInvocations:0,authorizedTraining:false,
 envelopeSha256:sha256(Buffer.from(json))
});
