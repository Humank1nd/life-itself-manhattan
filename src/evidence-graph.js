// Spatiotemporal evidence, version 1. No historical claims without provenance.
// ENU positions come exclusively from canonical Twin Earth anchors.
export const EVIDENCE_VERSION = 'life-itself-evidence/1.0.0';
const imagePath = /^assets\/evidence\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/;
const rights = new Set(['original','public-domain','licensed-for-web']);
const status = new Set(['documented','reported','hypothesis']);
const conditions = { weather: new Set(['clear','cloudy','rain','snow','fog','unknown']),
  lighting: new Set(['dawn','day','dusk','night','unknown']) };
function requireOk(ok, why) { if (!ok) throw new Error(why); }
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
}
const sourceOk = s => !!s && typeof s.title === 'string' && !!s.title.trim() &&
  typeof s.url === 'string' && /^https:\/\/[^\s]+$/.test(s.url);
const binOk = b => typeof b === 'string' && /^\d{7}$/.test(b);
export function validateEvidenceGraph(graph, anchors, bins = null) {
  requireOk(graph?.schemaVersion === EVIDENCE_VERSION && graph.worldId === 'life-itself:manhattan', 'evidence version/world mismatch');
  requireOk(graph.anchorLayer === 'data/anchors-enu.json', 'evidence anchor registry mismatch');
  requireOk(Array.isArray(anchors) && anchors.length > 0, 'no canonical anchors');
  requireOk(Array.isArray(graph.photos) && Array.isArray(graph.occupancies), 'evidence collections missing');
  const ids = new Set(anchors.map(a=>a.id));
  requireOk(ids.size === anchors.length, 'duplicate anchors');
  const photoIds = new Set(), occupationIds = new Set();
  for (const p of graph.photos) {
    requireOk(typeof p.id === 'string' && p.id.length && !photoIds.has(p.id), 'duplicate/invalid photo ID');
    photoIds.add(p.id);
    requireOk(ids.has(p.anchorId), 'photo references unknown surveyed anchor');
    // Historical archives frequently know only the year; never invent Jan 1.
    const precision = p.capturePrecision ?? 'day';
    requireOk(precision === 'day' || precision === 'year', 'capture precision unsupported');
    const captureOK = precision === 'day' ? validDate(p.capturedAt) :
      p.capturedAt === null && Number.isInteger(p.capturedYear) && p.capturedYear >= 1800 && p.capturedYear <= 2100;
    requireOk(captureOK && validDate(p.recordedAt), 'photo date invalid');
    requireOk(typeof p.imageUri === 'string' && imagePath.test(p.imageUri), 'photo URI not allowlisted');
    requireOk(rights.has(p.rights) && sourceOk(p.source), 'photo rights or source missing');
    requireOk(status.has(p.status), 'photo evidence state invalid');
    requireOk(conditions.weather.has(p.conditions?.weather) && conditions.lighting.has(p.conditions?.lighting), 'photo conditions invalid');
    requireOk(p.yawDeg === null || (Number.isFinite(p.yawDeg) && p.yawDeg >= -360 && p.yawDeg <= 360), 'invalid camera orientation');
    requireOk(p.buildingBin == null || binOk(p.buildingBin), 'invalid photo building BIN');
    if (p.buildingBin != null && bins) requireOk(bins.has(p.buildingBin), 'photo building not in island');
  }
  for (const o of graph.occupancies) {
    requireOk(typeof o.id === 'string' && o.id.length && !occupationIds.has(o.id), 'duplicate/invalid occupancy ID');
    occupationIds.add(o.id);
    requireOk(binOk(o.buildingBin) && (!bins || bins.has(o.buildingBin)), 'occupancy building unknown');
    requireOk(typeof o.businessName === 'string' && !!o.businessName.trim(), 'business name required');
    requireOk(validDate(o.validFrom) && (o.validTo === null || validDate(o.validTo)), 'occupancy interval invalid');
    requireOk(o.validTo === null || o.validFrom < o.validTo, 'occupancy interval reversed');
    requireOk(validDate(o.recordedAt) && sourceOk(o.source) && status.has(o.status), 'occupancy provenance missing');
  }
  return {photos:photoIds.size, occupancies:occupationIds.size};
}
export function photosInYear(graph, year, anchorId = null) {
  requireOk(Number.isInteger(year) && year >= 1800 && year <= 2100, 'invalid year');
  return graph.photos.filter(p => (p.capturePrecision === 'year' ? p.capturedYear : Number(p.capturedAt.slice(0,4))) === year &&
    (anchorId === null || p.anchorId === anchorId)).sort((a,b)=>Number(a.capturePrecision==='year')-Number(b.capturePrecision==='year')||(a.capturedAt||'').localeCompare(b.capturedAt||'')||a.id.localeCompare(b.id));
}
export function occupanciesInYear(graph, year, bin = null) {
  requireOk(Number.isInteger(year) && year >= 1800 && year <= 2100, 'invalid year');
  const start = String(year).padStart(4,'0') + '-01-01';
  const end = String(year+1).padStart(4,'0') + '-01-01';
  return graph.occupancies.filter(o=>(bin === null || bin === o.buildingBin) &&
    o.validFrom < end && (o.validTo === null || o.validTo > start));
}
export function spatialAnchorEdges(anchors, maxNeighbors = 2) {
  const result = [], seen = new Set();
  for (const a of anchors) {
    const closest = anchors.filter(b=>b.id!==a.id)
      .map(b=>({b,d:Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}))
      .sort((p,q)=>p.d-q.d).slice(0,maxNeighbors);
    for (const {b,d} of closest) {
      const key = [a.id,b.id].sort().join('|');
      if (!seen.has(key)) { seen.add(key); result.push({from:a.id,to:b.id,distanceM:d,reason:'geographic-proximity'}); }
    }
  }
  return result;
}
