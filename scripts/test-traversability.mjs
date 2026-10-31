import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLivingCity,establishAlley} from '../src/living-city.js';
import {buildGroundedBlock} from '../src/grounded-block.js';
import {validateTraversableMove,segmentPolygonClearance,TRAVERSABILITY_SCHEMA} from '../src/traversability.js';
import {ACTION_CONTRACT,commitAction,actionReceipt} from '../src/action-contract.js';
import {applyEventOnce} from '../src/citizen-agency.js';

assert.equal(TRAVERSABILITY_SCHEMA,'life-itself-traversability/1.0.0');
const square=[[-1,-1],[1,-1],[1,1],[-1,1]];
assert.equal(segmentPolygonClearance([-4,0],[4,0],square),0);
assert.equal(segmentPolygonClearance([-4,2],[4,2],square),1);
assert.equal(segmentPolygonClearance([-4,0],[0,0],square),0);
assert.equal(segmentPolygonClearance([-4,0],[-2,0],square),1);
assert.equal(segmentPolygonClearance([-4,0],[4,0],null),null);
const thinWall=[[0.30,-1],[0.35,-1],[0.35,1],[0.30,1]];
assert.equal(segmentPolygonClearance([-2,0],[2,0],thinWall),0,'thin wall crossing even without sampled point inside');

const corridors=JSON.parse(readFileSync(new URL('../data/streets-enu.json',import.meta.url),'utf8'));
const buildings=JSON.parse(readFileSync(new URL('../data/manhattan-enu.json',import.meta.url),'utf8'));
const city=createLivingCity(corridors,{pedestrians:0});
establishAlley(city);
const block=buildGroundedBlock({city,buildings});
const makeCase=(laneIndex,segmentIndex,fraction,targetFraction)=>{
 const lane=city.lanes[laneIndex],a=lane.waypoints[segmentIndex],b=lane.waypoints[segmentIndex+1];
 const pos=(f)=>({x:a[0]+f*(b[0]-a[0]),z:a[1]+f*(b[1]-a[1])});
 const from=pos(fraction),to=pos(targetFraction);
 const actor={id:'rat',alive:true,laneIndex,segmentIndex,fraction,...from};
 const validity=validateTraversableMove({actorId:actor.id,actor,from,to,lanes:city.lanes,block});
 return {actor,from,to,validity,laneId:lane.laneId,stepM:Math.hypot(to.x-from.x,to.z-from.z)};
};
let clear=null,blocked=null,zero=null;
for(let laneIndex=0;laneIndex<city.lanes.length;laneIndex++){
 const lane=city.lanes[laneIndex];
 for(let segmentIndex=0;segmentIndex<lane.waypoints.length-1;segmentIndex++){
  const a=lane.waypoints[segmentIndex],b=lane.waypoints[segmentIndex+1];
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const dt=Math.min(1.2/len,0.01);
  for(let i=0;i<100;i++){
   const f=i/100;
   if(f+dt>=1)continue;
   const trial=makeCase(laneIndex,segmentIndex,f,f+dt);
   if(trial.stepM>10)continue;
   if(trial.validity.ok&&!clear)clear=trial;
   if(trial.validity.reason?.startsWith('building-obstacle:')&&!blocked)blocked=trial;
   if(clear&&blocked)break;
  }
  if(clear&&blocked)break;
 }
 if(clear&&blocked)break;
}
assert(clear,'must locate a REAL clear sidewalk step');
assert(blocked,'must locate a REAL building-blocked sidewalk step');
const createAction=(target,actId)=>({
 schemaVersion:ACTION_CONTRACT,actionId:actId,actorId:'rat',tick:4,
 type:'move',params:{to:target},basis:[],
});
const context=(trial,overrides={})=>({
 citizenIds:['rat'],positions:{rat:{...trial.from}},tick:4,lanes:city.lanes,
 traversability:{actor:trial.actor,block},...overrides,
});
const goodAction=createAction(clear.to,'act-clear');
const goodEvent=commitAction(goodAction,context(clear),new Set(),-1);
assert.equal(goodEvent.type,'move');
const goodReceipt=actionReceipt(goodAction,goodEvent);
assert.equal(goodReceipt.status,'committed');
const world={...city,pedestrians:[{...clear.actor}]};
const applied=new Set();
const effect=applyEventOnce(world,goodEvent,applied);
assert.equal(applied.size,1);
assert(Number.isFinite(effect.fraction));
assert(Math.hypot(world.pedestrians[0].x-clear.to.x,world.pedestrians[0].z-clear.to.z)<1e-5);
assert.throws(()=>applyEventOnce(world,goodEvent,applied),/duplicate/);
const badAction=createAction(blocked.to,'act-blocked');
assert.throws(()=>commitAction(badAction,context(blocked),new Set(),-1),/traversability: building-obstacle/);
assert.equal(commitAction(badAction,context(blocked,{traversability:null}),new Set(),-1).actionId,'act-blocked',
 'preserve existing historical P017 validation when opt-in map is absent');
