// Standalone, deterministic, geometry-first Times Square capture scene.
// Input: verified 2026 snapshot. Output: Three.js WebGL passes; no UI, photo, model, or remote API.
import * as THREE from 'three';

const WIDTH=640, HEIGHT=360, SNAPSHOT='2026-10-28';
const PASSES=new Set(['rgb','depth','building-id']);
const LOOK=[0,48,-22];
const CAMERA_PATH=[
  {position:[160,115,210],target:LOOK},
  {position:[140,115,210],target:LOOK},
  {position:[120,115,210],target:LOOK}
];
const schema='life-itself-cloud-capture/1.0.0';
const assert=(ok,msg)=>{if(!ok)throw new Error('Capture: '+msg)};

const renderer=new THREE.WebGLRenderer({
  antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'
});
renderer.setPixelRatio(1);
renderer.setSize(WIDTH,HEIGHT,false);
renderer.toneMapping=THREE.NoToneMapping;
renderer.shadowMap.enabled=false;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xacc6d8);
const camera=new THREE.PerspectiveCamera(62,WIDTH/HEIGHT,0.5,1400);
const hemi=new THREE.HemisphereLight(0xffffff,0x7d8791,2);
scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,1.2);
sun.position.set(-120,290,100);
scene.add(sun);

const meshes=[], identity={};
let loaded;
const depthMaterial=new THREE.ShaderMaterial({
  uniforms:{nearM:{value:camera.near},farM:{value:camera.far}},
  vertexShader:`
    varying float vCameraDepth;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      vCameraDepth=-mv.z;
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    varying float vCameraDepth;
    uniform float nearM;
    uniform float farM;
    void main(){
      // Camera-space Z in meters, encoded into 24 RGB bits (not z-buffer depth).
      float d=clamp((vCameraDepth-nearM)/(farM-nearM),0.0,0.999999);
      vec3 c=fract(d*vec3(1.0,256.0,65536.0));
      c-=c.yzz*vec3(1.0/256.0,1.0/256.0,0.0);
      gl_FragColor=vec4(c,1.0);
    }`,
  depthTest:true,depthWrite:true,toneMapped:false
});
const idMaterial=(id)=>{
  const r=(id>>16)&255,g=(id>>8)&255,b=id&255;
  const color=new THREE.Color().setRGB(r/255,g/255,b/255,THREE.LinearSRGBColorSpace);
  return new THREE.MeshBasicMaterial({color,toneMapped:false,depthTest:true,depthWrite:true});
};

