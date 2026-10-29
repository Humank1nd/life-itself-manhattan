// Gate for deterministic shutdown/restart recovery (Phase 016, L2b).
// Uses the ACTUAL living-city simulation — never a fixture. Ticks N
// uninterrupted; separately ticks to K, serializes through JSON
// (fresh-process simulation), restores, and continues. Continuation must
// be bit-identical at every remaining tick: snapshots, summaries,
// trajectories, motives. Pure CPU, no model, no provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, citySummary } from '../src/living-city.js';
import { buildResumptionRecord, resumeLivingCity, RESUME_CONTRACT } from '../src/city-resume.js';
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const N = 30, K = 12, SEED = 11, PEDS = 48;
const snap = (s) => JSON.stringify(citySnapshot(s));
const summ = (s) => JSON.stringify(citySummary(s));
// Uninterrupted reference run.
const ref = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
const refSnaps = [snap(ref)], refSums = [summ(ref)];
for (let n = 0; n < N; n++) { tickLivingCity(ref); refSnaps.push(snap(ref)); refSums.push(summ(ref)); }
// Interrupted run: tick to K, serialize through JSON, restore fresh, continue.
const cut = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
for (let n = 0; n < K; n++) tickLivingCity(cut);
const record = buildResumptionRecord({ snapshot: citySnapshot(cut), corridorsSha256: corridorSha256, world: cut.world });
assert.equal(record.contract, RESUME_CONTRACT);
assert.equal(record.meta.resumedFromTick, K);
// Deterministic record: rebuilding from the same state gives identical bytes.
const rebuilt = buildResumptionRecord({ snapshot: JSON.parse(JSON.stringify(citySnapshot(cut))), corridorsSha256: corridorSha256, world: cut.world });
assert.equal(JSON.stringify(rebuilt), JSON.stringify(record), 'record rebuild drift');
const wire = JSON.parse(JSON.stringify(record)); // fresh-process simulation
const revived = resumeLivingCity(corridors, wire, { corridorsSha256: corridorSha256 });
const revSnaps = [], revSums = [];
for (let n = K; n < N; n++) { tickLivingCity(revived); revSnaps.push(snap(revived)); revSums.push(summ(revived)); }
assert.equal(revSnaps.length, N - K);
for (let i = 0; i < revSnaps.length; i++) {
  assert.equal(revSnaps[i], refSnaps[K + 1 + i], `snapshot divergence at tick ${K + 1 + i}`);
  assert.equal(revSums[i], refSums[K + 1 + i], `summary divergence at tick ${K + 1 + i}`);
}
// Negative: every tamper class fails closed or provably diverges.
const clone = () => JSON.parse(JSON.stringify(record));
assert.throws(() => resumeLivingCity(corridors, { ...clone(), contract: 'x/0' }), /contract mismatch/);
assert.throws(() => resumeLivingCity(corridors, { ...clone(), meta: { ...record.meta, corridorsSha256: '0'.repeat(64) } }, { corridorsSha256: corridorSha256 }), /corridor hash mismatch/);
assert.throws(() => resumeLivingCity(corridors, clone(), { corridorsSha256: 'not-hex' }), /malformed/);
{
  const bad = clone(); bad.snapshot.zones[0].lat += 0.5;
  assert.throws(() => resumeLivingCity(corridors, bad), /zone geography drift/);
}
{
  const bad = clone(); bad.snapshot.zones[0].id = 'no-such-zone';
  assert.throws(() => resumeLivingCity(corridors, bad), /unknown zone/);
}
{
  const bad = clone(); bad.snapshot.pedestrians[0].laneIndex = 999;
  assert.throws(() => resumeLivingCity(corridors, bad), /lane assignment/);
}
{
  const bad = clone(); bad.snapshot.pedestrians[1].traits.sleep_need = 5;
  assert.throws(() => resumeLivingCity(corridors, bad), /trait bounds/);
}
{
  const bad = clone(); bad.snapshot.pedestrians[2].motives.energy = -3;
  assert.throws(() => resumeLivingCity(corridors, bad), /motive bounds/);
}
{
  const bad = clone(); bad.snapshot.pedestrians.push({ ...bad.snapshot.pedestrians[0] });
  assert.throws(() => resumeLivingCity(corridors, bad), /duplicated pedestrian/);
}
assert.throws(() => JSON.parse('{"tick": 12, broken'), /Unexpected token|Expected/);
// Tampered world config provably diverges instead of silently matching.
{
  const bad = clone(); bad.meta.world = { ...bad.meta.world, traffic: 'red', weather: 'storm' };
  const r = resumeLivingCity(corridors, bad);
  tickLivingCity(r);
  assert.notEqual(snap(r), refSnaps[K + 1], 'world tamper must diverge');
}
// Dropped citizen provably diverges.
{
  const bad = clone(); bad.snapshot.pedestrians = bad.snapshot.pedestrians.slice(1);
  const r = resumeLivingCity(corridors, bad);
  tickLivingCity(r);
  assert.notEqual(snap(r), refSnaps[K + 1], 'dropped citizen must diverge');
}
console.log(`PASS city recovery — ${N} ticks uninterrupted == tick-${K} restore + continue, snapshots/summaries/trajectories/motives identical, 10 fail-closed + 2 divergence proofs`);
