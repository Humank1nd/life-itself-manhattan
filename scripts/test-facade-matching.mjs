import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {validateBuildingVersions,validateFacadeInstances,validateCorroboration,validateFacadeMatches,preliminaryCandidates,assessMatch,validAt,MATCH_SCHEMA} from '../src/facade-matching.js';
const root=new URL('../',import.meta.url);
const load=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const evidence=load('data/evidence-v1.json'),registry=load('data/times-square-building-versions-v1.json');
const instances=load('data/facade-instances-v1.json'),matches=load('data/facade-matches-v1.json');
assert.equal(registry.versions.length,622);
assert.deepEqual(validateBuildingVersions(registry),{entities:622,versions:622});
assert.deepEqual(validateFacadeInstances(instances,new Set(evidence.photos.map(p=>p.id))),{instances:16});
assert.equal(matches.schemaVersion,MATCH_SCHEMA);
const originalCorroboration=load('data/facade-corroboration-v1.json');
const pids=new Set(evidence.photos.map(p=>p.id)),
 iids=new Set(instances.instances.map(i=>i.id)),vids=new Set(registry.versions.map(v=>v.id));
assert.deepEqual(validateCorroboration(originalCorroboration,pids,iids,vids),{evidenceRecords:0});
assert.deepEqual(validateFacadeMatches(matches,instances,registry,pids),{alignments:16,candidatePairs:96,accepted:0});
assert.equal(matches.alignments.length,16);
assert.equal(matches.alignments.reduce((s,m)=>s+m.candidates.length,0),96);
assert.ok(matches.alignments.every(m=>m.disposition==='abstain'&&m.acceptedVersionId===null));
const instanceIds=new Set(instances.instances.map(x=>x.id));
const photoIds=new Set(evidence.photos.map(x=>x.id));
for(const i of instances.instances) {
 const file=resolve(new URL('..',import.meta.url).pathname,i.maskUri);
 const buffer=readFileSync(file);
 assert.ok(buffer.length>100);
 assert.equal(createHash('sha256').update(buffer).digest('hex'),i.maskSha256);
 assert.equal(i.uniqueInstance,false);
}
for(const m of matches.alignments) {
 assert.ok(photoIds.has(m.photoId)&&instanceIds.has(m.facadeRegionId));
 assert.ok(m.candidates.length<=6);
 assert.ok(m.candidates.every(c=>c.autoDecision.disposition==='abstain'&&
   c.autoDecision.failures.includes('camera-pose-not-independent')));
 assert.ok(m.candidates.every(c=>Number.isFinite(c.footprintDistanceM)));
}
const first=evidence.photos[0];
const proposal=preliminaryCandidates(first,registry,6,165);
assert.ok(proposal.length>0 && proposal.every(x=>x.footprintDistanceM<=165));
assert.ok(proposal.every(x=>!('probability' in x)),'proximity cannot be probability');
const version=structuredClone(registry.versions.find(v=>v.id===proposal[0].versionId));
const instance=structuredClone(instances.instances.find(x=>x.photoId===first.id));
const pose={status:'calibrated',evidenceType:'independent-camera-survey',evidenceUrl:'https://example.org/synthetic-camera-fixture',
 reprojectionRmsePx:0.8};
const visual={maskIoU:.98,inlierCount:42,inlierRatio:.99,visibleFraction:.98,independentSources:2,
 verifiedFacadeProjection:true};
instance.uniqueInstance=true;instance.segmentationConfidence=.99;
version.validityStatus='documented-range';
version.validFrom='1990-01-01';version.validTo='2010-01-01';
version.source={title:'SYNTHETIC DOCUMENTED BUILDING FIXTURE',url:'https://example.org/synthetic-building'};
assert.ok(validAt(version,first.capturedAt));
function field(obj,key,def){return Object.hasOwn(obj,key)?obj[key]:def;}
function run(opts={}) {return assessMatch({photo:field(opts,'photo',first),instance:field(opts,'instance',instance),
 version:field(opts,'version',version),visual:field(opts,'visual',visual),pose:field(opts,'pose',pose),
 runnerUpScore:field(opts,'runnerUpScore',.7)});}
