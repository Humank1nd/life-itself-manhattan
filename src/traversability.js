// S3-002 optional *authoritative admission* gate for P017 moves.
// The caller MUST provide source-grounded geometry + live, simulator-owned
// actor state at commit time. This module does not mutate, repair or redirect
// a rat. A rejected move is not an event, effect, or journal receipt.
//
// This is a bounded graybox obstacle policy, NOT a surveyed navigation mesh:
// buildings are from projected ENU footprint data; lane geometry has known
// inconsistencies. Existing ungated legacy calls preserve their S2 contracts.
import { BLOCK_SCHEMA, pointInPolygon, distanceToSegment, segmentsIntersect } from './grounded-block.js';

export const TRAVERSABILITY_SCHEMA = 'life-itself-traversability/1.0.0';
export const DEFAULT_RAT_RADIUS_M = 0.15; // Candidate body clearance; not biological evidence.
const finite = Number.isFinite;
const fail = (reason) => Object.freeze({ ok: false, reason });
const ok = Object.freeze({ ok: true, reason: null });
const near = (a,b,eps=0.001) => Math.abs(a-b) <= eps;
const point = (p) => Array.isArray(p) && p.length>=2 && finite(p[0]) && finite(p[1]);
const vec = (p) => p && finite(p.x) && finite(p.z);

export function segmentPolygonClearance(a,b,ring) {
  // Zero if path intersects/touches/starts inside the polygon. Otherwise,
  // the minimum separation of a path segment and any footprint edge.
  if (!point(a)||!point(b)||!Array.isArray(ring)||ring.length<3 ||
      !ring.every(point)) return null;
  if (pointInPolygon(...a,ring)||pointInPolygon(...b,ring)) return 0;
  let best=Infinity;
  for (let i=0;i<ring.length;i++) {
    const c=ring[i],d=ring[(i+1)%ring.length];
    if (segmentsIntersect(a,b,c,d)) return 0;
    best=Math.min(best,
      distanceToSegment(...a,c,d),distanceToSegment(...b,c,d),
      distanceToSegment(...c,a,b),distanceToSegment(...d,a,b));
  }
  return best;
}

// Only a *full snapshot* of the four dependencies is valid:
// actor lane/segment/fraction, full live sidewalks, and source-projected
// block coverage. The caller cannot substitute UI points or a local polyline.
export function validateTraversableMove({
  actorId, from, to, lanes, actor, block, bodyRadiusM=DEFAULT_RAT_RADIUS_M,
}={}) {
  if (typeof actorId !== 'string' || !actorId || !vec(from) || !vec(to))
    return fail('actor-or-position-unavailable');
  if (!actor || actor.id!==actorId || actor.alive===false ||
      !Number.isInteger(actor.laneIndex) || !Number.isInteger(actor.segmentIndex) ||
      !finite(actor.fraction) || actor.fraction<0 || actor.fraction>1)
    return fail('actor-lane-state-unavailable');
  if (!Array.isArray(lanes)||!lanes.length) return fail('lane-map-unavailable');
  if (!block || block.schemaVersion!==BLOCK_SCHEMA ||
      !Array.isArray(block.buildings) || !block.buildings.length ||
      !block.bounds || block.provenance?.buildings!=='data/manhattan-enu.json')
    return fail('building-map-unavailable');
  if (!finite(bodyRadiusM)||bodyRadiusM<0.05||bodyRadiusM>0.5)
    return fail('body-clearance-invalid');
  const lane=lanes[actor.laneIndex];
  const a=lane?.waypoints?.[actor.segmentIndex], b=lane?.waypoints?.[actor.segmentIndex+1];
  if (!point(a)||!point(b)) return fail('lane-segment-unavailable');
  const dx=b[0]-a[0],dz=b[1]-a[1],lenSq=dx*dx+dz*dz;
  if (lenSq<=1e-9) return fail('degenerate-segment');
  const fx=a[0]+dx*actor.fraction,fz=a[1]+dz*actor.fraction;
  if (!near(from.x,fx)||!near(from.z,fz)||
      !near(actor.x,from.x)||!near(actor.z,from.z)) return fail('actor-off-own-lane');
  const fraction=((to.x-a[0])*dx+(to.z-a[1])*dz)/lenSq;
  if (!finite(fraction)||fraction<0||fraction>1) return fail('target-outside-own-segment');
  const px=a[0]+dx*fraction,pz=a[1]+dz*fraction;
  if (!near(to.x,px)||!near(to.z,pz)) return fail('target-off-own-lane');
  const travel=Math.hypot(px-fx,pz-fz);
  if (travel<1e-5) return fail('zero-displacement');
  // The block covers the WHOLE swept rat body. Checking endpoints only
  // against buildings in a clipped block without coverage would be unsafe.
  const {minX,maxX,minZ,maxZ}=block.bounds;
  if (![minX,maxX,minZ,maxZ].every(finite)||minX>=maxX||minZ>=maxZ)
    return fail('coverage-invalid');
  for (const p of [[fx,fz],[px,pz]]) {
    if (p[0]-bodyRadiusM<minX||p[0]+bodyRadiusM>maxX||
        p[1]-bodyRadiusM<minZ||p[1]+bodyRadiusM>maxZ)
      return fail('outside-grounded-coverage');
  }
  const fromPoint=[fx,fz], toPoint=[px,pz];
  for (const building of block.buildings) {
    // Do not trust a caller-provided bounding box to exclude a building;
    // derive from the actual footprint vertices, fail closed if malformed.
    if (!Array.isArray(building?.rings)||!building.rings.length ||
        !building.rings.every(r=>Array.isArray(r)&&r.length>=3&&r.every(point)))
      return fail('building-record-invalid');
    const coords=building.rings.flat();
    const minBX=Math.min(...coords.map(p=>p[0])),maxBX=Math.max(...coords.map(p=>p[0]));
    const minBZ=Math.min(...coords.map(p=>p[1])),maxBZ=Math.max(...coords.map(p=>p[1]));
    if (Math.max(fx,px)+bodyRadiusM<minBX ||
        Math.min(fx,px)-bodyRadiusM>maxBX ||
        Math.max(fz,pz)+bodyRadiusM<minBZ ||
        Math.min(fz,pz)-bodyRadiusM>maxBZ) continue;
    for (const ring of building.rings) {
      const clearance=segmentPolygonClearance(fromPoint,toPoint,ring);
      if (clearance===null) return fail('building-ring-invalid');
      if (clearance<=bodyRadiusM) return fail('building-obstacle:'+building.id);
    }
  }
  return ok;
}
