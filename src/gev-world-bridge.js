// GEV → Life Itself: validate a versioned read-only world-context snapshot.
import { sha256Hex, canonical } from './journal.js';
// Does not adjudicate physical truth: see per-field provenance classifications.
const fail = (reason) => { throw new Error('GEV world snapshot: ' + reason); };
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCoordinate = (v, bound) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= bound;

export function normalizeGEVWorldSnapshot(input, { now = Date.now(), maxAgeMs = 120000 } = {}) {
  if (!isRecord(input) || input.schemaVersion !== 'life-itself-gev-world/1.0.0') fail('schema');
  if (input.source?.system !== 'gods-eye-view' ||
      typeof input.source?.revision !== 'string' ||
      !/^[a-f0-9]{7,40}$/i.test(input.source.revision)) fail('source identity');
  if (typeof input.snapshotId !== 'string' || !/^gev-[a-f0-9]{32,64}$/i.test(input.snapshotId)) fail('snapshot identity');
  const timestamp = Date.parse(input.recordedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now) ||
      timestamp > now + 5000 || now - timestamp > maxAgeMs) fail('stale or future timestamp');
  const w = input.world;
  if (!isRecord(w) || !['red','yellow','green'].includes(w.traffic) ||
      !['good','bad'].includes(w.weather) || typeof w.servicesNear !== 'boolean' ||
      !Array.isArray(w.disasters) || w.disasters.length > 1000) fail('world fields');
  const disasters = w.disasters.map((d) => {
    if (!isRecord(d) || !isCoordinate(d.lat,90) || !isCoordinate(d.lon,180) ||
        !['fire','quake'].includes(d.type)) fail('disaster geometry/type');
    const out = { lat: d.lat, lon: d.lon, type: d.type };
    if (d.mag !== undefined) {
      if (typeof d.mag !== 'number' || !Number.isFinite(d.mag)) fail('disaster magnitude');
      out.mag = d.mag;
    }
    return out;
  });
  const p = input.provenance;
  if (!isRecord(p) || !['proxy','fallback','measured'].includes(p.traffic?.classification) ||
      !['fallback','derived-observation'].includes(p.weather?.classification) ||
      !['unavailable','observed-feed'].includes(p.fires?.classification) ||
      !['unavailable','observed-feed'].includes(p.quakes?.classification) ||
      p.servicesNear?.classification !== 'camera-registry-proxy') fail('field provenance');
  return {
    schemaVersion: input.schemaVersion, snapshotId: input.snapshotId,
    source: { system: 'gods-eye-view', revision: input.source.revision },
    recordedAt: input.recordedAt,
    world: { traffic: w.traffic, weather: w.weather, disasters, servicesNear: w.servicesNear },
    provenance: structuredClone(p),
  };
}

export function applyGEVWorldSnapshot(state, snapshot, priorSnapshotId = null, options = {}) {
  const verified = normalizeGEVWorldSnapshot(snapshot, options);
  if (!state || !isRecord(state.world) || !Number.isInteger(state.tickCount)) fail('sim state');
  if (verified.snapshotId === priorSnapshotId) return { applied: false, snapshot: verified };
  // Only world conditions change. Actor state, geometry, and authority remain owned by LIM.
  state.world = structuredClone(verified.world);
  return { applied: true, snapshot: verified };
}

// The snapshot ID is content-derived by the GEV bridge. Verify its bytes at
// the LIM trust boundary before recording or applying the world conditions.
export async function verifyGEVWorldSnapshot(input, options = {}) {
  const checked = normalizeGEVWorldSnapshot(input, options);
  const digest = await sha256Hex(canonical([
    input.recordedAt, input.source.revision, input.world, input.provenance
  ]));
  if (checked.snapshotId !== 'gev-' + digest) fail('content digest mismatch');
  return checked;
}