const accepted=run();
assert.equal(accepted.disposition,'automatically-accepted');
assert.ok(accepted.score>=.93);
let test=run({runnerUpScore:.90});
assert.equal(test.disposition,'abstain');
assert.ok(test.failures.includes('competitor-evaluation-missing-or-ambiguous'));
test=run({runnerUpScore:null});
assert.ok(test.failures.includes('competitor-evaluation-missing-or-ambiguous'));
test=run({pose:{...pose,status:'unknown'}});
assert.ok(test.failures.includes('camera-pose-not-independent'));
test=run({instance:{...instance,uniqueInstance:false}});
assert.ok(test.failures.includes('unseparated-facade'));
test=run({version:{...version,validityStatus:'current-snapshot',validFrom:null}});
assert.ok(test.failures.includes('historical-version-not-verified'));
test=run({version:{...version,validFrom:'2010-01-01'}});
assert.ok(test.failures.includes('historical-version-not-verified'));
test=run({visual:{...visual,inlierCount:4}});
assert.ok(test.failures.includes('insufficient-feature-inliers'));
test=run({visual:{...visual,independentSources:1}});
assert.ok(test.failures.includes('missing-independent-evidence'));
test=run({pose:null});
assert.ok(test.failures.includes('camera-pose-not-independent'));
test=run({visual:null});
assert.ok(test.failures.includes('confidence-below-0.93'));
const noPose=run({pose:{status:'calibrated',reprojectionRmsePx:0.4,evidenceType:'user-upload',evidenceUrl:'https://example.org/test'}});
assert.ok(noPose.failures.includes('camera-pose-not-independent'));
// Historical predecessor relation: a wholly separate identity and independent date range.
const historical=structuredClone(registry);
const successor=historical.entities[0];
historical.entities.push({id:'historical-predecessor-synthetic',currentBin:null,
 predecessorEntityIds:[],successorEntityIds:[successor.id],historyStatus:'synthetic-fixture'});
successor.predecessorEntityIds.push('historical-predecessor-synthetic');
historical.versions.push({...version,id:'historical-1910-synthetic',
 entityId:'historical-predecessor-synthetic',bin:null,
 validFrom:'1901-01-01',validTo:'1920-01-01',
 geometry:{...version.geometry}});
assert.deepEqual(validateBuildingVersions(historical),{entities:623,versions:623});
assert.equal(validAt(historical.versions.at(-1),'1910-05-01'),true);
assert.equal(validAt(historical.versions.at(-1),'2020-01-01'),false);
const corroborated={...originalCorroboration,records:[{photoId:first.id,facadeRegionId:instance.id,
 versionId:version.id,photoSha256:first.sha256,pose,
 visual:{...visual,featureEvidenceUrl:'https://example.org/synthetic-feature-run',
 geometryEvidenceUrl:'https://example.org/synthetic-geometry-run'},runnerUpScore:0.7,
 reviewStatus:'independently-evidenced'}]};
assert.deepEqual(validateCorroboration(corroborated,pids,iids,new Set([...vids,version.id])),{evidenceRecords:1});
const badCorroboration=structuredClone(corroborated);
badCorroboration.records[0].visual.geometryEvidenceUrl=badCorroboration.records[0].visual.featureEvidenceUrl;
assert.throws(()=>validateCorroboration(badCorroboration,pids,iids,new Set([...vids,version.id])));
assert.throws(()=>validateBuildingVersions({...registry,versions:[...registry.versions,{...version,id:'bad-version',validFrom:'2020-01-01',validTo:'2000-01-01'}]}));
console.log('PASS: 622 current snapshots + 16 panoptic facade proposals + 96 unverified pairs => 0 false auto accepts; synthetic positive and adversarial gates');
