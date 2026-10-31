// S3-002: deterministic, read-only neighborhood geometry in Twin Earth ENU.
// All mapped buildings are sourced from data/manhattan-enu.json. Lanes and
// simulated dumpsters are observed from the *existing* living-city state.
// The graybox is not a navigation authority, a new simulation, or a claim
// that the dumpsters exist on the real-world street.
export const BLOCK_SCHEMA = 'life-itself-playable-graybox/1.0.0';
export const DEFAULT_BLOCK_EXTENT_M = 90;
export const WALK_CORRIDOR_RADIUS_M = 2.5;
const finite = Number.isFinite;
const EPS = 1e-7;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function pointInPolygon(x,z,ring) {
  if(!finite(x)||!finite(z)||!Array.isArray(ring)||ring.length<3) return false;
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,zi]=ring[i], [xj,zj]=ring[j];
    const cross=(x-xi)*(zj-zi)-(z-zi)*(xj-xi);
    if(Math.abs(cross)<=1e-7 && x>=Math.min(xi,xj)-EPS && x<=Math.max(xi,xj)+EPS &&
       z>=Math.min(zi,zj)-EPS && z<=Math.max(zi,zj)+EPS) return true;
    if((zi>z)!==(zj>z) && x < (xj-xi)*(z-zi)/(zj-zi)+xi) inside=!inside;
  }
  return inside;
}
export function pointInBuilding(x,z,building){
  // A single exterior is all the current vertical slice handles. Treat
  // additional rings conservatively as blocked until hole provenance exists.
  return Array.isArray(building?.rings)&&building.rings.some(r=>pointInPolygon(x,z,r));
}
export function distanceToSegment(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const denom=dx*dx+dz*dz;
  if(denom<=EPS) return Math.hypot(x-a[0],z-a[1]);
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/denom));
  return Math.hypot(x-(a[0]+t*dx),z-(a[1]+t*dz));
}
export function clipSegmentToBox(a,b,box){
  // Parametric Liang-Barsky clipping. Endpoints stay on the original segment.
  let t0=0,t1=1;
  const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const [p,q] of [
    [-dx,a[0]-box.minX],[dx,box.maxX-a[0]],
    [-dz,a[1]-box.minZ],[dz,box.maxZ-a[1]]
  ]){
    if(Math.abs(p)<EPS){if(q<0)return null;continue;}
    const t=q/p;
    if(p<0){if(t>t1)return null;t0=Math.max(t0,t);}
    else{if(t<t0)return null;t1=Math.min(t1,t);}
  }
  if(t0>t1)return null;
  return [[a[0]+t0*dx,a[1]+t0*dz],[a[0]+t1*dx,a[1]+t1*dz]];
}
export function buildGroundedBlock({
  city, buildings, halfExtentM=DEFAULT_BLOCK_EXTENT_M, center,
}={}){
  if(!city||!Array.isArray(city.lanes)||!Array.isArray(city.objects)||
      !Array.isArray(buildings)) throw new Error('graybox: city lanes, objects and building records required');
  if(!finite(halfExtentM)||halfExtentM<20||halfExtentM>250)
    throw new Error('graybox: half extent out of scope');
  const anchors=city.objects.filter(o=>o?.kind==='dumpster'&&o.provenance==='simulated'&&
    finite(o.x)&&finite(o.z)).sort((a,b)=>compare(a.id,b.id));
  if(anchors.length<2)throw new Error('graybox: needs both existing simulated dumpsters');
  const origin=center===undefined
    ? {x:anchors.reduce((v,o)=>v+o.x,0)/anchors.length,z:anchors.reduce((v,o)=>v+o.z,0)/anchors.length}
    : center;
  if(!finite(origin?.x)||!finite(origin?.z))throw new Error('graybox: center coordinates invalid');
  const bounds={
    minX:origin.x-halfExtentM,maxX:origin.x+halfExtentM,
    minZ:origin.z-halfExtentM,maxZ:origin.z+halfExtentM,
  };
  const inside=(x,z)=>x>=bounds.minX && x<=bounds.maxX && z>=bounds.minZ && z<=bounds.maxZ;
  const buildingRows=[];
  for(const b of buildings){
    if(!b||!Array.isArray(b.rings)||!finite(b.h)||b.h<=0)continue;
    const sourceRings=b.rings.filter(r=>Array.isArray(r)&&r.length>=3 &&
      r.every(p=>Array.isArray(p)&&p.length>=2&&finite(p[0])&&finite(p[1])));
    if(!sourceRings.length)continue;
    const coords=sourceRings.flat();
    const minX=Math.min(...coords.map(p=>p[0])),maxX=Math.max(...coords.map(p=>p[0]));
    const minZ=Math.min(...coords.map(p=>p[1])),maxZ=Math.max(...coords.map(p=>p[1]));
    if(maxX<bounds.minX||minX>bounds.maxX||maxZ<bounds.minZ||minZ>bounds.maxZ)continue;
    buildingRows.push({id:String(b.bin),heightM:b.h,rings:sourceRings,
      bbox:{minX,maxX,minZ,maxZ},provenance:'grounded-source-enu'});
  }
  buildingRows.sort((a,b)=>compare(a.id,b.id));
  const sidewalks=[];
  for(const lane of city.lanes){
    if(!Array.isArray(lane.waypoints))continue;
    for(let segmentIndex=0;segmentIndex<lane.waypoints.length-1;segmentIndex++){
      const a=lane.waypoints[segmentIndex],b=lane.waypoints[segmentIndex+1];
      if(!Array.isArray(a)||!Array.isArray(b)||![...a,...b].every(finite)) continue;
      const trimmed=clipSegmentToBox(a,b,bounds);
      if(!trimmed || Math.hypot(trimmed[1][0]-trimmed[0][0],trimmed[1][1]-trimmed[0][1])<=1e-7)continue;
      sidewalks.push({laneId:lane.laneId,segmentIndex,points:trimmed,
        provenance:'derived-from-simulation-enu-lane'});
    }
  }
  sidewalks.sort((a,b)=>compare(a.laneId,b.laneId)||a.segmentIndex-b.segmentIndex);
  const features=anchors.filter(o=>inside(o.x,o.z)).map(o=>({
    id:o.id,kind:o.kind,x:o.x,z:o.z,patchId:o.patchId,
    provenance:o.provenance,role:'simulated-gameplay-object'
  }));
  const block={schemaVersion:BLOCK_SCHEMA,center:{x:origin.x,z:origin.z},
    halfExtentM,bounds,buildings:buildingRows,sidewalks,features,
    provenance:{buildings:'data/manhattan-enu.json',sidewalks:'livingCity.lanes',
      features:'livingCity.objects (simulated, not observed)',measurement:'source projected ENU, no field validation'},
  };
  return block;
}
export function classifyBlockPosition(block,{x,z},radiusM=WALK_CORRIDOR_RADIUS_M){
  if(!block||!finite(x)||!finite(z)||!finite(radiusM)||radiusM<=0) return {kind:'invalid'};
  const b=block.bounds;
  if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ) return {kind:'outside-block'};
  const obstacle=block.buildings.find(row=>
    x>=row.bbox.minX&&x<=row.bbox.maxX&&z>=row.bbox.minZ&&z<=row.bbox.maxZ&&
    pointInBuilding(x,z,row));
  if(obstacle)return {kind:'blocked-building',buildingId:obstacle.id};
  let nearest={distanceM:Infinity,laneId:null};
  for(const lane of block.sidewalks){
    const distanceM=distanceToSegment(x,z,lane.points[0],lane.points[1]);
    if(distanceM<nearest.distanceM)nearest={distanceM,laneId:lane.laneId};
  }
  if(nearest.distanceM>radiusM) return {kind:'unverified-surface',distanceM:nearest.distanceM};
  return {kind:'lane-near',laneId:nearest.laneId,distanceM:nearest.distanceM};
}
export function auditBlock(block,{stepM=1}={}){
  if(!finite(stepM)||stepM<=0||stepM>5)throw new Error('graybox: stepM invalid');
  const conflicts=[];
  let sampled=0;
  for(const lane of block.sidewalks){
    const [a,b]=lane.points;
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/stepM));
    for(let i=0;i<=n;i++){
      const t=i/n;
      const point={x:a[0]+t*(b[0]-a[0]),z:a[1]+t*(b[1]-a[1])};
      sampled++;
      const verdict=classifyBlockPosition(block,point);
      if(verdict.kind==='blocked-building'){
        conflicts.push({laneId:lane.laneId,segmentIndex:lane.segmentIndex,
          buildingId:verdict.buildingId,x:point.x,z:point.z});
      }
    }
  }
  return {sampled,conflicts,collisionFree:conflicts.length===0};
}

