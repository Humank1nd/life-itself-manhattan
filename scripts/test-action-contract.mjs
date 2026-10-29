// Gate for the autonomous action/event contract (Phase 017, 017.2).
// Observation → ProposedAction → WorldEvent → Receipt, all pure.
// Invalid actors, future observations, teleport moves, stranger
// socializing, and unknown types fail closed before commitment.
import assert from 'node:assert/strict';
import { validateObservation, validateAction, commitAction, actionReceipt } from '../src/action-contract.js';
const citizens = ['ped_1', 'ped_2', 'ped_3'];
const positions = { ped_1: { x: 0, z: 0 }, ped_2: { x: 10, z: 0 }, ped_3: { x: 1000, z: 1000 } };
const ctx = { citizenIds: citizens, positions, tick: 40 };
const obs = { schemaVersion: 'life-itself-observation/1.0.0', observerId: 'ped_1', tick: 40, kind: 'saw-crowd', summary: 'busy' };
assert.equal(validateObservation(obs, ctx), true);
// Happy paths: move, rest, socialize.
const move = { schemaVersion: 'life-itself-action/1.0.0', actionId: 'a1', actorId: 'ped_1', tick: 40, type: 'move', params: { to: { x: 3, z: 4 } }, basis: [] };
assert.equal(validateAction(move, ctx), true);
const rest = { ...move, actionId: 'a2', type: 'rest', params: {} };
assert.equal(validateAction(rest, ctx), true);
const soc = { ...move, actionId: 'a3', type: 'socialize', params: { with: 'ped_2' } };
assert.equal(validateAction(soc, ctx), true);
const ev = commitAction(soc);
assert.equal(ev.eventId, 'ev-40-a3');
assert.equal(ev.generated, false);
assert.deepEqual(actionReceipt(soc, ev), { actionId: 'a3', status: 'committed', eventId: 'ev-40-a3' });
assert.deepEqual(actionReceipt(soc, ['nope']).status, 'rejected');
// Rejections: unknown observer/actor, future observation, teleport,
// distant stranger, self-social, unknown type, bad schema, future tick.
const bad = [
  [{ ...obs, observerId: 'ghost' }, 'observer'],
  [{ ...obs, tick: 41 }, 'future'],
  [{ ...move, actorId: 'ghost' }, 'actor'],
  [{ ...move, type: 'fly' }, 'type'],
  [{ ...move, tick: 99 }, 'tick'],
  [{ ...move, actionId: 'a4', params: { to: { x: 500, z: 0 } } }, 'teleport'],
  [{ ...move, actionId: 'a5', type: 'socialize', params: { with: 'ghost' } }, 'stranger'],
  [{ ...move, actionId: 'a6', type: 'socialize', params: { with: 'ped_3' } }, 'distant'],
  [{ ...move, actionId: 'a7', type: 'socialize', params: { with: 'ped_1' } }, 'self'],
  [{ ...move, actionId: 'a8', params: {} }, 'target'],
  [{ schemaVersion: 'nope' }, 'schema'],
];
for (const [obj, why] of bad) {
  const isObs = 'observerId' in obj;
  assert.throws(() => isObs ? validateObservation(obj, ctx) : validateAction(obj, ctx), Error, why);
}
console.log('PASS action contract — observe/propose/commit/receipt, 3 happy paths, 11 fail-closed rejections');
