import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog,catalogForYear,catalogYears,fallbackCatalogEnu} from '../src/photo-catalog.js';
import {projectEnu} from '../src/core-journal.js';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('data/photo-catalog-v1.json',root),'utf8'));
const links=JSON.parse(readFileSync(new URL('data/photo-links-v1.json',root),'utf8'));
const city=JSON.parse(readFileSync(new URL('data/city-scene-v1.json',root),'utf8'));
const anchors=JSON.parse(readFileSync(new URL('data/anchors-enu.json',root),'utf8'));
for(const a of anchors.anchors){
  const p=fallbackCatalogEnu(anchors.origin,a.lat,a.lon,a.elev);
  assert.ok(Math.abs(p[0]-a.x)<0.05 && Math.abs(p[1]+a.z)<0.05 &&
    Math.abs(p[2]-a.y)<0.05, 'catalog coordinate drift at '+a.id);
}
const metrics=validateCatalog(catalog);
assert.ok(metrics.candidates>=200 && metrics.mappedAndDated>=40,
  'catalog underpopulated; check upstream API and metadata before accepting');
assert.ok(metrics.candidates<=1000);
const years=catalogYears(catalog);
assert.ok(years.includes(2007)&&years.includes(2015)&&years.includes(2024));
assert.ok(links.edges.length>20);
const byId=new Map(catalog.records.map(p=>[p.id,p]));
const keys=new Set();
for(const link of links.edges){
  assert.equal(link.reason,'candidate-cross-year-nearby-geotags');
  assert.equal(link.validatedVisualOverlap,false,'links may not claim visual overlap');
  assert.ok(link.distanceM<=75 && link.distanceM>=0);
  const a=byId.get(link.from),b=byId.get(link.to);
  assert.ok(a&&b&&a.location&&b.location&&a.capturedAt&&b.capturedAt);
  assert.notEqual(a.capturedAt.slice(0,4),b.capturedAt.slice(0,4));
  const key=[link.from,link.to].sort().join('|');
  assert.ok(!keys.has(key));keys.add(key);
}
for(const year of years){
  const list=catalogForYear(catalog,year,projectEnu,city.frame.origin);
  assert.ok(list.length>0,'no previews for '+year);
  for(const p of list){
    assert.ok(Number.isFinite(p.location.x)&&Number.isFinite(p.location.z));
    assert.ok(p.imageUri.startsWith('https://'));
    assert.equal(p.modelTrainingPermission,'unreviewed');
    assert.equal(p.status,'candidate-unreviewed');
    assert.equal(p.isCatalog,true);
  }
}
const copy=structuredClone(catalog);
copy.records[0].modelTrainingPermission='approved';
assert.throws(()=>validateCatalog(copy));
copy.records[0].modelTrainingPermission='unreviewed';
copy.records[0].previewUrl='https://unapproved.example.com/photo.jpg';
assert.throws(()=>validateCatalog(copy));
console.log('PASS: '+metrics.candidates+' candidates; '+metrics.mappedAndDated+' dated geotags; '+
links.edges.length+' unreviewed cross-year proximity links; valid projections, licenses and training gates');
