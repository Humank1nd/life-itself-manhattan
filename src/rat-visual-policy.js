// Rat display policies are pure. Never modify pedestrian or ecology state.
export const RAT_VISUAL_CAP = 2;
export const RAT_VISUAL_RADIUS_M = 80;
export const RAT_HEIGHT_M = 0.16;
export const RAT_LENGTH_M = 0.56;
const finite = Number.isFinite;

export function chooseRatVisuals(pedestrians, focusId, { cap = RAT_VISUAL_CAP, radiusM = RAT_VISUAL_RADIUS_M } = {}) {
  if (!Array.isArray(pedestrians) || !Number.isInteger(cap) || cap < 1 ||
      !finite(radiusM) || radiusM <= 0) return [];
  const alive = pedestrians.filter((p) => p && p.alive !== false &&
    typeof p.id === 'string' && finite(p.x) && finite(p.z));
  const focus = alive.find((p) => p.id === focusId) || alive[0];
  if (!focus) return [];
  return [focus, ...alive.filter((p) => p !== focus)
    .map((p) => ({ p, distance: Math.hypot(p.x - focus.x, p.z - focus.z) }))
    .filter((x) => x.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
    .map((x) => x.p)].slice(0, cap).map((p) => p.id);
}

export function ratAnimationState(rat, previous, tickSeconds = 5) {
  if (!rat || rat.alive === false || rat.state === 'dead') return 'dead';
  if (!previous || !finite(previous.x) || !finite(previous.z) ||
      !finite(rat.x) || !finite(rat.z) || !finite(tickSeconds) || tickSeconds <= 0) return 'idle';
  const speed = Math.hypot(rat.x - previous.x, rat.z - previous.z) / tickSeconds;
  if (speed < 0.05) return 'idle';
  return speed >= 2.2 ? 'run' : 'walk';
}

export function headingFromMovement(current, previous, fallback = 0) {
  if (!current || !previous || ![current.x,current.z,previous.x,previous.z].every(finite)) return fallback;
  const dx = current.x - previous.x, dz = current.z - previous.z;
  return Math.hypot(dx, dz) > 0.01 ? Math.atan2(dx, dz) : fallback;
}

export function chooseRatClip(animations, state) {
  if (!Array.isArray(animations)) return null;
  const target = ({ idle: 'idle_A1', walk: 'walk_A2', run: 'run_A1', dead: 'idle_A1' })[state] || 'idle_A1';
  return animations.find((a) => a && typeof a.name === 'string' && (a.name === target || a.name.endsWith('|' + target))) || null;
}
