// Life Itself Manhattan — motive dynamics (Extraction 014).
// The Sims-dashboard eight motives (hunger, comfort, hygiene, bladder,
// energy, fun, social, env — same keys as gods-eye-view
// src/life/simsDashboard.js) as pure tick functions, modulated by quarry
// traits via motiveRateModifiers(). Deterministic, no RNG: the traits
// carry the randomness. Standalone: NOT wired to living-city walkers
// (seating is the founder's open ruling).
export const MOTIVES = ['hunger', 'comfort', 'hygiene', 'bladder', 'energy', 'fun', 'social', 'env'];
// Base deltas per 5-second city tick on the 0..100 Sims scale. Game-feel
// constants, documented as such — not physiology.
export const BASE_DRAIN = {
  hunger: 0.5, comfort: 0.3, hygiene: 0.35, bladder: 0.45,
  energy: 0.8, fun: 0.6, social: 0.55, env: 0.2,
};
export const BASE_RECOVERY = {
  hunger: 6.0, comfort: 4.0, hygiene: 7.0, bladder: 9.0,
  energy: 3.0, fun: 5.0, social: 4.5, env: 3.5,
};
const clamp100 = (v) => Math.max(0, Math.min(100, v));
export function initMotives(level = 70) {
  return Object.fromEntries(MOTIVES.map((m) => [m, level]));
}
// context: {eating, resting, washing, relieving, playing, socializing, comfortZone, pleasantEnv}
// (booleans). rates: motiveRateModifiers(traits).
export function tickMotives(motives, rates, context = {}) {
  const out = { ...motives };
  const drain = {
    hunger: BASE_DRAIN.hunger, comfort: BASE_DRAIN.comfort, hygiene: BASE_DRAIN.hygiene,
    bladder: BASE_DRAIN.bladder, energy: BASE_DRAIN.energy * rates.energyDrain,
    fun: BASE_DRAIN.fun * rates.funDrain, social: BASE_DRAIN.social * rates.socialDrain,
    env: BASE_DRAIN.env,
  };
  const recover = {
    hunger: context.eating ? BASE_RECOVERY.hunger : 0,
    comfort: context.comfortZone ? BASE_RECOVERY.comfort * rates.comfortRecovery : (context.resting ? BASE_RECOVERY.comfort * 0.5 * rates.comfortRecovery : 0),
    hygiene: context.washing ? BASE_RECOVERY.hygiene : 0,
    bladder: context.relieving ? BASE_RECOVERY.bladder : 0,
    energy: context.resting ? BASE_RECOVERY.energy : 0,
    fun: context.playing ? BASE_RECOVERY.fun * rates.funRecovery * rates.amplitude : 0,
    social: context.socializing ? BASE_RECOVERY.social * rates.socialRecovery * rates.amplitude : 0,
    env: context.pleasantEnv ? BASE_RECOVERY.env : 0,
  };
  for (const m of MOTIVES) out[m] = clamp100(out[m] - drain[m] + recover[m]);
  return out;
}
export function motiveSummary(motives) {
  const vals = MOTIVES.map((m) => motives[m]);
  return { lowest: MOTIVES[vals.indexOf(Math.min(...vals))], mean: vals.reduce((a, b) => a + b, 0) / vals.length };
}
