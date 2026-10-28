// Life Itself — source-grounded spatial-memory address index.
// Research-informed design, original implementation; NOT PPMem weights or GEAR attention.
// Image geotags are candidate reference locations, never calibrated camera poses.
export const MEMORY_SCHEMA='life-itself-spatial-memory/1.0.0';
const safeDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(new Date(x+'T00:00:00Z').getTime())&&
 new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const bounded=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
const assert=(ok,why)=>{if(!ok)throw new Error('spatial-memory: '+why)};
const numericVec=(v,n=3)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export function validateSpatialMemory(doc){
 assert(doc?.schemaVersion===MEMORY_SCHEMA&&doc.worldId==='life-itself:manhattan','schema/world mismatch');
 assert(doc?.frame?.axes==='east/up/-north'&&doc.frame.originId==='twin-earth-times-square','frame mismatch');
 assert(doc?.policy?.training==='not-authorized'&&doc.policy.photoPose==='unverified-geotag'&&
  doc.policy.historicalGeometry==='snapshot-only','unsafe evidence policy');
 assert(Array.isArray(doc.planes)&&doc.planes.length<=50000,'planes');
 assert(Array.isArray(doc.photos)&&doc.photos.length<=2000,'photos');
 const planeIds=new Set(),photoIds=new Set();
 for(const p of doc.planes){
  assert(typeof p.id==='string'&&!planeIds.has(p.id),'plane id duplicate');
  planeIds.add(p.id);
  assert(/^nyc-bin-1\d{6}-observed-\d{8}$/.test(p.versionId)&&/^1\d{6}$/.test(p.bin),'plane historical identity');
  assert(p.sourceStatus==='current-snapshot-only'&&p.snapshotAt==='2026-10-28','plane snapshot boundary');
  assert(numericVec(p.a,2)&&numericVec(p.b,2)&&numericVec(p.center)&&
    numericVec(p.normal)&&bounded(p.heightM,0.1,1000),'plane geometry');
  assert(Math.abs(p.normal[1])<1e-5&&bounded(p.widthM,0.8,600),'surface dimensions');
 }
 for(const p of doc.photos){
  assert(/^commons-\d+$/.test(p.id)&&!photoIds.has(p.id),'photo id');
  photoIds.add(p.id);
  assert(bounded(p.year,1800,2100)&&safeDate(p.capturedAt)&&Number(p.capturedAt.slice(0,4))===p.year,'photo capture date');
  assert(numericVec(p.position)&&bounded(p.position[0],-30000,30000)&&
    bounded(p.position[2],-30000,30000),'photo coordinates');
  assert(p.locationBasis==='unverified-geotag'&&
    p.poseStatus==='not-calibrated'&&p.historicalBuildingMatch==='not-established','photo overclaim');
  assert(p.status==='catalog-candidate-unreviewed'||p.status==='local-image-source-unreviewed','photo status');
  assert(p.trainingPermission==='unreviewed','training gate');
  assert(typeof p.sourceUrl==='string'&&p.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:'),'photo attribution source');
  assert(typeof p.license==='string'&&p.license.length>0,'photo license missing');
 }
 return {planes:doc.planes.length,photos:doc.photos.length,
   photoYears:[...new Set(doc.photos.map(p=>p.year))].sort((a,b)=>a-b)};
}
export function createMemoryGrid(items,cellSize=80){
 assert(bounded(cellSize,10,1000),'cell size');
 const cells=new Map();
 for(const item of items){
  const p=item.center??item.position;
  assert(numericVec(p),'indexed vector missing');
  const key=Math.floor(p[0]/cellSize)+','+Math.floor(p[2]/cellSize);
  if(!cells.has(key))cells.set(key,[]);
  cells.get(key).push(item);
 }
 return {cells,cellSize};
}
function candidates(grid,focus,radius){
 const [cx,cz]=focus;
 const n=Math.ceil(radius/grid.cellSize),ix=Math.floor(cx/grid.cellSize),iz=Math.floor(cz/grid.cellSize);
 const found=[];
 for(let x=ix-n;x<=ix+n;x++)for(let z=iz-n;z<=iz+n;z++){
  for(const item of grid.cells.get(x+','+z)||[])found.push(item);
 }
 return found;
}
function centerDist(p,focus){return Math.hypot(p[0]-focus[0],p[2]-focus[1]);}
function inCameraCone(position,camera,lookAt,cosHalf=-1){
 if(!camera||!lookAt)return true; // explicit orientation missing: no visibility claim
 assert(numericVec(camera)&&numericVec(lookAt),'camera vectors');
 const d=lookAt.map((n,i)=>n-camera[i]);
 const v=position.map((n,i)=>n-camera[i]);
 const dLen=Math.hypot(...d),vLen=Math.hypot(...v);
 if(dLen<1e-6||vLen<1e-6)return true;
 const dot=d.reduce((acc,n,i)=>acc+n*v[i],0)/(dLen*vLen);
 return dot>=cosHalf;
}
export function createSpatialMemoryIndex(doc){
 const stats=validateSpatialMemory(doc);
 return {doc,stats,planes:createMemoryGrid(doc.planes),photos:createMemoryGrid(doc.photos)};
}
export function retrieveSpatialMemory(index,options){
 const year=options?.year,focus=options?.focus;
 assert(Number.isInteger(year)&&year>=1800&&year<=2100,'year required');
 assert(numericVec(focus,2),'2D focus required');
 const radius=options.radiusM??220;
 assert(bounded(radius,20,650),'radius safety bounds');
 const camera=options.camera??null,lookAt=options.lookAt??null;
 const cone=options.coneCos??-1;
 assert(bounded(cone,-1,1),'camera cone');
 const maxPhotos=options.maxPhotos??18,maxPlanes=options.maxPlanes??220;
 assert(Number.isInteger(maxPhotos)&&bounded(maxPhotos,1,50)&&
  Number.isInteger(maxPlanes)&&bounded(maxPlanes,1,500),'retrieval budgets');
 const near=(item)=>centerDist(item.center??item.position,focus)<=radius;
 const seen=new Set();
 const photos=candidates(index.photos,focus,radius).filter(p=>p.year===year&&near(p)&&
   inCameraCone(p.position,camera,lookAt,cone))
  .sort((a,b)=>centerDist(a.position,focus)-centerDist(b.position,focus)||a.id.localeCompare(b.id))
  .filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true}).slice(0,maxPhotos);
 // NYC source polygon snapshot is 2026 only. Never project it backward into 2005.
 const planes=(year===2026?candidates(index.planes,focus,radius).filter(p=>near(p)&&
  inCameraCone(p.center,camera,lookAt,cone)) : [])
  .sort((a,b)=>centerDist(a.center,focus)-centerDist(b.center,focus)||a.id.localeCompare(b.id))
  .slice(0,maxPlanes);
 return {
  year,focus,radiusM:radius,photos,planes,
  evidenceStatus:'candidate-retrieval-not-visual-correspondence',
  occlusion:'unknown',
  geometryStatus:year===2026?'current-2026-snapshot-only':'historical-geometry-unavailable',
  modelTrainingPermission:'not-authorized'
 };
}
