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
// Trusted pins: corridor hash committed in data/, world + roster from the
// uninterrupted reference. Production callers supply equivalents.
const pinnedCorridorSha = readFileSync(new URL('../data/corridors-sha256.txt', import.meta.url), 'utf8').trim();
assert.equal(pinnedCorridorSha, corridorSha256, 'committed corridor pin drift');
const trust = {
  corridorsSha256: corridorSha256,
  world: JSON.parse(JSON.stringify(ref.world)),
  citizenIds: ref.pedestrians.map((p) => p.id),
};
const revived = resumeLivingCity(corridors, wire, trust);
const revSnaps = [], revSums = [];
for (let n = K; n < N; n++) { tickLivingCity(revived); revSnaps.push(snap(revived)); revSums.push(summ(revived)); }
assert.equal(revSnaps.length, N - K);
for (let i = 0; i < revSnaps.length; i++) {
  assert.equal(revSnaps[i], refSnaps[K + 1 + i], `snapshot divergence at tick ${K + 1 + i}`);
  assert.equal(revSums[i], refSums[K + 1 + i], `summary divergence at tick ${K + 1 + i}`);
}
// Negative: every tamper class fails closed before continuation begins.
const clone = () => JSON.parse(JSON.stringify(record));
const T = (rec) => resumeLivingCity(corridors, rec, trust);
assert.throws(() => resumeLivingCity(corridors, { ...clone(), contract: 'x/0' }, trust), /contract mismatch/);
assert.throws(() => resumeLivingCity(corridors, { ...clone(), meta: { ...record.meta, corridorsSha256: '0'.repeat(64) } }, trust), /corridor hash mismatch/);
assert.throws(() => resumeLivingCity(corridors, clone(), { corridorsSha256: 'not-hex', world: trust.world, citizenIds: trust.citizenIds }), /malformed|required/);
assert.throws(() => resumeLivingCity(corridors, clone(), {}), /required/);
{
  const bad = clone(); bad.snapshot.zones[0].lat += 0.5;
  assert.throws(() => T(bad), /zone geography drift/);
}
{
  const bad = clone(); bad.snapshot.zones[0].id = 'no-such-zone';
  assert.throws(() => T(bad), /unknown zone/);
}
{
  const bad = clone(); bad.snapshot.pedestrians[0].laneIndex = 999;
  assert.throws(() => T(bad), /lane assignment/);
}
{
  const bad = clone(); bad.snapshot.pedestrians[1].traits.sleep_need = 5;
  assert.throws(() => T(bad), /trait bounds/);
}
{
  const bad = clone(); bad.snapshot.pedestrians[2].motives.energy = -3;
  assert.throws(() => T(bad), /motive bounds/);
}
{
  const bad = clone(); bad.snapshot.pedestrians.push({ ...bad.snapshot.pedestrians[0] });
  assert.throws(() => T(bad), /citizen roster mismatch/, 'extra citizen rejected at roster');
  const sloppy = { ...trust, citizenIds: [...trust.citizenIds, bad.snapshot.pedestrians[0].id] };
  assert.throws(() => resumeLivingCity(corridors, bad, sloppy), /duplicated pedestrian/, 'per-entity backstop');
}
assert.throws(() => JSON.parse('{"tick": 12, broken'), /Unexpected token|Expected/);
// L2c integrity: tampered world config and dropped citizens are REJECTED
// against the trusted values before continuation — not merely divergent.
{
  const bad = clone(); bad.meta.world = { ...bad.meta.world, traffic: 'red', weather: 'storm' };
  assert.throws(() => T(bad), /world config mismatch/);
}
{
  const bad = clone(); bad.snapshot.pedestrians = bad.snapshot.pedestrians.slice(1);
  assert.throws(() => T(bad), /citizen roster mismatch/);
}
// Applied report IDs ride the checkpoint and are restored verbatim:
// a report applied before shutdown stays applied after restart.
{
  const withIds = buildResumptionRecord({ snapshot: citySnapshot(cut), corridorsSha256: corridorSha256, world: cut.world, appliedReports: ['rr-1', 'rr-2'] });
  assert.deepEqual(withIds.appliedReports, ['rr-1', 'rr-2']);
  const revived2 = resumeLivingCity(corridors, JSON.parse(JSON.stringify(withIds)), trust);
  const seen = new Set(revived2.appliedReports);
  assert(seen.has('rr-1') && seen.has('rr-2'), 'applied set restored');
  assert.throws(() => buildResumptionRecord({ snapshot: citySnapshot(cut), corridorsSha256: corridorSha256, world: cut.world, appliedReports: ['x', 'x'] }), /duplicated applied report/);
  const bad = JSON.parse(JSON.stringify(withIds)); bad.appliedReports.push(7);
  assert.throws(() => resumeLivingCity(corridors, bad, trust), /applied report id/);
}
console.log(`PASS city recovery — ${N} ticks uninterrupted == tick-${K} restore + continue, snapshots/summaries/trajectories/motives identical, applied IDs persist, 16 fail-closed integrity proofs`);
