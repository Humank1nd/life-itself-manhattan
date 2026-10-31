// S3-001: browser-independent player intent. The renderer owns held keys and
// camera heading; LIM alone decides if a movement is lawful and how it commits.
// No simulation writes, journal writes, timers, DOM, or external dependencies.
import { ACTION_CONTRACT, MAX_MOVE_M, validateAction } from './action-contract.js';
import { perceive } from './citizen-agency.js';

export const PLAYER_INTENT_CONTRACT = 'life-itself-player-input/1.0.0';
export const PLAYER_MOVE_LIMIT_M = 5; // Conservative cap inside P017's 10m single-tick bound.
const EPS = 1e-7;
const KEY_AXES = Object.freeze({
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyD: [1, 0], ArrowRight: [1, 0],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
});
const finite = Number.isFinite;
const reject = (reason) => Object.freeze({ status: 'rejected', reason });

// Poll key state rather than writing world state from event handlers. A stable
// code-based mapping is independent of keyboard layout and key-repeat events.
export function axesFromHeldKeys(keys) {
  if (!keys || typeof keys[Symbol.iterator] !== 'function') throw new Error('player-input: keys must be iterable');
  let right = 0;
  let forward = 0;
  const held = new Set(keys);
  for (const code of held) {
    if (typeof code !== 'string') throw new Error('player-input: invalid key code');
    const contribution = KEY_AXES[code];
    if (contribution) {
      right += contribution[0];
      forward += contribution[1];
    }
  }
  right = Math.sign(right);
  forward = Math.sign(forward);
  const length = Math.hypot(right, forward);
  return Object.freeze(length ? { right: right / length, forward: forward / length } : { right: 0, forward: 0 });
}

// A tiny lifecycle-safe held-key sampler. Hosts call clear() on blur, lost
// focus, camera takeover, pause, or player death. It is not a global listener.
export function createPlayerInputSampler() {
  const held = new Set();
  return Object.freeze({
    press(code) {
      if (!Object.hasOwn(KEY_AXES, code)) return false;
      held.add(code);
      return true;
    },
    release(code) {
      if (!Object.hasOwn(KEY_AXES, code)) return false;
      held.delete(code);
      return true;
    },
    clear() { held.clear(); },
    axes() { return axesFromHeldKeys(held); },
  });
}

// The existing S2 walker owns one lane segment at a time. Projection must
// target that *same* segment: action-contract's broad lane tolerance alone
// is not sufficient, since applyEvent projects onto the rat's own segment.
// Heading: yaw 0 faces +Z, +pi/2 faces +X, in LIM ENU coordinates.
export function selectPlayerMove(state, { actorId, right = 0, forward = 0, yawRadians = 0, distanceM = PLAYER_MOVE_LIMIT_M } = {}) {
  if (!state || !Array.isArray(state.pedestrians) || !Array.isArray(state.lanes) ||
      !Number.isInteger(state.tickCount) || state.tickCount < 0) return reject('world-unavailable');
  if (typeof actorId !== 'string' || !actorId || actorId.length > 128) return reject('invalid-actor');
  const matches = state.pedestrians.filter((entry) => entry?.id === actorId);
  if (matches.length > 1) return reject('ambiguous-actor');
  const ped = matches[0];
  if (!ped) return reject('unknown-actor');
  if (ped.alive === false) return reject('actor-dead');
  if (![right, forward, yawRadians, distanceM].every(finite) ||
      Math.abs(right) > 1 || Math.abs(forward) > 1 ||
      distanceM <= 0 || distanceM > Math.min(MAX_MOVE_M, PLAYER_MOVE_LIMIT_M))
    return reject('invalid-input');
  const magnitude = Math.hypot(right, forward);
  if (magnitude <= EPS) return Object.freeze({ status: 'abstained', reason: 'no-input' });
  const lane = state.lanes[ped.laneIndex];
  const a = lane?.waypoints?.[ped.segmentIndex];
  const b = lane?.waypoints?.[ped.segmentIndex + 1];
  if (!Array.isArray(a) || !Array.isArray(b) ||
      ![a[0], a[1], b[0], b[1], ped.x, ped.z, ped.fraction].every(finite) ||
      ped.fraction < 0 || ped.fraction > 1) return reject('lane-unavailable');
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length <= EPS) return reject('degenerate-lane');
  if (Math.hypot(ped.x - (a[0] + dx * ped.fraction), ped.z - (a[1] + dz * ped.fraction)) > 1e-4)
    return reject('actor-off-segment');
  // Project the camera-relative input onto the *current* segment tangent.
  // Diagonal movement is normalized so it cannot increase per-tick travel.
  const ux = (Math.cos(yawRadians) * right + Math.sin(yawRadians) * forward) / magnitude;
  const uz = (-Math.sin(yawRadians) * right + Math.cos(yawRadians) * forward) / magnitude;
  const signedInput = (ux * dx + uz * dz) / length;
  if (Math.abs(signedInput) <= EPS) return Object.freeze({ status: 'abstained', reason: 'perpendicular' });
  const stepM = Math.min(distanceM * Math.abs(signedInput), length * (signedInput > 0 ? 1 - ped.fraction : ped.fraction));
  if (stepM <= EPS) return Object.freeze({ status: 'abstained', reason: 'segment-boundary' });
  const fraction = Math.min(1, Math.max(0, ped.fraction + Math.sign(signedInput) * stepM / length));
  const to = { x: a[0] + dx * fraction, z: a[1] + dz * fraction };
  // Broken or untrusted roster state cannot become a valid action basis.
  let observation;
  try { observation = perceive(state, actorId); }
  catch { return reject('observation-unavailable'); }
  const action = {
    schemaVersion: ACTION_CONTRACT,
    actionId: `act-${state.tickCount}-${actorId}-player-move`,
    actorId, tick: state.tickCount, type: 'move', params: { to }, basis: [observation],
  };
  // Selection never bypasses the existing authority validator.
  try {
    validateAction(action, {
      citizenIds: state.pedestrians.map((entry) => entry.id),
      positions: Object.fromEntries(state.pedestrians.map((entry) => [entry.id, { x: entry.x, z: entry.z }])),
      tick: state.tickCount,
      lanes: state.lanes,
    });
  } catch {
    return reject('authority-rejected');
  }
  return Object.freeze({ status: 'selected', action, nextFraction: fraction, stepM });
}