const unmodified=JSON.stringify({city,block,clear,blocked});
const invalid=[
 [{actor:{...clear.actor,alive:false}},'actor-lane-state-unavailable'],
 [{actor:{...clear.actor,segmentIndex:999}},'lane-segment-unavailable'],
 [{actor:{...clear.actor,id:'different'}},'actor-lane-state-unavailable'],
 [{actor:{...clear.actor,fraction:1.4}},'actor-lane-state-unavailable'],
 [{actor:{...clear.actor,x:clear.actor.x+1}},'actor-off-own-lane'],
 [{block:null},'building-map-unavailable'],
 [{block:{...block,buildings:[]}},'building-map-unavailable'],
 [{block:{...block,bounds:{minX:0,maxX:1,minZ:0,maxZ:1}}},'outside-grounded-coverage'],
 [{bodyRadiusM:-1},'body-clearance-invalid'],
 [{block:{...block,buildings:[{id:'corrupt',rings:[[null]]}]}},'building-record-invalid'],
];
for(const [update,reason] of invalid){
 const result=validateTraversableMove({actorId:'rat',actor:clear.actor,from:clear.from,to:clear.to,lanes:city.lanes,block,...update});
 assert.equal(result.reason,reason,JSON.stringify(update));
 assert.throws(()=>commitAction(goodAction,context(clear,{traversability:{actor:clear.actor,block,...update}}),new Set(),-1),/traversability:/);
}
assert.equal(validateTraversableMove({actorId:'rat',actor:clear.actor,from:clear.from,to:clear.from,lanes:city.lanes,block}).reason,'zero-displacement');
const offTarget={x:clear.to.x+3,z:clear.to.z+4};
assert.equal(validateTraversableMove({actorId:'rat',actor:clear.actor,from:clear.from,to:offTarget,lanes:city.lanes,block}).reason,'target-off-own-lane');
assert.equal(JSON.stringify({city,block,clear,blocked}),unmodified,'selection and admission leave all source state untouched');

const proof={pass:true,clear:{lane:clear.laneId,from:clear.from,to:clear.to,stepM:clear.stepM,
  eventId:goodEvent.eventId,receipt:goodReceipt.status},
 blocked:{lane:blocked.laneId,from:blocked.from,to:blocked.to,stepM:blocked.stepM,reason:blocked.validity.reason},
 regressionCases:invalid.length,sourceBuildingCount:block.buildings.length,
 mode:'explicit opt-in at P017 commitAction (not yet wired into Muse active city)'};
console.log('PASS S3-002 P017 traversability — real building obstruction refused, real clear step committed once, fail-closed missing map, same segment, body clearance, no mutation, S2 legacy preserved');
console.log('EVIDENCE '+JSON.stringify(proof));
