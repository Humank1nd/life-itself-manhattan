// Source-aware, budgeted spatial-memory viewer. Never generates historical images.
import {createSpatialMemoryIndex,retrieveSpatialMemory} from './spatial-memory.js';
import {createTimesSquareConditioning} from './world-model-conditioning.js';
export function mountSpatialMemoryViewer({THREE,scene,camera,controls,documentRef=document,
 memory,evidence,yearProvider=()=>2026}){
 const index=createSpatialMemoryIndex(memory);
 const status=documentRef.getElementById('spatial-memory-status');
 const button=documentRef.getElementById('spatial-memory-retrieve');
 const focusButton=documentRef.getElementById('spatial-memory-focus');
 const geometry=documentRef.getElementById('spatial-memory-geometry');
 const results=documentRef.getElementById('spatial-memory-results');
 const pilotButton=documentRef.getElementById('world-model-prepare');
 const pilotStatus=documentRef.getElementById('world-model-status');
 if(!status||!button||!focusButton||!geometry||!results||!pilotButton||!pilotStatus)throw new Error('spatial memory panel missing');
 let rendered=null,lastResult=null,lastPacket=null;
 const clearGeometry=()=>{
  if(!rendered)return;
  scene.remove(rendered);
  rendered.geometry.dispose();rendered.material.dispose();rendered=null;
 };
 function drawGeometry(result){
  clearGeometry();
  if(!geometry.checked||!result.planes.length)return;
  const vertices=[];
  for(const p of result.planes){
   const [x,z]=p.a,[xx,zz]=p.b,h=p.heightM;
   vertices.push(x,0,z,xx,0,zz,xx,0,zz,xx,h,zz,
     xx,h,zz,x,h,z,x,h,z,x,0,z);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  rendered=new THREE.LineSegments(g,new THREE.LineBasicMaterial({
   color:0xffca73,transparent:true,opacity:0.70,depthWrite:false
  }));
  rendered.renderOrder=5;
  scene.add(rendered);
 }
 function retrieve(){
  const focus=[controls.target.x,controls.target.z];
  const front=new THREE.Vector3();camera.getWorldDirection(front);
  const direction=[camera.position.x+front.x*250,camera.position.y+front.y*250,camera.position.z+front.z*250];
  const result=retrieveSpatialMemory(index,{year:yearProvider(),focus,
   camera:[camera.position.x,camera.position.y,camera.position.z],lookAt:direction,
   coneCos:Math.cos((camera.fov*Math.PI/180)/2+0.25),
   radiusM:320,maxPhotos:18,maxPlanes:220});
  lastResult=result;
  status.textContent=result.photos.length+' dated photo reference(s) in the approximate view · '+
   result.planes.length+' current building plane(s) retrieved · year '+result.year+
   '. Historical geometric consistency and visibility unverified.';
  geometry.disabled=result.year!==2026;
  if(geometry.disabled)geometry.checked=false;
  results.replaceChildren();
  if(!result.photos.length){
   const empty=documentRef.createElement('p');
   empty.textContent='No dated photo candidates in this view and year. No reconstruction is inferred.';
   results.append(empty);
  } else {
   for(const p of result.photos){
    const row=documentRef.createElement('div');row.className='spatial-memory-result';
    const link=documentRef.createElement('a');link.href=p.sourceUrl;
    link.rel='noopener noreferrer';link.target='_blank';
    link.textContent=p.capturedAt+' · '+p.id;
    row.append(link);
    const provenance=documentRef.createElement('span');
    provenance.textContent=p.status==='catalog-candidate-unreviewed'?
      'Catalog-only · geotag not surveyed':'Local image · camera pose unknown';
    row.append(provenance);results.append(row);
   }
  }
  drawGeometry(result);
  return result;
 }
 button.addEventListener('click',retrieve);
 pilotButton.addEventListener('click',()=>{
  lastPacket=null;
  if(yearProvider()!==2005){
   pilotStatus.textContent='Select 2005 in the timeline first. No model was contacted.';
   return;
  }
  const packet=createTimesSquareConditioning(memory,evidence,{year:2005});
  lastPacket=packet;
  pilotStatus.textContent='Prepared source '+packet.photo.id+' ('+packet.photo.capturedAt+
   '), '+packet.camera.providerWaypointsCm.length+
   ' controlled camera waypoints. Historic geometry: unavailable. Local inference is disabled until the weights and reuse review gates pass. No request sent.';
 });
 geometry.addEventListener('change',()=>{if(lastResult)drawGeometry(lastResult);else retrieve();});
 focusButton.addEventListener('click',()=>{
  // No camera flight or game state mutation; focus only in local view controller.
  const offset=new THREE.Vector3(450,350,650);
  controls.target.set(0,0,0);
  camera.position.copy(offset);
  controls.update();
  retrieve();
 });
 const summary=()=>({indexedPhotos:index.stats.photos,indexedPlanes:index.stats.planes,
  lastYear:lastResult?.year??null,
  lastPhotos:lastResult?.photos.length??0,
  lastPlanes:lastResult?.planes.length??0,
  historicalGeometryShown:!!lastResult&&lastResult.year!==2026&&lastResult.planes.length>0,
  pilotPrepared:!!lastPacket,pilotPhotoId:lastPacket?.photo.id??null,pilotWaypointCount:lastPacket?.camera.providerWaypointsCm.length??0});
 status.textContent='Ready: '+index.stats.photos+' dated photo references and '+
   index.stats.planes+' current geometry planes indexed. Select year, focus and retrieve.';
 return {retrieve,summary,onYearChanged:()=>{clearGeometry();lastResult=null;lastPacket=null;
  pilotStatus.textContent='No conditioning packet prepared. No world-model generation is active.';
  geometry.checked=false;
  geometry.disabled=yearProvider()!==2026;
  status.textContent='Year changed to '+yearProvider()+'. Retrieve this view to update memory.';
  results.replaceChildren();},
  dispose:clearGeometry};
}
