// Life Itself Manhattan — Phase A rat-ecology module (Rat POV pilot).
// One block: waste nodes rot, roaches bloom on rot, rats read forage
// opportunity, sanitation resets. Deterministic, seeded nowhere (pure
// arithmetic on explicit state — same inputs, same outputs). No
// individuals below rats: roaches are biomass pools. All rates are
// documented game-feel constants, not entomology.
export const PATCH_CONTRACT = 'life-itself-patch/1.0.0';
// Per-day rates. Tuned for legibility: rot in days, blooms in weeks.
const K_ROT = 0.25;       // fresh -> rotting fraction per day
const C_MAX = 0.5;        // max kg eaten per biomass unit per day
const HALF_SAT = 2.0;     // Holling half-saturation (kg rot)
const FRASS = 0.2;        // eaten fraction returned as residue
const TURNOVER = 0.05;    // daily biomass turnover back to residue
const K_SCALE = 10;       // carrying-capacity scale
const REFUGE = 0.15;      // biomass fraction surviving sanitation
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function seasonOf(day) {
  return 1 + 0.4 * Math.sin((2 * Math.PI * (day - 100)) / 365);
}
export function createPatch({ id, x, z, wasteKg = 0, moisture = 0.5, warmth = 0.5, disturbance = 0 }) {
  if (typeof id !== 'string' || !id) throw new Error('ecology: patch needs an id');
  for (const [k, v] of Object.entries({ moisture, warmth, disturbance }))
    if (!(v >= 0 && v <= 1)) throw new Error('ecology: ' + k + ' out of range');
  if (!(wasteKg >= 0)) throw new Error('ecology: waste must be non-negative');
  return { schemaVersion: PATCH_CONTRACT, id, x, z, fresh: wasteKg, rot: 0, residue: 0,
    biomass: 0, moisture, warmth, disturbance, removedKg: 0, addedKg: wasteKg, day: 0 };
}
// External inputs are booked: mass is conserved against inputs, never conjured.
export function addWaste(patch, kg) {
  if (!(kg >= 0)) throw new Error('ecology: waste must be non-negative');
  patch.fresh += kg; patch.addedKg += kg;
  return patch;
}
export function seedRoaches(patch, biomass) {
  if (!(biomass >= 0)) throw new Error('ecology: biomass must be non-negative');
  patch.biomass += biomass; patch.addedKg += biomass;
  return patch;
}
function carrying(patch) {
  return (patch.rot + 0.3 * patch.fresh + 1) * patch.moisture * patch.warmth * K_SCALE;
}
export function tickPatch(patch, { day, sanitation = false } = {}) {
  if (!Number.isInteger(day) || day < 0) throw new Error('ecology: day must be a non-negative integer');
  if (sanitation) {
    patch.removedKg += patch.fresh + patch.rot + patch.residue + patch.biomass * (1 - REFUGE);
    patch.fresh = 0; patch.rot = 0; patch.residue = 0; patch.biomass *= REFUGE;
    patch.day = day;
    return patch;
  }
  const season = seasonOf(day);
  // Fresh rots.
  const rot = Math.min(patch.fresh, K_ROT * season * patch.fresh);
  patch.fresh -= rot; patch.rot += rot;
  // Roaches eat (Holling type II), grow, turn over.
  const K = Math.max(carrying(patch), 1e-9);
  const eat = Math.min(patch.rot, C_MAX * patch.biomass * patch.rot / (patch.rot + HALF_SAT));
  patch.rot -= eat;
  patch.biomass += eat * (1 - FRASS);
  patch.residue += eat * FRASS;
  const turn = Math.min(patch.biomass, TURNOVER * patch.biomass);
  patch.biomass -= turn; patch.residue += turn;
  // Die-off above carrying capacity returns to residue.
  if (patch.biomass > K) { patch.residue += patch.biomass - K; patch.biomass = K; }
  patch.day = day;
  return patch;
}
// Rat-perceived opportunity 0..100: fresh feasts, roach-dense patches
// (the roaches themselves are food and a proxy for sustained rot
// throughput — standing rot alone would punish efficient colonies),
// quiet corners. Residue alone is history, not dinner.
export function forageValue(patch) {
  const K = Math.max(carrying(patch), 1e-9);
  const bloom = Math.min(1, patch.biomass / K);
  const score = 60 * patch.fresh / (patch.fresh + 8) + 60 * bloom - 40 * patch.disturbance + 5;
  return Math.max(0, Math.min(100, score));
}
export function patchTotals(patch) {
  return patch.fresh + patch.rot + patch.residue + patch.biomass + patch.removedKg;
}
export function patchAdded(patch) {
  return patch.addedKg;
}
