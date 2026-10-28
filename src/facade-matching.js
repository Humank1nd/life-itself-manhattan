// Life Itself — Times Square image-to-building proposal contract, not identity inference.
// Per-photo geotags are landmarks unless independently calibrated camera poses exist.
export const MATCH_SCHEMA='life-itself-facade-matches/1.0.0';
export const VERSIONS_SCHEMA='life-itself-building-versions/1.0.0';
const validBin = x => typeof x==='string' && /^1\d{6}$/.test(x);
const isDate = x=>typeof x==='string' && /^\d{4}-\d\d-\d\d$/.test(x) &&
 !Number.isNaN(Date.parse(x)) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function check(cond,m){if(!cond)throw new Error('facade matching: '+m);}
const finite=n=>Number.isFinite(n);
export function validateBuildingVersions(doc){
 check(doc?.schemaVersion===VERSIONS_SCHEMA&&doc.worldId==='life-itself:manhattan','version registry');
 check(Array.isArray(doc.entities)&&Array.isArray(doc.versions),'entities or versions not arrays');
 const entityIds=new Set(),versionIds=new Set();
 for(const e of doc.entities){
  check(typeof e.id==='string' && /^[a-z0-9-]{3,80}$/.test(e.id) && !entityIds.has(e.id),'entity ID');
  entityIds.add(e.id);check(e.currentBin===null || validBin(e.currentBin),'current BIN');
  check(Array.isArray(e.predecessorEntityIds)&&Array.isArray(e.successorEntityIds),'historical edges missing');
 }
 for(const e of doc.entities)for(const id of [...e.predecessorEntityIds,...e.successorEntityIds]){
  check(entityIds.has(id)&&id!==e.id,'historical edge points to invalid entity');
 }
 for(const v of doc.versions){
  check(typeof v.id==='string'&&!versionIds.has(v.id),'version ID duplicate');
  versionIds.add(v.id);
  check(entityIds.has(v.entityId),'unknown building entity');
  check(v.bin===null||validBin(v.bin),'bad version BIN');
  check(['current-snapshot','documented-range'].includes(v.validityStatus),'bad version status');
  check(v.validFrom===null||isDate(v.validFrom),'validFrom');
  check(v.validTo===null||isDate(v.validTo),'validTo');
  check(v.validTo===null||v.validFrom===null||v.validFrom<v.validTo,'reversed validity range');
  if(v.validityStatus==='documented-range') check(v.validFrom!==null&&
   typeof v.source?.url==='string'&&v.source.url.startsWith('https://')&&
   typeof v.source?.title==='string'&&v.source.title.length>0,'documented range requires independent archival source');
  if(v.validityStatus==='current-snapshot')check(isDate(v.snapshotAt),'snapshot date required');
  check(v.geometry?.type==='footprint'&&Array.isArray(v.geometry.rings)&&v.geometry.rings.length>0,'missing geometry');
 }
 return {entities:entityIds.size,versions:versionIds.size};
}
export function validAt(v,date){
 if(!isDate(date))return false;
 // Current inventory is not retroactive evidence of the building existing historically.
 return v.validityStatus==='documented-range' && v.validFrom<=date &&
   (v.validTo===null||date<v.validTo);
}
export function distanceToRing(x,z,ring){
 check(finite(x)&&finite(z)&&Array.isArray(ring),'invalid point or ring');
 let minimum=Infinity;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  const dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
  const t=len>0?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/len)):0;
  minimum=Math.min(minimum,Math.hypot(x-(a[0]+dx*t),z-(a[1]+dz*t)));
 }
 return minimum;
}
export function preliminaryCandidates(photo,registry,limit=6,maxRadiusM=165){
 check(photo?.location && finite(photo.location.x)&&finite(photo.location.z),'photo geotag missing');
 check(Number.isInteger(limit)&&limit>=1&&limit<=30,'candidate limit');
 const seen=new Set(),candidates=[];
 for(const v of registry.versions){
  if(v.validityStatus!=='current-snapshot'&&
      (photo.capturedAt&&!validAt(v,photo.capturedAt)))continue;
  const distance=Math.min(...v.geometry.rings.map(r=>distanceToRing(photo.location.x,photo.location.z,r)));
  if(distance>maxRadiusM)continue;
  if(seen.has(v.entityId))continue;
  seen.add(v.entityId);
  const prior=photo.capturedAt && v.constructionYear && Number(photo.capturedAt.slice(0,4))<v.constructionYear;
  if(prior)continue; // Built after photo => NOT a current building candidate. Historical predecessor is separate entity.
  candidates.push({versionId:v.id,entityId:v.entityId,bin:v.bin,
   footprintDistanceM:Math.round(distance*100)/100,
   interpretation:'unverified-geotag-to-footprint-proximity',
   evidence:'geotag is NOT necessarily camera location; no visual or orientation match'});
 }
 return candidates.sort((a,b)=>a.footprintDistanceM-b.footprintDistanceM||a.versionId.localeCompare(b.versionId)).slice(0,limit);
}
export function assessMatch({photo,instance,version,visual,pose,runnerUpScore=null}){
 const failures=[];
 const demand=(ok,code)=>{if(!ok)failures.push(code);};
 demand(isDate(photo?.capturedAt),'unknown-photo-date');
 demand(photo?.source?.url?.startsWith('https://') && photo?.rights!=='restricted','source-rights-unknown');
 demand(instance?.photoId===photo?.id && instance?.status==='machine-proposed-unreviewed','instance-unproven');
 demand(finite(instance?.segmentationConfidence)&&instance.segmentationConfidence>=0.90,'weak-instance-mask');
 demand(instance?.uniqueInstance===true,'unseparated-facade');
 demand(pose?.status==='calibrated'&&pose?.evidenceType==='independent-camera-survey'&&
  typeof pose?.evidenceUrl==='string'&&pose.evidenceUrl.startsWith('https://'),'camera-pose-not-independent');
 demand(finite(pose?.reprojectionRmsePx)&&pose.reprojectionRmsePx<=2.0,'pose-reprojection-error');
 demand(version?.validityStatus==='documented-range'&&validAt(version,photo?.capturedAt),'historical-version-not-verified');
 demand(finite(visual?.maskIoU)&&visual.maskIoU>=0.87,'insufficient-geometry-overlap');
 demand(finite(visual?.inlierCount)&&visual.inlierCount>=18,'insufficient-feature-inliers');
 demand(finite(visual?.inlierRatio)&&visual.inlierRatio>=0.72,'feature-ratio-too-low');
 demand(finite(visual?.visibleFraction)&&visual.visibleFraction>=0.60,'low-visibility');
 demand(visual?.independentSources>=2,'missing-independent-evidence');
 demand(visual?.verifiedFacadeProjection===true,'projected-facade-not-verified');
 const score=(finite(visual?.maskIoU)?visual.maskIoU:0)*0.38+
   (finite(visual?.inlierRatio)?visual.inlierRatio:0)*0.25+
   (finite(instance?.segmentationConfidence)?instance.segmentationConfidence:0)*0.16+
   (finite(visual?.visibleFraction)?visual.visibleFraction:0)*0.21;
 const rounded=Math.round(score*10000)/10000;
 demand(score>=0.93,'confidence-below-0.93');
 demand(finite(runnerUpScore)&&runnerUpScore>=0&&score-runnerUpScore>=0.15,'competitor-evaluation-missing-or-ambiguous');
 return {disposition:failures.length?'abstain':'automatically-accepted',
   score:rounded,failures,policy:'auto-accept-v1-strict-multisource',
   identityVerified:failures.length===0};
}
export function validateFacadeInstances(doc,photoIds){
 check(doc?.schemaVersion==='life-itself-facade-instances/1.0.0','instance registry');
 check(Array.isArray(doc.instances),'instances array');
 const ids=new Set();
 for(const i of doc.instances){
  check(typeof i.id==='string'&&!ids.has(i.id),'duplicate instance');
  ids.add(i.id);
  check(photoIds.has(i.photoId),'unknown photo ID');
  check(i.status==='machine-proposed-unreviewed','proposed-only instances');
  check(i.modelTrainingPermission==='unreviewed','cannot bypass training gate');
  check(finite(i.segmentationConfidence) && i.segmentationConfidence>=0&&i.segmentationConfidence<=1,'confidence 0..1');
  check(Array.isArray(i.bboxXYWH)&&i.bboxXYWH.length===4&&i.bboxXYWH.every(finite),'bounding box');
  check(typeof i.maskUri==='string' && /^assets\/evidence\/facades\/[a-z0-9-]+\.png$/.test(i.maskUri),'facade mask path');
  check(typeof i.maskSha256==='string'&&/^[a-f0-9]{64}$/.test(i.maskSha256),'mask checksum');
  check(i.uniqueInstance===true || i.uniqueInstance===false,'uniqueness required');
 }
 return {instances:ids.size};
}

