import {readFileSync,writeFileSync}from'node:fs';
import {validateBuildingVersions,validateFacadeInstances,validateCorroboration,
validateFacadeMatches,preliminaryCandidates,assessMatch,MATCH_SCHEMA}from'../src/facade-matching.js';
const root=new URL('../',import.meta.url);
const load=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const photos=load('data/evidence-v1.json').photos;
const instances=load('data/facade-instances-v1.json');
const versions=load('data/times-square-building-versions-v1.json');
const attestations=load('data/facade-corroboration-v1.json');
const photoIds=new Set(photos.map(p=>p.id));
const instanceIds=new Set(instances.instances.map(i=>i.id));
const versionIds=new Set(versions.versions.map(v=>v.id));
validateBuildingVersions(versions);
validateFacadeInstances(instances,photoIds);
validateCorroboration(attestations,photoIds,instanceIds,versionIds);
const evidenceByKey=new Map(attestations.records.map(r=>[[r.photoId,r.facadeRegionId,r.versionId].join('|'),r]));
const versionById=new Map(versions.versions.map(v=>[v.id,v]));
const matches=[];
for(const photo of photos){
 const nearby=preliminaryCandidates(photo,versions,6,165);
 for(const region of instances.instances.filter(i=>i.photoId===photo.id)){
   const candidates=nearby.map(n=>{
     const v=versionById.get(n.versionId);
     const evidence=evidenceByKey.get([photo.id,region.id,v.id].join('|'));
     // Fail closed on absent independently sourced camera/feature evidence.
     const trustworthy=evidence?.photoSha256===photo.sha256&&
      evidence?.reviewStatus==='independently-evidenced';
     const decision=assessMatch({photo,instance:region,version:v,
       visual:trustworthy?evidence.visual:null,
       pose:trustworthy?evidence.pose:null,
       runnerUpScore:trustworthy?evidence.runnerUpScore:null});
     return {...n,autoDecision:decision};
   });
   const passed=candidates.filter(c=>c.autoDecision.disposition==='automatically-accepted');
   const winner=passed.length===1?passed[0]:null;
   matches.push({photoId:photo.id,facadeRegionId:region.id,
    disposition:winner?'automatically-accepted':'abstain',
    reason:winner?'strict independent camera, unique facade, documented history and visual evidence passed':
      'No unique candidate cleared independent pose, per-facade visual, documented historic version and competitor gates.',
    candidates,acceptedVersionId:winner?.versionId||null,
    needs:winner?[]:['individually established facade region','independent calibrated camera pose',
      'feature + 3D geometry correspondence and runner-up evaluation',
      'documented historical building-version validity']});
 }
}
const doc={schemaVersion:MATCH_SCHEMA,worldId:'life-itself:manhattan',
 policy:'Only verified independent provenance/pose/visual/historical range and unique winning match can promote. No geotag proximity auto-accept.',
 generatedFrom:{evidence:'data/evidence-v1.json',instances:'data/facade-instances-v1.json',
  versions:'data/times-square-building-versions-v1.json',
  corroboration:'data/facade-corroboration-v1.json'},
 alignments:matches};
const metrics=validateFacadeMatches(doc,instances,versions,photoIds);
writeFileSync(new URL('data/facade-matches-v1.json',root),JSON.stringify(doc,null,2)+'\n');
console.log('PASS: façade match evaluation',metrics);
