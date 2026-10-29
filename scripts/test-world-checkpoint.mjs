import assert from 'node:assert/strict';
import { captureWorldCheckpoint, restoreWorldCheckpoint } from '../src/world-checkpoint.js';
const sources = { snapshotSha256: 'a'.repeat(64), spatialMemorySha256: 'b'.repeat(64), buildingVersionsSha256: 'c'.repeat(64) };
const simulation = { seed: 20261028, tick: 30, zones: [{ id: 'times_square_hub', pop: 4 }], pedestrians: [{ id: 'person-1', x: 1, z: 2, motives: { energy: 60 } }] };
const c = captureWorldCheckpoint({ ...sources, selectedYear: 2026, simulation });
assert.deepEqual(restoreWorldCheckpoint(c, sources).simulation, simulation);
const restored = restoreWorldCheckpoint(c, sources);
restored.simulation.pedestrians[0].x = 999;
assert.equal(c.simulation.pedestrians[0].x, 1);
assert.equal(c.renderer.provider, 'none');
assert.equal(c.historicalTruth, 'source-only');
const mutate = f => { const x = structuredClone(c); f(x); return x; };
for (const change of [
  x => x.sources.spatialMemorySha256 = 'd'.repeat(64),
  x => x.sources.buildingVersionsSha256 = 'd'.repeat(64),
  x => x.renderer.provider = 'matrix-game',
  x => x.renderer.generatedFrames = ['fake.png'],
  x => x.historicalTruth = 'verified-2005',
  x => x.simulation.pedestrians.push({ id: 'person-1' }),
  x => x.simulation.tick = -1,
]) assert.throws(() => restoreWorldCheckpoint(mutate(change), sources), /world-checkpoint/);
assert.throws(() => captureWorldCheckpoint({ ...sources, selectedYear: 2026, simulation: { ...simulation, pedestrians: [{ id: 'x' }, { id: 'x' }] } }), /identities/);
console.log('PASS P016-L2 world checkpoint: provider-off restore, source drift, identity collision, history and generated-frame rejection');