// A complete alignment registry cannot promote proximity suggestions to truth.
export function validateFacadeMatches(doc,instances,versions,photoIds) {
 check(doc?.schemaVersion===MATCH_SCHEMA&&doc.worldId==='life-itself:manhattan','match registry');
 check(Array.isArray(doc.alignments),'alignment array');
 const instanceMap=new Map(instances.instances.map(i=>[i.id,i]));
 const versionIds=new Set(versions.versions.map(v=>v.id));
 const seen=new Set();
 let accepted=0,pairs=0;
 for(const row of doc.alignments){
  check(photoIds.has(row.photoId),'unknown photo');
  const instance=instanceMap.get(row.facadeRegionId);
  check(instance && instance.photoId===row.photoId,'facade photo mismatch');
  check(!seen.has(row.facadeRegionId),'duplicate aligned facade');
  seen.add(row.facadeRegionId);
  check(['abstain','automatically-accepted'].includes(row.disposition),'unsafe disposition');
  check(Array.isArray(row.candidates)&&row.candidates.length<=30,'candidate count invalid');
  check(typeof row.reason==='string'&&row.reason.length>0,'no decision rationale');
  const candidateIds=new Set();
  for(const c of row.candidates){
   check(versionIds.has(c.versionId)&&!candidateIds.has(c.versionId),'duplicate/unknown version candidate');
   candidateIds.add(c.versionId);
   check(c.interpretation==='unverified-geotag-to-footprint-proximity','candidate misrepresented');
   check(finite(c.footprintDistanceM)&&c.footprintDistanceM>=0,'distance invalid');
   check(['abstain','automatically-accepted'].includes(c.autoDecision?.disposition),'missing assessment');
   check(c.autoDecision.identityVerified===(c.autoDecision.disposition==='automatically-accepted'),'identity decision inconsistency');
   pairs++;
  }
  if(row.acceptedVersionId!==null){
   check(row.disposition==='automatically-accepted','unapproved match promoted');
   check(candidateIds.has(row.acceptedVersionId),'accepted version not proposed');
   const c=row.candidates.find(c=>c.versionId===row.acceptedVersionId);
   check(c.autoDecision.disposition==='automatically-accepted','unapproved decision promoted');
   accepted++;
  } else check(row.disposition==='abstain','acceptance without version');
 }
 return {alignments:seen.size,candidatePairs:pairs,accepted};
}

