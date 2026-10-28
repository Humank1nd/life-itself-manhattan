// Materialize bounded Times Square current-geometry snapshots.
// Historical predecessor entities are added only when independent dated evidence exists.
import {readFileSync,writeFileSync} from 'node:fs';
import {validateBuildingVersions,VERSIONS_SCHEMA} from '../src/facade-matching.js';
const root=new URL('../',import.meta.url);
const buildings=JSON.parse(readFileSync(new URL('data/manhattan-enu.json',root),'utf8'));
const MAX_RADIUS=520, SNAPSHOT_AT='2026-10-28';
const snapshots=[];
for(const b of buildings){
 const ring=b.rings[0];
 if(!Array.isArray(ring)||ring.length<3)continue;
 const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length;
 const cz=ring.reduce((s,p)=>s+p[1],0)/ring.length;
 if(Math.hypot(cx,cz)>MAX_RADIUS)continue;
 if(!/^1\d{6}$/.test(b.bin))continue;
 snapshots.push(b);
}
snapshots.sort((a,b)=>a.bin.localeCompare(b.bin));
const entities=snapshots.map(b=>({
 id:'nyc-bin-'+b.bin,currentBin:b.bin,
 predecessorEntityIds:[],successorEntityIds:[],
 historyStatus:'no-documented-predecessors-ingested'
}));
const versions=snapshots.map(b=>({
 id:'nyc-bin-'+b.bin+'-observed-20261028',
 entityId:'nyc-bin-'+b.bin,bin:b.bin,validityStatus:'current-snapshot',
 validFrom:null,validTo:null,snapshotAt:SNAPSHOT_AT,
 constructionYear:b.yr||null,constructionYearStatus:'unverified-nyc-open-data-field',
 source:{title:'NYC Open Data building footprint snapshot',url:'https://data.cityofnewyork.us/'},
 geometry:{type:'footprint',rings:b.rings,heightM:b.h,neighborhood:b.nb},
 note:'Present-day geometry is not evidence of historical facade or occupancy. Demolished predecessors require separate sourced entities.'
}));
const doc={schemaVersion:VERSIONS_SCHEMA,worldId:'life-itself:manhattan',
 geography:'Times Square, 520m radius from Twin Earth origin',
 source:'NYC building footprint current data (bounded projection)',
 historicalPolicy:'Never retrofit a current BIN to a demolished predecessor. Create new entity with archival source and dated version.',
 entities,versions};
const stats=validateBuildingVersions(doc);
writeFileSync(new URL('data/times-square-building-versions-v1.json',root),JSON.stringify(doc,null,2)+'\n');
console.log('PASS: Time-versioned registry scaffold',stats,'historical predecessors = 0 (not invented)');
