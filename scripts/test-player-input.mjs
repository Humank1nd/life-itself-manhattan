// S3-001: pure input sampler -> P017 lawful movement -> exactly-once apply.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerInputSampler, axesFromHeldKeys, selectPlayerMove, selectPlayerMoveTarget, PLAYER_MOVE_LIMIT_M } from '../src/player-input.js';
import { validateAction, commitAction, MAX_MOVE_M } from '../src/action-contract.js';
import { applyEventOnce } from '../src/citizen-agency.js';
import { createLivingCity } from '../src/living-city.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const ped = (id='ped_1',fraction=0.25) => ({
  id, laneIndex:0, segmentIndex:0, fraction, x:20*fraction, z:0,
  alive:true, motives:{ energy:60, hunger:20, thirst:40, social:75 },
});
const city = () => ({
  tickCount:12,
  lanes:[{ waypoints:[[0,0],[20,0]] }],
  pedestrians:[ped('ped_1'),ped('ped_2',0.75)],
});
const request = (state,opts={}) => selectPlayerMove(state,{actorId:'ped_1',right:1,...opts});
assert(PLAYER_MOVE_LIMIT_M <= MAX_MOVE_M);

// Held-key mapping: repeat events, opposite cancellation, diagonals and blur.
const sampler = createPlayerInputSampler();
assert.equal(sampler.press('KeyD'),true);
assert.equal(sampler.press('KeyD'),true);
assert.deepEqual(sampler.axes(),{right:1,forward:0});
assert.equal(sampler.press('KeyW'),true);
assert(Math.abs(sampler.axes().right-Math.SQRT1_2)<1e-12);
assert(Math.abs(sampler.axes().forward-Math.SQRT1_2)<1e-12);
assert.equal(sampler.press('KeyA'),true);
assert.deepEqual(sampler.axes(),{right:0,forward:1});
assert.equal(sampler.press('Space'),false);
sampler.release('KeyW');
assert.deepEqual(sampler.axes(),{right:0,forward:0});
sampler.press('ArrowDown');
assert.deepEqual(sampler.axes(),{right:0,forward:-1});
sampler.clear();
assert.deepEqual(sampler.axes(),{right:0,forward:0});
assert(Math.abs(axesFromHeldKeys(['KeyW','KeyD']).right-Math.SQRT1_2)<1e-12);
assert.throws(()=>axesFromHeldKeys(null),/iterable/);
assert.throws(()=>axesFromHeldKeys([5]),/invalid key/);

// Pure, deterministic selection: cannot mutate gameplay or journal.
const original=city();
const before=clone(original);
const move=request(original);
assert.equal(move.status,'selected');
assert.deepEqual(original,before);
assert.equal(move.action.type,'move');
assert.equal(move.action.params.to.x,10); // at x=5 + 5m
assert.equal(move.action.params.to.z,0);
assert.equal(move.stepM,5);
assert.deepEqual(request(clone(before)),move);
assert.equal(validateAction(move.action,{
 citizenIds:before.pedestrians.map(p=>p.id),
 positions:Object.fromEntries(before.pedestrians.map(p=>[p.id,{x:p.x,z:p.z}])),
 tick:before.tickCount,lanes:before.lanes,
}),true);

// Actual P017 commit -> effect, no second application.
const applied = new Set();
const context={
 citizenIds:original.pedestrians.map(p=>p.id),
 positions:Object.fromEntries(original.pedestrians.map(p=>[p.id,{x:p.x,z:p.z}])),
 tick:original.tickCount,lanes:original.lanes,
};
const event = commitAction(move.action,context,applied,-1);
assert.equal(event.generated,false);
assert.deepEqual(applyEventOnce(original,event,applied),{fraction:0.5});
assert.equal(original.pedestrians[0].x,10);
assert.throws(()=>applyEventOnce(original,event,applied),/duplicate effect/);
assert.throws(()=>commitAction(move.action,context,applied,-1),/duplicate execution/);

// Direction changes with camera heading; no right/left teleport.
assert.equal(request(city(),{right:0,forward:1,yawRadians:Math.PI/2}).action.params.to.x,10);
assert.equal(request(city(),{right:-1}).action.params.to.x,0);
assert.equal(request(city(),{right:0,forward:1}).status,'abstained'); // +z perpendicular to lane
assert.equal(request(city(),{right:0,forward:0}).status,'abstained');
const diagonal = request(city(),{right:Math.SQRT1_2,forward:Math.SQRT1_2});
assert(diagonal.stepM<5 && diagonal.stepM>3.5, 'no diagonal speed exploit');
assert.equal(request(city(),{right:1,distanceM:PLAYER_MOVE_LIMIT_M+0.01}).reason,'invalid-input');
assert.equal(request(city(),{right:2}).reason,'invalid-input');
assert.equal(request(city(),{right:NaN}).reason,'invalid-input');
assert.equal(request(city(),{yawRadians:Infinity}).reason,'invalid-input');
assert.equal(request(city(),{distanceM:0}).reason,'invalid-input');

