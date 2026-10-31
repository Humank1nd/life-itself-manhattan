import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLivingCity, establishAlley} from '../src/living-city.js';
import {BLOCK_SCHEMA,buildGroundedBlock,pointInPolygon,
  pointInBuilding,distanceToSegment,clipSegmentToBox,classifyBlockPosition,auditBlock,
  partitionBlockSidewalks,segmentsIntersect,segmentIntersectsBuilding} from '../src/grounded-block.js';
const corridors=JSON.parse(readFileSync(new URL('../data/streets-enu.json',import.meta.url),'utf8'));
const footprintRecords=JSON.parse(readFileSync(new URL('../data/manhattan-enu.json',import.meta.url),'utf8'));
const city=createLivingCity(corridors);
establishAlley(city);
const original=JSON.stringify({objects:city.objects,lanes:city.lanes,pedestrians:city.pedestrians});
const block=buildGroundedBlock({city,buildings:footprintRecords});
assert.equal(block.schemaVersion,BLOCK_SCHEMA);
assert.deepEqual(block,buildGroundedBlock({city,buildings:footprintRecords}),'deterministic from preserved world sources');
assert.equal(JSON.stringify({objects:city.objects,lanes:city.lanes,pedestrians:city.pedestrians}),original,'no mutation');
assert.equal(block.features.length,2,'both canonical dumpsters must appear');
assert(block.buildings.length>=10,'must include real-world source footprints');
assert(block.sidewalks.length>=10,'must intersect existing ENU lanes');
assert(block.buildings.every(b=>b.provenance==='grounded-source-enu'));
assert(block.features.every(f=>f.provenance==='simulated'&&f.role==='simulated-gameplay-object'));
for(const feature of block.features)assert.equal(classifyBlockPosition(block,feature).kind,'lane-near',
  'the actual existing objects must be near their actual lane');
const square=[[0,0],[10,0],[10,10],[0,10],[0,0]];
assert.equal(pointInPolygon(5,5,square),true);
assert.equal(pointInPolygon(5,0,square),true,'footprint boundary conservatively blocked');
assert.equal(pointInPolygon(-1,5,square),false);
assert.equal(pointInBuilding(5,5,{rings:[square]}),true);
assert.equal(distanceToSegment(1,4,[0,0],[10,0]),4);
assert.equal(distanceToSegment(14,0,[0,0],[10,0]),4);
assert.deepEqual(clipSegmentToBox([-5,5],[15,5],{minX:0,maxX:10,minZ:0,maxZ:10}),[[0,5],[10,5]]);
assert.equal(clipSegmentToBox([-5,-5],[-1,-1],{minX:0,maxX:10,minZ:0,maxZ:10}),null);
assert.equal(classifyBlockPosition(block,{x:1e8,z:1e8}).kind,'outside-block');
const parts=partitionBlockSidewalks(block);
assert(parts.some(p=>p.status==='building-overlap'),'must display conflicted lane spans');
assert(parts.some(p=>p.status==='candidate-clear'),'must retain unconflicted spans');
assert(parts.every(p=>p.provenance==='derived-overlay-not-navigation-authority'));
assert.deepEqual(parts,partitionBlockSidewalks(block),'partition deterministic');
assert.equal(segmentsIntersect([0,0],[10,10],[0,10],[10,0]),true);
assert.equal(segmentsIntersect([0,0],[1,0],[2,0],[3,0]),false);
assert.equal(segmentsIntersect([0,0],[1,0],[1,0],[2,0]),true,'touch counts as overlap');
assert.equal(segmentIntersectsBuilding([-2,5],[12,5],{rings:[square]}),true);
assert.equal(segmentIntersectsBuilding([-2,-2],[-1,-1],{rings:[square]}),false);
// Narrow mapped wall crosses a single 4m lane segment between all samples;
// endpoint/midpoint-only checks would incorrectly call the route clear.
const thinWall=[[0.32,-2],[0.38,-2],[0.38,2],[0.32,2],[0.32,-2]];
assert.equal(segmentIntersectsBuilding([-2,0],[2,0],{rings:[thinWall]}),true,
  'segment-edge intersection must detect a thin crossing between samples');
const artificialBlock={ buildings:[{id:'wall',rings:[thinWall],bbox:{minX:0.32,maxX:0.38,minZ:-2,maxZ:2}}],
  sidewalks:[{laneId:'test',segmentIndex:0,points:[[-2,0],[2,0]]}] };
const boundaryParts=partitionBlockSidewalks(artificialBlock,{stepM:4});
assert.equal(boundaryParts.length,1);
assert.equal(boundaryParts[0].status,'building-overlap','must fail closed for crossed tiny wall');
const a=auditBlock(block);
assert(a.sampled>=700,'should actually audit the lanes');
assert(a.conflicts.length>0,'source-lane building overlaps must NOT be concealed');
assert.equal(a.collisionFree,false);
assert(a.conflicts.every(x=>block.buildings.some(b=>b.id===x.buildingId)));
assert.deepEqual(a,auditBlock(block),'audit must replay identically');
assert.throws(()=>buildGroundedBlock({city:{lanes:[]},buildings:footprintRecords}),/required/);
assert.throws(()=>buildGroundedBlock({city,buildings:footprintRecords,halfExtentM:600}),/scope/);
const evidence={schemaVersion:block.schemaVersion,center:block.center,
  bounds:block.bounds,buildingCount:block.buildings.length,sidewalkSegmentCount:block.sidewalks.length,
  gameplayObjects:block.features.map(({id,kind,x,z,provenance})=>({id,kind,x,z,provenance})),
  auditSamples:a.sampled,blockedSamples:a.conflicts.length,
  partitionedSpans:parts.length,blockedSpans:parts.filter(p=>p.status==='building-overlap').length,
  conflictedLanes:[...new Set(a.conflicts.map(x=>x.laneId))].sort(),
  sampleConflicts:a.conflicts.slice(0,6),collisionFree:a.collisionFree};
console.log('PASS S3-002 grounded geometry, preserve provenance, obstacle/lane classification, conservative collision audit');
console.log('EVIDENCE '+JSON.stringify(evidence));
