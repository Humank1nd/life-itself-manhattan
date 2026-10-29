// P016-L2: model-independent, metadata-only world checkpoint boundary.
// Pure functions: no persistence, network, provider allocation or inference.
export const CHECKPOINT_SCHEMA = 'life-itself-world-checkpoint/1.0.0';
const SHA = /^[0-9a-f]{64}$/;
const assert = (ok, message) => { if (!ok) throw new Error('world-checkpoint: ' + message); };
const copy = (value) => JSON.parse(JSON.stringify(value));
const safe = (value) => {
  assert(value !== undefined, 'undefined state');
  const s = JSON.stringify(value);
  assert(typeof s === 'string' && s.length < 5_000_000, 'state must be bounded JSON');
  const parsed = JSON.parse(s);
  assert(JSON.stringify(parsed) === s, 'state must be plain JSON');
  return parsed;
};
export function captureWorldCheckpoint({ snapshotSha256, spatialMemorySha256, buildingVersionsSha256, simulation, selectedYear }) {
  for (const [key, value] of Object.entries({ snapshotSha256, spatialMemorySha256, buildingVersionsSha256 }))
    assert(SHA.test(value || ''), 'invalid ' + key);
  assert(Number.isInteger(selectedYear) && selectedYear >= 1800 && selectedYear <= 2100, 'year');
  const state = safe(simulation);
  assert(Number.isInteger(state.tick) && state.tick >= 0 && Number.isInteger(state.seed), 'simulation clock/seed');
  assert(Array.isArray(state.zones) && Array.isArray(state.pedestrians), 'simulation entities');
  const ids = state.pedestrians.map(p => p.id);
  assert(new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && id.length > 0), 'pedestrian identities');
  return {
    schemaVersion: CHECKPOINT_SCHEMA, worldId: 'life-itself:manhattan',
    sources: { snapshotSha256, spatialMemorySha256, buildingVersionsSha256 },
    selectedYear, simulation: state,
    renderer: { provider: 'none', allocation: 'none', generatedFrames: [] },
    historicalTruth: 'source-only',
  };
}
export function restoreWorldCheckpoint(checkpoint, expectedSources) {
  assert(checkpoint?.schemaVersion === CHECKPOINT_SCHEMA && checkpoint.worldId === 'life-itself:manhattan', 'schema/world');
  assert(checkpoint.historicalTruth === 'source-only', 'historical claim');
  assert(checkpoint.renderer?.provider === 'none' && checkpoint.renderer?.allocation === 'none' &&
    Array.isArray(checkpoint.renderer.generatedFrames) && checkpoint.renderer.generatedFrames.length === 0,
    'provider state must not be persistent');
  assert(expectedSources && Object.keys(checkpoint.sources || {}).length === 3, 'source set');
  for (const key of ['snapshotSha256', 'spatialMemorySha256', 'buildingVersionsSha256'])
    assert(SHA.test(expectedSources[key] || '') && checkpoint.sources[key] === expectedSources[key], 'source mismatch ' + key);
  // Revalidate, and clone to prevent callers from mutating the checkpoint.
  const c = captureWorldCheckpoint({ ...checkpoint.sources, simulation: checkpoint.simulation, selectedYear: checkpoint.selectedYear });
  return { selectedYear: c.selectedYear, simulation: copy(c.simulation), sources: copy(c.sources) };
}
