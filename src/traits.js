// Life Itself Manhattan — trait sampler (Extraction 014).
// Ports the quarry's multiverse/biosim/development.py personality core:
// 16 slow traits, genomic priors, seeded jitter, culture-package
// compatibility. No imports; deterministic, no behavior change to walkers
// (seating the trait engine is the founder's open ruling — this module is
// dark code with a gate). RNG note: the quarry draws jitter from Python's
// Mersenne Twister; this port draws from mulberry32. Same traits, same
// priors, same ±0.12 bounds, same seeded determinism — different stream
// by design, recorded in docs/extraction-014-traits-and-motives.md.
export const TRAITS = [
  'threat_sensitivity',
  'reward_sensitivity',
  'novelty_seeking',
  'social_drive',
  'emotional_intensity',
  'systemizing_bias',
  'verbal_affinity',
  'spatial_affinity',
  'working_memory_capacity',
  'impulsivity_vs_deliberation',
  'trust_baseline',
  'rejection_sensitivity',
  'attachment_security',
  'sleep_need',
  'addiction_vulnerability',
  'stress_recovery_rate',
];
export const GENOME_PRIORS = {
  baseline_temp: {
    threat_sensitivity: 0.2,
    reward_sensitivity: 0.25,
    novelty_seeking: 0.3,
    social_drive: 0.1,
    emotional_intensity: 0.15,
    trust_baseline: -0.05,
    rejection_sensitivity: 0.1,
    attachment_security: 0.0,
    stress_recovery_rate: -0.1,
  },
  cognitive_biases: {
    systemizing_bias: 0.35,
    verbal_affinity: 0.1,
    spatial_affinity: 0.25,
    working_memory_capacity: 0.2,
    impulsivity_vs_deliberation: -0.15,
  },
  health_risk: {
    sleep_need: 0.2,
    addiction_vulnerability: 0.1,
  },
};
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
export function priorFor(genome, trait) {
  if (trait in (genome.baseline_temp || {})) return clamp(genome.baseline_temp[trait]);
  if (trait in (genome.cognitive_biases || {})) return clamp(genome.cognitive_biases[trait]);
  if (trait in (genome.health_risk || {})) return clamp(genome.health_risk[trait]);
  return 0.0;
}
// mulberry32: small, fast, platform-stable seeded stream (integer math,
// identical output on every engine — unlike Math.random).
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sampleTraits(genome = GENOME_PRIORS, seed = 0) {
  const rand = mulberry32(seed);
  const values = {};
  for (const trait of TRAITS) {
    const jitter = -0.12 + 0.24 * rand();
    values[trait] = clamp(priorFor(genome, trait) + jitter);
  }
  return values;
}
// Exact quarry formula, same operation order (bit-identical doubles for
// identical inputs): novelty*seeking + social*drive + systemizing*bias +
// meaning*(attachment+trust)*0.5, clamped.
export function cultureCompatibility(pkg, values) {
  return clamp(
    pkg.novelty_affinity * values.novelty_seeking
    + pkg.social_affinity * values.social_drive
    + pkg.systemizing_affinity * values.systemizing_bias
    + pkg.meaning_affinity * (values.attachment_security + values.trust_baseline) * 0.5
  );
}
// Proposed trait→motive rate map (v1, documented proposal — not wired to
// walkers until the seating ruling). Multipliers on Sims-scale 0..100
// motive deltas per 5-second city tick.
export function motiveRateModifiers(traits) {
  return {
    energyDrain: 1 + traits.sleep_need,
    socialDrain: 1 + traits.social_drive * 0.5,
    socialRecovery: 1 + traits.social_drive,
    funDrain: 1 + traits.novelty_seeking * 0.5,
    funRecovery: 1 + traits.novelty_seeking * 0.5,
    comfortRecovery: 1 + traits.stress_recovery_rate,
    amplitude: 1 + traits.emotional_intensity * 0.25,
  };
}