const readJSON=async url=>{
 const response=await fetch(url,{cache:'no-store'});
 assert(response.ok,'source fetch failed '+url+' HTTP '+response.status);
 return response.json();
};
async function initialize(){
 const [manifest,versions]=await Promise.all([
  readJSON('/data/city-scene-v1.json'),
  readJSON('/data/times-square-building-versions-v1.json')
 ]);
 assert(manifest.worldId==='life-itself:manhattan'&&
   manifest.frame?.axes?.x==='east'&&manifest.frame?.axes?.y==='up'&&
   manifest.frame?.axes?.z==='-north','unexpected city coordinate frame');
 assert(versions.schemaVersion==='life-itself-building-versions/1.0.0'&&
   versions.worldId===manifest.worldId&&
   Array.isArray(versions.versions)&&versions.versions.length===622,'source building version mismatch');
 let skippedDegenerate=0,unsupportedMultipleRings=0;
 const buildings=[...versions.versions].sort((a,b)=>a.id.localeCompare(b.id));
 for(let i=0;i<buildings.length;i++){
  const v=buildings[i];
  assert(v.validityStatus==='current-snapshot'&&v.snapshotAt===SNAPSHOT&&
    v.validFrom===null&&v.validTo===null,'unverified historic geometry');
  assert(typeof v.bin==='string'&&v.bin.length>0,'missing BIN');
  const h=v.geometry?.heightM;
  assert(Number.isFinite(h)&&h>0&&h<1000,'invalid building height');
  const rings=v.geometry.rings;
  assert(Array.isArray(rings)&&rings.length>0,'missing footprint');
  if(rings.length>1)unsupportedMultipleRings++;
  const id=i+1;
  identity[id]={bin:v.bin,versionId:v.id,sourceStatus:'2026-current-snapshot-only'};
  const materials={
   rgb:new THREE.MeshLambertMaterial({
    color:new THREE.Color().setHSL(((i*19)%360)/360,0.14,0.53+Math.min(h/1200,0.18)),
    side:THREE.DoubleSide
   }),
   id:idMaterial(id)
  };
  for(const ring of rings){
   assert(Array.isArray(ring)&&ring.length>=4,'invalid ring');
   const points=ring.map(point=>{
     assert(Array.isArray(point)&&point.length===2&&point.every(Number.isFinite),'invalid coordinates');
     return new THREE.Vector2(point[0],-point[1]); // maps X/-Z into local XY.
   });
   if(points[0].distanceTo(points.at(-1))<1e-6)points.pop();
   if(points.length<3){skippedDegenerate++;continue;}
   const shape=new THREE.Shape(points);
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:h,steps:1,bevelEnabled:false,curveSegments:1});
   geometry.rotateX(-Math.PI/2); // extruded local +Z becomes world +Y.
   const mesh=new THREE.Mesh(geometry,materials.rgb);
   mesh.userData={id,materials,versionId:v.id};
   meshes.push(mesh);
   scene.add(mesh);
  }
 }
 assert(meshes.length>=600,'unexpectedly few building meshes');
 loaded={
  schemaVersion:schema,snapshotAt:SNAPSHOT,worldId:manifest.worldId,
  frame:{axes:['east','up','-north'],units:'meters',origin:manifest.frame.origin},
  geometrySource:'data/times-square-building-versions-v1.json',
  geometryStatus:'current-snapshot-only',
  geometryLimitations:{footprintsAreExtruded2D:true,
   multiRingPolygonsNotClassifiedAsHoles:unsupportedMultipleRings,
   degenerateRingsSkipped:skippedDegenerate,
   noPhotographicFacades:true,noHistoricalReconstruction:true},
  buildingVersions:buildings.length,meshes:meshes.length,identity,
  capture:{width:WIDTH,height:HEIGHT,fovDeg:camera.fov,
   nearM:camera.near,farM:camera.far,pixelRatio:1,antialias:false,
   depthEncoding:'linear-camera-z-rgb24-near-far',
   idEncoding:'rgb24-id-0-background',
   rgbEncoding:'sRGB-PNG-no-HUD',
   timeOfDay:'fixed-studio-illumination-not-surveyed'},
  cameras:CAMERA_PATH.map((p,i)=>({index:i,positionM:[...p.position],
   targetM:[...p.target],up:[0,1,0],
   poseStatus:'synthetic-demo-camera-not-photographic-pose'})),
  modelsExecuted:[],trainingDataApproved:false,
  renderOrigin:'Three.js authoritative current 2026 building snapshot'
 };
 window.__captureReady=true;
}
window.__captureReady=false;
window.__captureError=null;
window.__captureInfo=()=>loaded;
window.__captureFrame=(index,pass)=>{
 assert(window.__captureReady,'scene not initialized');
 assert(Number.isInteger(index)&&index>=0&&index<CAMERA_PATH.length,'camera index');
 assert(PASSES.has(pass),'unknown pass');
 const pose=CAMERA_PATH[index];
 camera.position.set(...pose.position);
 camera.up.set(0,1,0);
 camera.lookAt(...pose.target);
 camera.updateProjectionMatrix();
 camera.updateMatrixWorld(true);
 const originalBackground=scene.background;
 const originalOutput=renderer.outputColorSpace;
 try{
  scene.background=pass==='rgb'?new THREE.Color(0xacc6d8):new THREE.Color(0x000000);
  renderer.outputColorSpace=pass==='rgb'?THREE.SRGBColorSpace:THREE.LinearSRGBColorSpace;
  if(pass==='building-id')for(const m of meshes)m.material=m.userData.materials.id;
  if(pass==='depth')scene.overrideMaterial=depthMaterial;
  renderer.clear();
  renderer.render(scene,camera);
  const url=renderer.domElement.toDataURL('image/png');
  assert(url.startsWith('data:image/png;base64,'),'PNG export unavailable');
  return url.slice('data:image/png;base64,'.length);
 }finally{
  scene.overrideMaterial=null;
  for(const m of meshes)m.material=m.userData.materials.rgb;
  scene.background=originalBackground;
  renderer.outputColorSpace=originalOutput;
 }
};
initialize().catch(err=>{
 window.__captureError=String(err?.stack||err);
 console.error('Cloud capture initialize failed',err);
});