// Collision-candidate partition for the graybox *display*. Unlike sampling
// midpoint labels only, segment/polygon intersections catch thin crossings.
// This makes no claim of clearance for a rat body or physical navigation.
function orient(a,b,c) {
  const v=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  return Math.abs(v)<EPS?0:Math.sign(v);
}
function pointOnSegment(p,a,b) {
  return orient(a,b,p)===0 &&
    p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS &&
    p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
}
export function segmentsIntersect(a,b,c,d){
  const abC=orient(a,b,c),abD=orient(a,b,d);
  const cdA=orient(c,d,a),cdB=orient(c,d,b);
  return ((abC!==abD)&&(cdA!==cdB)) ||
    (abC===0&&pointOnSegment(c,a,b)) || (abD===0&&pointOnSegment(d,a,b)) ||
    (cdA===0&&pointOnSegment(a,c,d)) || (cdB===0&&pointOnSegment(b,c,d));
}
export function segmentIntersectsBuilding(a,b,building){
  if(!Array.isArray(building?.rings))return false;
  return building.rings.some(ring=>{
    if(pointInPolygon(a[0],a[1],ring)||pointInPolygon(b[0],b[1],ring))return true;
    for(let i=0;i<ring.length;i++) {
      if(segmentsIntersect(a,b,ring[i],ring[(i+1)%ring.length]))return true;
    }
    return false;
  });
}
export function partitionBlockSidewalks(block,{stepM=1}={}){
  if(!block||!Array.isArray(block.sidewalks)||!Array.isArray(block.buildings)||
      !finite(stepM)||stepM<=0||stepM>4)throw new Error('graybox: partition input invalid');
  const rows=[];
  for(const lane of block.sidewalks){
    const [a,b]=lane.points;
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/stepM));
    let status=null;
    for(let i=0;i<n;i++){
      const t=i/n,u=(i+1)/n;
      const from=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
      const to=[a[0]+u*(b[0]-a[0]),a[1]+u*(b[1]-a[1])];
      const collision=block.buildings.find(building=>{
        const bb=building.bbox;
        if(Math.max(from[0],to[0])<bb.minX||Math.min(from[0],to[0])>bb.maxX||
           Math.max(from[1],to[1])<bb.minZ||Math.min(from[1],to[1])>bb.maxZ)return false;
        return segmentIntersectsBuilding(from,to,building);
      });
      const next=collision?'building-overlap':'candidate-clear';
      if(status===next) {
        rows[rows.length-1].to=to;
      } else {
        rows.push({laneId:lane.laneId,segmentIndex:lane.segmentIndex,
          from,to,status:next,provenance:'derived-overlay-not-navigation-authority'});
        status=next;
      }
    }
  }
  return rows;
}
