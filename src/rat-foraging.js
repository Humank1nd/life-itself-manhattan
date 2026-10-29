// Life Itself Manhattan — rat foraging decisions (Phase A integration).
// Connects ecological state to citizen choice: a hungry rat senses
// nearby patches through distance-limited smell, weighs hunger against
// safety and patch memory, and the deterministic policy proposes one
// lawful move toward the chosen patch. No model, no provider.
// Memory lives on the citizen (ped.memory.visits) so it checkpointed
// with the world and survives shutdown/restart.
import { forageValue, crowdFactor } from './ecology.js';
export const SMELL_RADIUS_M = 60;
export const MEMORY_DECAY_PER_DAY = 0.9;
export const FORAGE_THRESHOLD = 8;

export function sensePatches(ped, patches, radiusM = SMELL_RADIUS_M) {
  const out = [];
  for (const p of patches) {
    const dist = Math.hypot(p.x - ped.x, p.z - ped.z);
    if (dist <= radiusM) out.push({ patch: p, dist, forage: forageValue(p) });
  }
  out.sort((a, b) => b.forage - a.forage);
  return out;
}

// Perceived value: current forage discounted by disturbance, own recent
// visits (scent-memory), and other rats' fresh marks (crowding).
export function patchAppeal(patch, forage, memory, day, selfId = null) {
  const mem = memory && memory.visits && memory.visits[patch.id];
  const freshness = mem ? Math.pow(MEMORY_DECAY_PER_DAY, Math.max(0, day - mem.day)) : 1;
  const familiar = mem ? 1 - 0.5 * freshness : 1;
  const crowd = selfId ? crowdFactor(patch, selfId, day) : 1;
  return forage * familiar * crowd * (1 - 0.5 * patch.disturbance) + 5 * (1 - patch.disturbance);
}

// Deterministic forage proposal. Returns a move action or null (fall
// back to the base citizen policy). ecoDay is the ecological clock
// (days); tick is the city clock. Lawful by construction: the target
// advances toward the patch and is validated against lanes on commit.
// A hungry rat forages; a satiated one falls back to base behavior.
// Hunger is 0..100 with 70 at spawn: below 60 means genuinely hungry.
export function proposeForage(ped, motives, patches, memory, ecoDay, tick) {
  if (motives.hunger >= 60) return null;
  const sensed = sensePatches(ped, patches).filter((s) => s.forage >= FORAGE_THRESHOLD);
  if (!sensed.length) return null;
  let best = null, bestScore = -Infinity;
  for (const s of sensed) {
    const score = patchAppeal(s.patch, s.forage, memory, ecoDay, ped.id);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best || bestScore < FORAGE_THRESHOLD) return null;
  const dx = best.patch.x - ped.x, dz = best.patch.z - ped.z;
  const d = Math.hypot(dx, dz) || 1;
  const step = Math.min(5, d);
  return {
    schemaVersion: 'life-itself-action/1.0.0',
    actionId: `act-${tick}-${ped.id}-forage`,
    actorId: ped.id, tick,
    type: 'move',
    params: { to: { x: ped.x + (dx / d) * step, z: ped.z + (dz / d) * step } },
    basis: [],
  };
}

export function rememberVisit(memory, patchId, day) {
  memory.visits = memory.visits || {};
  memory.visits[patchId] = { count: (memory.visits[patchId] ? memory.visits[patchId].count + 1 : 1), day };
  return memory;
}
