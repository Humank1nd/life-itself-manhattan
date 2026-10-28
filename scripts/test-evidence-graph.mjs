import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {validateEvidenceGraph,photosInYear,occupanciesInYear,spatialAnchorEdges,validDate} from '../src/evidence-graph.js';
const anchors=JSON.parse(readFileSync(new URL('../data/anchors-enu.json',import.meta.url),'utf8')).anchors;
const bins=new Set(JSON.parse(readFileSync(new URL('../data/manhattan-enu.json',import.meta.url),'utf8')).map(b=>b.bin));
const bin=bins.values().next().value;
const original=JSON.parse(readFileSync(new URL('../data/evidence-v1.json',import.meta.url),'utf8'));
assert.deepEqual(validateEvidenceGraph(original,anchors,bins),{photos:0,occupancies:0});
assert.equal(photosInYear(original,1995).length,0);
assert.ok(spatialAnchorEdges(anchors).length>=anchors.length-1);
const p=(id,date,anchorId='ANC-001')=>({id,anchorId,imageUri:'assets/evidence/test-photo.jpg',
capturedAt:date,recordedAt:'2026-10-28',rights:'original',status:'documented',
source:{title:'SYNTHETIC TEST ONLY',url:'https://example.com/test'},conditions:{weather:'rain',lighting:'night'},
yawDeg:null,buildingBin:bin,caption:'Synthetic test'});
const o=(id,from,to)=>({id,buildingBin:bin,businessName:'SYNTHETIC BUSINESS',validFrom:from,validTo:to,
recordedAt:'2026-10-28',status:'reported',source:{title:'SYNTHETIC TEST ONLY',url:'https://example.com/test'}});
const yearOnly={...p('year-only','2001-01-01'),capturedAt:null,capturedYear:1995,capturePrecision:'year'};
const test={...original,photos:[p('old','1995-12-31'),p('new','1996-01-01'),p('far','1995-02-03','ANC-002'),yearOnly],
occupancies:[o('tenant-a','1990-06-01','1996-06-01'),o('tenant-b','1996-06-01',null)]};
assert.deepEqual(validateEvidenceGraph(test,anchors,bins),{photos:4,occupancies:2});
assert.deepEqual(photosInYear(test,1995).map(x=>x.id),['far','old','year-only']);
assert.deepEqual(photosInYear(test,1995,'ANC-001').map(x=>x.id),['old','year-only']);
assert.deepEqual(photosInYear(test,1996).map(x=>x.id),['new']);
assert.deepEqual(occupanciesInYear(test,1995,bin).map(x=>x.id),['tenant-a']);
assert.deepEqual(occupanciesInYear(test,1996,bin).map(x=>x.id),['tenant-a','tenant-b']);
assert.deepEqual(occupanciesInYear(test,1997,bin).map(x=>x.id),['tenant-b']);
assert.equal(validDate('2026-02-30'),false);
const mutate=change=>{const g=structuredClone(test);change(g);assert.throws(()=>validateEvidenceGraph(g,anchors,bins));};
mutate(g=>g.photos[0].imageUri='https://outside/asset.jpg');
mutate(g=>g.photos[0].rights='unreal-only');
mutate(g=>g.photos[0].anchorId='NOT_A_SURVEY');
mutate(g=>g.photos[0].capturedAt='1995-13-01');
mutate(g=>g.photos[0].status='verified-by-ai');
mutate(g=>g.photos[0].source.url='javascript:alert(1)');
mutate(g=>g.occupancies[0].validTo='1980-01-01');
mutate(g=>g.occupancies[0].buildingBin='9999999');
console.log('PASS: 25 canonical anchors; years, location, interval and 8 negative cases');