export function validateCorroboration(doc,photoIds,instanceIds,versionIds){
 check(doc?.schemaVersion==='life-itself-facade-corroboration/1.0.0'&&
  doc.worldId==='life-itself:manhattan','corroboration registry');
 check(Array.isArray(doc.records)&&doc.records.length<=2000,'corroboration size');
 const keys=new Set();
 for(const r of doc.records){
  check(photoIds.has(r.photoId)&&instanceIds.has(r.facadeRegionId)&&
    versionIds.has(r.versionId),'corroboration references invalid');
  const key=[r.photoId,r.facadeRegionId,r.versionId].join('|');
  check(!keys.has(key),'duplicate corroboration');
  keys.add(key);
  check(typeof r.photoSha256==='string'&&/^[a-f0-9]{64}$/.test(r.photoSha256),'missing original photo hash');
  check(r.pose?.evidenceType==='independent-camera-survey'&&
    typeof r.pose.evidenceUrl==='string'&&r.pose.evidenceUrl.startsWith('https://'),
    'pose source not independently attested');
  check(typeof r.visual?.featureEvidenceUrl==='string'&&r.visual.featureEvidenceUrl.startsWith('https://')&&
    typeof r.visual?.geometryEvidenceUrl==='string'&&r.visual.geometryEvidenceUrl.startsWith('https://')&&
    r.visual.featureEvidenceUrl!==r.visual.geometryEvidenceUrl,'nonindependent visual sources');
  check(Number.isFinite(r.runnerUpScore)&&r.runnerUpScore>=0&&r.runnerUpScore<=1,
    'runner-up must be assessed');
  check(r.reviewStatus==='independently-evidenced','no independent provenance status');
 }
 return {evidenceRecords:keys.size};
}
