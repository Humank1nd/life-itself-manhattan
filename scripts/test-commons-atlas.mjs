import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {validateEvidenceGraph,photosInYear} from '../src/evidence-graph.js';
const graph=JSON.parse(readFileSync(new URL('../data/evidence-v1.json',import.meta.url),'utf8'));
const anchors=JSON.parse(readFileSync(new URL('../data/anchors-enu.json',import.meta.url),'utf8')).anchors;
const buildings=JSON.parse(readFileSync(new URL('../data/manhattan-enu.json',import.meta.url),'utf8'));
const bins=new Set(buildings.map(b=>b.bin));
const result=validateEvidenceGraph(graph,anchors,bins);
assert.ok(result.photos>=4,'expected at least 4 source-attributed photo records');
const expectedYears=new Set([2005,2006,2010,2015]);
const actualYears=new Set(graph.photos.map(p=>Number(p.capturedAt.slice(0,4))));
for(const year of expectedYears) assert.ok(actualYears.has(year),year+' not ingested');
for(const p of graph.photos){
 assert.match(p.source.url,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
 assert.ok(p.license?.author?.trim() && p.license?.label?.trim());
 assert.equal(p.modelTrainingPermission,'unreviewed','Do not auto-opt images into training');
 assert.ok(p.location&&p.anchorId===null,'preserve original photo geotag without misusing a surveyed anchor');
 for (const [uri, digest] of [[p.imageUri,p.sha256],[p.segmentation.maskUri,p.segmentation.maskSha256]]) {
   const full=resolve(new URL('..',import.meta.url).pathname,uri);
   assert.ok(statSync(full).size>500,'asset too small');
   const actual=createHash('sha256').update(readFileSync(full)).digest('hex');
   assert.equal(actual,digest,uri+' changed');
 }
 assert.equal(p.segmentation.sourceSha256,p.sha256);
 assert.equal(p.segmentation.status,'machine-proposed-unreviewed');
 assert.ok(photosInYear(graph,Number(p.capturedAt.slice(0,4))).some(q=>q.id===p.id));
}
console.log('PASS: '+result.photos+' real attributed photos, four historical years, immutable source checksums, proposed-only building masks, no automatic training');
