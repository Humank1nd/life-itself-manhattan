import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('../data/photo-catalog-v1.json',import.meta.url);
const catalog=JSON.parse(readFileSync(path,'utf8'));
const points=catalog.records.filter(p=>p.capturedAt&&p.location);
const toRad=n=>n*Math.PI/180;
function haversine(a,b){
 const dlat=toRad(b.lat-a.lat),dlon=toRad(b.lon-a.lon);
 const q=Math.sin(dlat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dlon/2)**2;
 return 2*6371000*Math.asin(Math.min(1,Math.sqrt(q)));
}
const maxMeters=75,edges=[],seen=new Set();
for(const a of points){
 const y=Number(a.capturedAt.slice(0,4));
 const nearby=points.filter(b=>a.id!==b.id&&y!==Number(b.capturedAt.slice(0,4)))
   .map(b=>({id:b.id,d:haversine(a.location,b.location),otherYear:Number(b.capturedAt.slice(0,4))}))
   .filter(b=>b.d<=maxMeters).sort((x,y)=>x.d-y.d||x.id.localeCompare(y.id)).slice(0,2);
 for(const b of nearby){
   const [from,to]=[a.id,b.id].sort(),key=from+'|'+to;
   if(seen.has(key))continue;seen.add(key);
   edges.push({from,to,reason:'candidate-cross-year-nearby-geotags',
     distanceM:Math.round(b.d*100)/100,validatedVisualOverlap:false});
 }
}
edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
const result={schemaVersion:'life-itself-photo-links/1.0.0',
 worldId:'life-itself:manhattan',
 sourceCatalog:'data/photo-catalog-v1.json',
 semantics:'Candidates only: geotags may identify pictured landmarks rather than camera positions. No semantic match, object tracking, or model training.',
 maxDistanceM:maxMeters, edges};
writeFileSync(new URL('../data/photo-links-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('PASS: '+points.length+' dated geotagged catalog records -> '+edges.length+' cross-year proximity candidates (not verified overlap)');