// Segment endpoints must stop, not quietly apply onto a different segment.
const end=city();end.pedestrians[0]=ped('ped_1',1);
assert.equal(request(end).reason,'segment-boundary');
assert.equal(request(end,{right:-1}).status,'selected');
const start=city();start.pedestrians[0]=ped('ped_1',0);
assert.equal(request(start,{right:-1}).reason,'segment-boundary');
const short=city();short.pedestrians[0]=ped('ped_1',0.9);
assert(Math.abs(request(short).stepM-2)<1e-8);
const missing=city();missing.pedestrians[0].alive=false;
assert.equal(request(missing).reason,'actor-dead');
assert.equal(selectPlayerMove(city(),{actorId:'unknown',right:1}).reason,'unknown-actor');
assert.equal(selectPlayerMove(null,{actorId:'ped_1',right:1}).reason,'world-unavailable');
const corrupted=city();corrupted.pedestrians[0].x+=0.1;
assert.equal(request(corrupted).reason,'actor-off-segment');
const noLane=city();noLane.lanes=[];
assert.equal(request(noLane).reason,'lane-unavailable');
const duplicate=city();duplicate.pedestrians.push(ped('ped_1'));
assert.equal(request(duplicate).reason,'ambiguous-actor');
const noMotives=city();noMotives.pedestrians[0].motives=null;
assert.equal(request(noMotives).reason,'observation-unavailable');
const zero=city();zero.lanes[0].waypoints=[[0,0],[0,0]];
assert.equal(request(zero).reason,'degenerate-lane');

// Muse's queued absolute step can be 7m perpendicular to a lane. Legacy
// P017 proximity validation accepts it but applyEvent projects to the SAME
// prior fraction: a COMMITTED receipt with zero movement. This preflight
// must refuse to produce an action for that exact class of false success.
const noopWorld = city();
const actorBefore = clone(noopWorld.pedestrians[0]);
const rawNoop = {
  schemaVersion:'life-itself-action/1.0.0',actionId:'known-legacy-noop',
  actorId:'ped_1',tick:noopWorld.tickCount,type:'move',
  params:{to:{x:actorBefore.x,z:actorBefore.z+7}},basis:[],
};
const noopCtx = {
  citizenIds:noopWorld.pedestrians.map((p)=>p.id),
  positions:Object.fromEntries(noopWorld.pedestrians.map((p)=>[p.id,{x:p.x,z:p.z}])),
  tick:noopWorld.tickCount,lanes:noopWorld.lanes,
};
assert.equal(validateAction(rawNoop,noopCtx),true, 'exposes broad P017 lane gate');
const counterexample = commitAction(rawNoop,noopCtx,new Set(),-1);
const appliedCounterexample = new Set();
applyEventOnce(noopWorld,counterexample,appliedCounterexample);
assert.deepEqual(noopWorld.pedestrians[0],actorBefore, 'false-success legacy projection does not move actor');
assert.equal(selectPlayerMoveTarget(city(), {actorId:'ped_1',to:{x:5,z:7}}).reason,'target-out-of-bounds');
assert.equal(selectPlayerMoveTarget(city(), {actorId:'ped_1',to:{x:5,z:4}}).status,'abstained');
const selectedAbsolute = selectPlayerMoveTarget(city(), {actorId:'ped_1',to:{x:8,z:4}});
assert.equal(selectedAbsolute.status,'selected');
assert(Math.abs(selectedAbsolute.action.params.to.x-8)<1e-9);
assert.equal(selectedAbsolute.action.params.to.z,0, 'absolute target reprojected onto actor lane');
assert(Math.abs(selectedAbsolute.stepM-3)<1e-9);
assert.equal(selectPlayerMoveTarget(city(), {actorId:'ped_1',to:{x:50,z:0}}).reason,'target-out-of-bounds');
assert.equal(selectPlayerMoveTarget(city(), {actorId:'ped_1',to:{x:NaN,z:0}}).reason,'invalid-target');
assert.equal(selectPlayerMoveTarget(city(), {actorId:'ped_1',to:{x:5,z:0}}).status,'abstained');
assert.equal(selectPlayerMoveTarget(city(), {actorId:'missing',to:{x:1,z:2}}).reason,'unknown-actor');
assert.equal(selectPlayerMoveTarget(city(), {actorId:'ped_1',to:null}).reason,'invalid-target');
const diagonalWorld=city();
const diagonalSelected=selectPlayerMoveTarget(diagonalWorld,{actorId:'ped_1',to:{x:8,z:4}});
const diagonalApplied=new Set();
const diagonalCtx={...noopCtx,positions:Object.fromEntries(diagonalWorld.pedestrians.map((p)=>[p.id,{x:p.x,z:p.z}]))};
const diagonalEvent=commitAction(diagonalSelected.action,diagonalCtx,diagonalApplied,-1);
applyEventOnce(diagonalWorld,diagonalEvent,diagonalApplied);
assert.equal(diagonalWorld.pedestrians[0].x,8);
assert.equal(diagonalWorld.pedestrians[0].z,0);

// A genuinely projected Manhattan sidewalk, no hard-coded fake gameplay coords.
const corridors=JSON.parse(readFileSync(new URL('../data/streets-enu.json',import.meta.url),'utf8'));
const real=createLivingCity(corridors,{seed:7,pedestrians:2});
const actor=real.pedestrians[0];
const lane=real.lanes[actor.laneIndex];
const a=lane.waypoints[actor.segmentIndex],b=lane.waypoints[actor.segmentIndex+1];
const yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
const realMove=selectPlayerMove(real,{actorId:actor.id,forward:1,yawRadians:yaw,distanceM:1});
assert(['selected','abstained'].includes(realMove.status));
if(realMove.status==='selected'){
 const context={citizenIds:real.pedestrians.map(p=>p.id),
 positions:Object.fromEntries(real.pedestrians.map(p=>[p.id,{x:p.x,z:p.z}])),
 tick:real.tickCount,lanes:real.lanes};
 const realEvent=commitAction(realMove.action,context,new Set(),-1);
 const seen=new Set();
 applyEventOnce(real,realEvent,seen);
 assert.equal(seen.size,1);
 assert(Math.hypot(actor.x-realMove.action.params.to.x,actor.z-realMove.action.params.to.z)<1e-6);
}
console.log('PASS S3-001 player input — held-key lifecycle, normalized controls, camera-relative lane movement, absolute-step no-op protection, fail-closed authority, deterministic selection, actual Manhattan lane, exactly-once P017 effect');
