// Deterministic manifest of observed images + current city planes.
// No learned geometry, trained model, scene hallucination, or camera calibration.
import {readFileSync,writeFileSync} from 'node:fs';
import {fallbackCatalogEnu} from '../src/photo-catalog.js';
import {validateSpatialMemory,MEMORY_SCHEMA} from '../src/spatial-memory.js';
const base=new URL('../',import.meta.url);
const load=name=>JSON.parse(readFileSync(new URL(name,base),'utf8'));
const buildings=load('data/times-square-building-versions-v1.json');
const evidence=load('data/evidence-v1.json');
const catalog=load('data/photo-catalog-v1.json');
const origin=load('data/city-scene-v1.json').frame.origin;
const planes=[];
for(const v of buildings.versions){
 if(v.validityStatus!=='current-snapshot'||v.snapshotAt!=='2026-10-28')continue;
 for(let ringNo=0;ringNo<v.geometry.rings.length;ringNo++){
  const ring=v.geometry.rings[ringNo];
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   const dx=b[0]-a[0],dz=b[1]-a[1],width=Math.hypot(dx,dz);
   if(width<0.8)continue; // no degenerate plane
   const height=v.geometry.heightM??0;
   if(!Number.isFinite(height)||height<0.1)continue;
   planes.push({
    id:v.id+'-r'+ringNo+'-e'+i,versionId:v.id,bin:v.bin,
    a,b,center:[Math.round((a[0]+b[0])*500)/1000,
      Math.round(height*500)/1000,Math.round((a[1]+b[1])*500)/1000],
    normal:[-dz/width,0,dx/width],widthM:Math.round(width*100)/100,
    heightM:height,snapshotAt:v.snapshotAt,
    sourceStatus:'current-snapshot-only'
   });
  }
 }
}
const photos=[];
for(const p of evidence.photos){
 if(!p.location||!p.capturedAt)continue;
 photos.push({id:p.id,year:Number(p.capturedAt.slice(0,4)),capturedAt:p.capturedAt,
  position:[p.location.x,p.location.y,p.location.z],
  locationBasis:'unverified-geotag',poseStatus:'not-calibrated',
  historicalBuildingMatch:'not-established',status:'local-image-source-unreviewed',
  trainingPermission:'unreviewed',sourceUrl:p.source.url,
  license:p.license?.label??'Unknown',sourceKind:'local-evidence'});
}
const ids=new Set(photos.map(p=>p.id));
for(const p of catalog.records){
 if(!p.capturedAt||!p.location||ids.has(p.id))continue;
 const projected=fallbackCatalogEnu(origin,p.location.lat,p.location.lon,origin.elev);
 photos.push({id:p.id,year:Number(p.capturedAt.slice(0,4)),capturedAt:p.capturedAt,
  position:[Math.round(projected[0]*1000)/1000,
   Math.round(projected[2]*1000)/1000,Math.round(-projected[1]*1000)/1000],
  locationBasis:'unverified-geotag',poseStatus:'not-calibrated',
  historicalBuildingMatch:'not-established',status:'catalog-candidate-unreviewed',
  trainingPermission:'unreviewed',sourceUrl:p.sourceUrl,
  license:p.license.label,sourceKind:'catalog-preview'});
}
planes.sort((a,b)=>a.id.localeCompare(b.id));
photos.sort((a,b)=>a.id.localeCompare(b.id));
const out={
 schemaVersion:MEMORY_SCHEMA,worldId:'life-itself:manhattan',
 frame:{axes:'east/up/-north',originId:'twin-earth-times-square'},
 sourceReferences:{geometry:'data/times-square-building-versions-v1.json',
  localPhotos:'data/evidence-v1.json',catalog:'data/photo-catalog-v1.json'},
 policy:{training:'not-authorized',photoPose:'unverified-geotag',
  historicalGeometry:'snapshot-only',rendering:'metadata-and-current-geometry-only'},
 planes,photos
};
const stats=validateSpatialMemory(out);
writeFileSync(new URL('data/spatial-memory-v1.json',base),JSON.stringify(out)+'\n');
console.log('PASS: spatial memory index',stats,'in bytes',
 readFileSync(new URL('data/spatial-memory-v1.json',base)).length);
