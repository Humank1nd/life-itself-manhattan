// Gate for one citizen, one verified consequence (Phase 017, P017.3 +
// review: durable exactly-once). Citizen decides → event commits →
// effect applies → checkpoint world+log → shutdown → restore (event log
// rebuilt into the applied set) → replay rejected at BOTH gates →
// continue with the identical causal future. Deterministic cognition;
// no model, no provider, no GPU.
import assert from 'node:assert/strict';
import { createLivingCity, tickLivingCity, citySnapshot } from '../src/living-city.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { perceive, propose, applyEventOnce, rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { validateAction, commitAction } from '../src/action-contract.js';
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
function ctxFor(state, tick, lastTick) {
  return { citizenIds: state.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(state.pedestrians.map((p) => [p.id, p])),
    tick, lanes: state.lanes, lastTick };
}
// Reference: tick to K, decide+commit+apply, checkpoint AFTER the effect,
// continue to N.
const cityA = createLivingCity(corridors, { seed: SEED, pedestrians: PEDS });
for (let n = 0; n < K; n++) tickLivingCity(cityA);
const appliedA = new Set();
let lastA = -1;
const logA = [];
let evA;
{
  const id = citizenId(cityA);
  const action = propose(cityA, id, perceive(cityA, id));
  const ctx = ctxFor(cityA, K, lastA);
  validateAction(action, ctx);
  evA = commitAction(action, ctx, appliedA, lastA);
  lastA = K;
  applyEventOnce(cityA, evA, appliedA);
  logA.push(evA);
}
const record = buildResumptionRecord({ snapshot: citySnapshot(cityA), corridorsSha256: corridorSha256, world: cityA.world });
const trust = { corridorsSha256: corridorSha256, world: cityA.world, citizenIds: cityA.pedestrians.map((p) => p.id) };
const refSnaps = [];
for (let n = K; n < N; n++) { tickLivingCity(cityA); refSnaps.push(snap(cityA)); }
// Restore: fresh process owns only the serialized checkpoint + log.
const wire = JSON.parse(JSON.stringify({ record, log: logA }));
const revived = resumeLivingCity(corridors, wire.record, trust);
const appliedB = rebuildApplied(wire.log);
assert.deepEqual([...appliedB], [evA.eventId]);
// Committed/applied/recovered are one set: verify the invariant explicitly.
assert.equal(verifyRecovery(wire.log, appliedB), true);
// Crash between commit and effect: logged but never applied → must replay,
// never silently proceed.
assert.throws(() => verifyRecovery(wire.log, new Set()), /never applied/);
assert.throws(() => verifyRecovery(wire.log, new Set([evA.eventId, 'ev-99-ghost'])), /missing from log/);
// Replay is rejected at the commit gate AND the effect gate.
assert.throws(() => commitAction(
  { ...propose(revived, citizenId(revived), perceive(revived, citizenId(revived))), actionId: evA.actionId, tick: K },
  ctxFor(revived, K, -1), appliedB, -1), /duplicate/);
assert.throws(() => applyEventOnce(revived, wire.log[0], appliedB), /duplicate effect/);
// Corrupt logs fail closed on rebuild.
assert.throws(() => rebuildApplied([{ noId: 1 }]), /corrupt/);
assert.throws(() => rebuildApplied([wire.log[0], wire.log[0]]), /duplicate event in log/);
// Continue: identical causal future, tick by tick.
for (let n = K; n < N; n++) { tickLivingCity(revived); assert.equal(snap(revived), refSnaps[n - K], `divergence at tick ${n + 1}`); }
console.log(`PASS citizen consequence — decided ${evA.type} by ${evA.actorId} at tick ${K}, committed+applied once, post-commit checkpoint restored, replay rejected at both gates, ${N - K} ticks identical`);
