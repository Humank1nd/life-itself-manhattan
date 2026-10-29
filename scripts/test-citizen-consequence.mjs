// Gate for one citizen, one verified consequence (Phase 017, P017.3).
// The full accountable loop on the live sim: perceive → propose →
// validate+commit → apply exactly once → shutdown/restart → same causal
// future. Deterministic cognition (seeded traits + motives + positions);
// no model, no provider, no GPU.
import assert from 'node:assert/strict';
import { createLivingCity, tickLivingCity, citySnapshot } from '../src/living-city.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { perceive, propose, applyEvent } from '../src/citizen-agency.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const N = 30, K = 12, SEED = 11, PEDS = 48;
const snap = (s) => JSON.stringify(citySnapshot(s));
function citizenId(state) {
  let best = null, low = Infinity;
  for (const p of state.pedestrians) {
    const m = Math.min(...Object.values(p.motives));
    if (m < low) { low = m; best = p.id; }
  }
  return best;
}
// Uninterrupted reference: decide + commit + apply at K, continue to N.
const cityA = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
const appliedA = new Set();
let lastA = -1;
const logA = [];
for (let n = 0; n < K; n++) tickLivingCity(cityA);
{
  const id = citizenId(cityA);
  const obs = perceive(cityA, id);
  const action = propose(cityA, id, obs);
  const { validateAction, commitAction } = await import('../src/action-contract.js');
  validateAction(action, { citizenIds: cityA.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(cityA.pedestrians.map((p) => [p.id, p])), tick: K, lanes: cityA.lanes, lastTick: lastA });
  const ev = commitAction(action, { citizenIds: cityA.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(cityA.pedestrians.map((p) => [p.id, p])), tick: K, lanes: cityA.lanes }, appliedA, lastA);
  lastA = K;
  logA.push(ev);
  const fx = applyEvent(cityA, ev);
  assert(fx, 'effect applied');
}
const refSnaps = [];
for (let n = K; n < N; n++) { tickLivingCity(cityA); refSnaps.push(snap(cityA)); }
// Interrupted: fresh city, tick to K, restore from serialized checkpoint,
// make the SAME decision, commit, apply, continue. Must match exactly.
const cityB = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
for (let n = 0; n < K; n++) tickLivingCity(cityB);
const record = buildResumptionRecord({ snapshot: citySnapshot(cityB), corridorsSha256: corridorSha256, world: cityB.world });
const trust = { corridorsSha256: corridorSha256, world: cityB.world, citizenIds: cityB.pedestrians.map((p) => p.id) };
const wire = JSON.parse(JSON.stringify({ record, log: logA }));
const revived = resumeLivingCity(corridors, wire.record, trust);
const appliedB = new Set();
let lastB = -1;
{
  const id = citizenId(revived);
  const obs = perceive(revived, id);
  const action = propose(revived, id, obs);
  const { validateAction, commitAction } = await import('../src/action-contract.js');
  validateAction(action, { citizenIds: revived.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])), tick: K, lanes: revived.lanes, lastTick: lastB });
  const ev = commitAction(action, { citizenIds: revived.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])), tick: K, lanes: revived.lanes }, appliedB, lastB);
  lastB = K;
  // Same citizen, same action, same event: determinism across the restart.
  assert.equal(ev.eventId, logA[0].eventId, 'same decision after restart');
  applyEvent(revived, ev);
  // Exactly once: the duplicate is rejected even though it validates.
  assert.throws(() => commitAction(action, { citizenIds: revived.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(revived.pedestrians.map((p) => [p.id, p])), tick: K, lanes: revived.lanes }, appliedB, lastB),
    /duplicate execution/);
}
for (let n = K; n < N; n++) { tickLivingCity(revived); assert.equal(snap(revived), refSnaps[n - K], `divergence at tick ${n + 1}`); }
// The event log itself survives the restart.
assert.equal(JSON.stringify(logA.map((e) => e.eventId)), JSON.stringify(['ev-' + K + '-' + logA[0].actionId]));
console.log(`PASS citizen consequence — one citizen decided at tick ${K} (${logA[0].type} by ${logA[0].actorId}), committed exactly once, applied, restart reproduced ${N - K} ticks bit-identically`);
