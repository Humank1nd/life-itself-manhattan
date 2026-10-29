// Gate for the autonomous action/event contract (Phase 017, 017.2 +
// review hardening). Observation → ProposedAction → WorldEvent → Receipt,
// all pure. Commit always validates (no bypass); causal order and
// idempotency enforced; basis bound to the actor's own observations;
// moves proved against lane geometry.
import assert from 'node:assert/strict';
import { validateObservation, validateAction, commitAction, actionReceipt, distToLanes } from '../src/action-contract.js';
import { buildSidewalkLanes } from '../src/living-city.js';
import { readFileSync } from 'node:fs';
const citizens = ['ped_1', 'ped_2', 'ped_3'];
const positions = { ped_1: { x: 0, z: 0 }, ped_2: { x: 10, z: 0 }, ped_3: { x: 1000, z: 1000 } };
// Synthetic straight lane through the origin for unit geometry checks.
const unitLanes = [{ waypoints: [[0, 0], [100, 0]] }];
const ctx = { citizenIds: citizens, positions, tick: 40, lanes: unitLanes, lastTick: -1 };
const mkObs = (over = {}) => ({ schemaVersion: 'life-itself-observation/1.0.0', observationId: 'o1', observerId: 'ped_1', tick: 40, kind: 'saw-crowd', summary: 'busy', ...over });
assert.equal(validateObservation(mkObs(), ctx), true);
// Happy paths: move (on-lane), rest, socialize.
const move = { schemaVersion: 'life-itself-action/1.0.0', actionId: 'a1', actorId: 'ped_1', tick: 40, type: 'move', params: { to: { x: 3, z: 0 } }, basis: [mkObs()] };
assert.equal(validateAction(move, ctx), true);
assert.equal(distToLanes(3, 0, unitLanes), 0);
assert(distToLanes(3, 50, unitLanes) > 8, 'off-lane measures far');
const rest = { ...move, actionId: 'a2', type: 'rest', params: {} };
assert.equal(validateAction(rest, ctx), true);
const soc = { ...move, actionId: 'a3', type: 'socialize', params: { with: 'ped_2' } };
assert.equal(validateAction(soc, ctx), true);
const applied = new Set();
const ev = commitAction(soc, ctx, applied, -1);
assert.equal(ev.eventId, 'ev-40-a3');
assert.equal(ev.generated, false);
assert.deepEqual(ev.basis, ['o1']);
assert.deepEqual(actionReceipt(soc, ev), { actionId: 'a3', status: 'committed', eventId: 'ev-40-a3' });
assert.deepEqual(actionReceipt(soc, ['nope']).status, 'rejected');
// No bypass: commitAction validates even when validateAction was skipped.
assert.throws(() => commitAction({ ...move, actionId: 'evil', type: 'fly' }, ctx, new Set(), -1), /unknown action type/);
// No duplicate execution: same event ID twice is rejected.
assert.throws(() => commitAction({ ...soc, actionId: 'a3' }, ctx, applied, -1), /duplicate execution/);
// Causal order: predating the last commit is rejected.
assert.throws(() => commitAction({ ...move, actionId: 'late', tick: 39, basis: [mkObs({ tick: 39, observationId: 'o0' })] }, ctx, new Set(), 40), /causal order/);
// Rejections: unknown observer/actor, future observation, teleport,
// off-lane target, distant stranger, self-social, unknown type, bad schema,
// future tick, wrong-citizen basis, missing lanes.
const bad = [
  [{ ...mkObs(), observerId: 'ghost' }, 'observer', true],
  [{ ...mkObs(), tick: 41 }, 'future', true],
  [{ ...mkObs(), observationId: '' }, 'observation id', true],
  [{ ...move, actorId: 'ghost', basis: [] }, 'actor', false],
  [{ ...move, type: 'fly', basis: [] }, 'type', false],
  [{ ...move, tick: 99, basis: [] }, 'tick', false],
  [{ ...move, actionId: 'a4', params: { to: { x: 500, z: 0 } }, basis: [] }, 'teleport', false],
  [{ ...move, actionId: 'a5', params: { to: { x: 3, z: 50 } }, basis: [] }, 'off-lane', false],
  [{ ...move, actionId: 'a5b', params: { to: { x: 3, z: 0 } }, basis: [] }, 'lanes-missing', false, true],
  [{ ...move, actionId: 'a6', type: 'socialize', params: { with: 'ghost' }, basis: [] }, 'stranger', false],
  [{ ...move, actionId: 'a7', type: 'socialize', params: { with: 'ped_3' }, basis: [] }, 'distant', false],
  [{ ...move, actionId: 'a8', type: 'socialize', params: { with: 'ped_1' }, basis: [] }, 'self', false],
  [{ ...move, actionId: 'a9', params: {}, basis: [] }, 'target', false],
  [{ ...move, actionId: 'a10', basis: [{ ...mkObs(), observerId: 'ped_2', observationId: 'o2' }] }, 'another citizen', false],
  [{ ...move, actionId: 'a11', basis: [{ ...mkObs(), tick: 41, observationId: 'o3' }] }, 'future basis', false],
  [{ schemaVersion: 'nope' }, 'schema', false],
];
for (const [obj, why, isObs, noLanes] of bad) {
  if (isObs) { assert.throws(() => validateObservation(obj, ctx), Error, why); continue; }
  const c = noLanes ? { ...ctx, lanes: null } : ctx;
  assert.throws(() => validateAction(obj, c), Error, why);
  assert.throws(() => commitAction(obj, c, new Set(), -1), Error, 'commit bypass ' + why);
}
// Real lanes: a Manhattan corridor vertex accepts a step along its segment.
{
  const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
  const { buildSidewalkLanes } = await import('../src/living-city.js');
  const lanes = buildSidewalkLanes(corridors);
  const [x, z] = lanes[0].waypoints[0];
  const [x2, z2] = lanes[0].waypoints[1];
  const t = { x: x + (x2 - x) * 0.01, z: z + (z2 - z) * 0.01 };
  const a = { schemaVersion: 'life-itself-action/1.0.0', actionId: 'real', actorId: 'ped_1', tick: 40,
    type: 'move', params: { to: t }, basis: [] };
  assert.equal(validateAction(a, { ...ctx, positions: { ped_1: { x, z } }, lanes }), true);
}
console.log('PASS action contract — observe/propose/commit/receipt with no bypass, causal order, idempotency, basis binding, lane geometry; 3 happy paths, 17 fail-closed rejections');
