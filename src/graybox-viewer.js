// S3-002 isolated presentation of the city-owned Broad Street pilot.
// Not a replacement for Muse's main wireframe or navigation/collision runtime.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLivingCity, establishAlley } from './living-city.js';
import { buildGroundedBlock, auditBlock, partitionBlockSidewalks } from './grounded-block.js';

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x080e17);
scene.fog=new THREE.Fog(0x080e17,200,570);
const camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,0.05,1000);
camera.position.set(160,260,245);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
document.body.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);
orbit.target.set(0,4,0);
orbit.minDistance=9;orbit.maxDistance=550;orbit.maxPolarAngle=Math.PI/2.03;
orbit.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xcee4ff,0x263042,2.5));
const sun=new THREE.DirectionalLight(0xe6f3ff,2.5);
sun.position.set(90,135,60);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(182,182),
  new THREE.MeshStandardMaterial({color:0x1f3041,roughness:0.96}));
ground.rotation.x=-Math.PI/2;
ground.position.y=-0.12;scene.add(ground);
const grid=new THREE.GridHelper(180,18,0x395267,0x2a4051);scene.add(grid);
const status=document.getElementById('status'),metrics=document.getElementById('metrics');
let block=null,audit=null;

function showBlock(source){
  const mid=source.center;
  const toLocal=(x,z,y=0)=>new THREE.Vector3(x-mid.x,y,z-mid.z);
  // These shapes are the map's real ENU outline positions, not hand-made
  // urban decoration. Display height is clamped at 55m for legibility.
  const obstacleMaterial=new THREE.MeshStandardMaterial({
    color:0x7895b6,roughness:0.92,transparent:true,opacity:0.31,
    depthWrite:false,side:THREE.DoubleSide,
  });
  const edgeMaterial=new THREE.LineBasicMaterial({color:0x9cb7d0,transparent:true,opacity:0.68,depthTest:false});
  for(const b of source.buildings){
    const ring=b.rings[0];
    if(!ring?.length)continue;
    const shape=new THREE.Shape();
    for(let i=0;i<ring.length;i++){
      const x=ring[i][0]-mid.x,z=ring[i][1]-mid.z;
      if(i===0)shape.moveTo(x,-z);else shape.lineTo(x,-z);
    }
    shape.closePath();
    const geom=new THREE.ExtrudeGeometry(shape,{depth:Math.min(b.heightM,22),bevelEnabled:false,steps:1});
    geom.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geom,obstacleMaterial);
    mesh.userData.sourceBin=b.id;
    mesh.renderOrder=1;scene.add(mesh);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geom),edgeMaterial);
    edges.renderOrder=3;scene.add(edges);
  }
  const clearMaterial=new THREE.LineBasicMaterial({color:0x55d9ff,depthTest:false});
  const blockedMaterial=new THREE.LineBasicMaterial({color:0xff604f,depthTest:false});
  const roadSlices=partitionBlockSidewalks(source);
  for(const lane of roadSlices){
    const geo=new THREE.BufferGeometry().setFromPoints([lane.from,lane.to].map(p=>toLocal(...p,0.5)));
    const line=new THREE.Line(geo,lane.status==='candidate-clear'?clearMaterial:blockedMaterial);
    line.userData.laneId=lane.laneId;
    line.userData.laneDisplayStatus=lane.status;
    line.renderOrder=7;scene.add(line);
  }
  const markerGeom=new THREE.SphereGeometry(1.4,10,8);
  const markerMat=new THREE.MeshBasicMaterial({color:0xff604f,depthTest:false});
  // Display one warning marker every 3 audited conflict samples;
  // evidence retains every conflict, and no lane is silently cleared.
  for(let i=0;i<audit.conflicts.length;i+=3){
    const error=audit.conflicts[i];
    const dot=new THREE.Mesh(markerGeom,markerMat);
    dot.position.copy(toLocal(error.x,error.z,1.8));
    dot.renderOrder=12;scene.add(dot);
  }
  for(const object of source.features){
    // Simulator-owned props are grounded spatially in current lane data,
    // but they are NOT a claim of actual Manhattan dumpster placement.
    const prop=new THREE.Group();
    const box=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.6,1.4),
      new THREE.MeshBasicMaterial({color:0xd9a735,depthTest:false}));
    box.position.y=0.8;prop.add(box);
    const top=new THREE.Mesh(new THREE.BoxGeometry(2.8,0.18,1.6),
      new THREE.MeshBasicMaterial({color:0xffd166,depthTest:false}));
    top.position.y=1.62;top.renderOrder=17;box.renderOrder=16;prop.add(top);
    prop.position.copy(toLocal(object.x,object.z));prop.userData.gameplayObjectId=object.id;
    scene.add(prop);
  }
  const axis=new THREE.AxesHelper(8);axis.position.set(-89,0,-89);scene.add(axis);
  metrics.innerHTML='<strong>'+source.buildings.length+'</strong> grounded-source buildings · '+
    '<strong>'+source.sidewalks.length+'</strong> lane segments · '+
    '<strong>'+source.features.length+'</strong> simulated dumpsters · '+
    '<strong style="color:#ff9b83">'+audit.conflicts.length+'</strong> sampled overlap points · '+
    '<strong>'+roadSlices.filter(x=>x.status==='building-overlap').length+'</strong> blocked lane spans';
}
try{
  const [buildings,corridors]=await Promise.all([
    fetch('./data/manhattan-enu.json').then(r=>{if(!r.ok)throw new Error('buildings HTTP '+r.status);return r.json()}),
    fetch('./data/streets-enu.json').then(r=>{if(!r.ok)throw new Error('streets HTTP '+r.status);return r.json()})
  ]);
  const city=createLivingCity(corridors);
  establishAlley(city);
  block=buildGroundedBlock({city,buildings});
  audit=auditBlock(block);
  showBlock(block);
  status.textContent='Loaded: source-projected building and sidewalk geometry; read-only simulation observations.';
  window.__s3Graybox=()=>({
    ready:true,center:{...block.center},schemaVersion:block.schemaVersion,
    buildings:block.buildings.length,lanes:block.sidewalks.length,features:block.features.length,
    sampled:audit.sampled,conflicts:audit.conflicts.length,collisionFree:audit.collisionFree,
    blockedSpans:partitionBlockSidewalks(block).filter(p=>p.status==='building-overlap').length,
    featureIds:block.features.map(o=>o.id),provenance:block.provenance
  });
}catch(error){
  status.textContent='Graybox failed: '+(error?.message||error);
  window.__s3Graybox=()=>({ready:false,error:String(error)});
  console.error(error);
}
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
renderer.setAnimationLoop(()=>{orbit.update();renderer.render(scene,camera);});
