// Gate for the quarry trait + motive port (Extraction 014).
// Quarry ground truth: scripts/trait-parity.json, generated verbatim from
// Humank1nd/life-itself multiverse/biosim/development.py (no RNG-stream
// parity by design — Python Mersenne Twister vs mulberry32; same traits,
// priors, bounds, determinism). Culture-package compatibility IS
// bit-exact (same formula, same order). No walker behavior changes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRAITS, GENOME_PRIORS, priorFor, sampleTraits, cultureCompatibility, motiveRateModifiers } from '../src/traits.js';
import { MOTIVES, initMotives, tickMotives, motiveSummary } from '../src/motives.js';
const fixture = JSON.parse(readFileSync(new URL('./trait-parity.json', import.meta.url), 'utf8'));

// 1. Trait inventory + priors match the quarry exactly.
assert.deepEqual([...TRAITS], fixture.traits);
for (const t of TRAITS) assert.equal(priorFor(GENOME_PRIORS, t), fixture.priors[t]);
// 2. Seeded determinism; distinct seeds diverge.
assert.deepEqual(sampleTraits(GENOME_PRIORS, 42), sampleTraits(GENOME_PRIORS, 42));
assert.notDeepEqual(sampleTraits(GENOME_PRIORS, 7), sampleTraits(GENOME_PRIORS, 42));
// 3. Jitter bounds: every trait within prior ± 0.12 (clamp only shrinks).
for (const seed of [0, 1, 7, 42, 20261028, 999999]) {
  const v = sampleTraits(GENOME_PRIORS, seed);
  for (const t of TRAITS) {
    assert(v[t] >= -1 && v[t] <= 1, `range ${t}`);
    assert(Math.abs(v[t] - fixture.priors[t]) <= 0.120001, `jitter bound ${t} seed ${seed}`);
  }
}
// 4. Distribution: 2000 seeded agents center on priors (uniform jitter mean ≈ prior).
{
  const sums = Object.fromEntries(TRAITS.map((t) => [t, 0]));
  const N = 2000;
  for (let s = 0; s < N; s++) { const v = sampleTraits(GENOME_PRIORS, s); for (const t of TRAITS) sums[t] += v[t]; }
  for (const t of TRAITS) assert(Math.abs(sums[t] / N - fixture.priors[t]) < 0.03, `mean drift ${t}`);
}
// 5. Culture compatibility bit-exact vs quarry formula.
{
  const pkg = { novelty_affinity: 0.5, social_affinity: -0.3, systemizing_affinity: 0.8, meaning_affinity: 0.4 };
  const fixed = Object.fromEntries(TRAITS.map((t, i) => [t, (i - 7.5) / 10.0]));
  assert.equal(cultureCompatibility(pkg, fixed), fixture.compat);
}
// 6. Motives: Sims keys, init, drain ordering, trait modulation, clamp, recovery, determinism.
assert.deepEqual([...MOTIVES], ['hunger', 'comfort', 'hygiene', 'bladder', 'energy', 'fun', 'social', 'env']);
{
  const m0 = initMotives();
  for (const m of MOTIVES) assert.equal(m0[m], 70);
  const sleepy = motiveRateModifiers(sampleTraits(GENOME_PRIORS, 1));
  const rested = motiveRateModifiers(sampleTraits(GENOME_PRIORS, 1));
  assert.deepEqual(sleepy, rested);
  // High sleep_need drains energy faster than low sleep_need.
  const hi = tickMotives(initMotives(), motiveRateModifiers({ ...sampleTraits(GENOME_PRIORS, 5), sleep_need: 1.0 }), {});
  const lo = tickMotives(initMotives(), motiveRateModifiers({ ...sampleTraits(GENOME_PRIORS, 5), sleep_need: -1.0 }), {});
  assert(hi.energy < lo.energy, 'sleep_need must modulate energy drain');
  // Social recovery requires socializing; clamping holds over 500 idle ticks.
  let m = initMotives();
  const rates = motiveRateModifiers(sampleTraits(GENOME_PRIORS, 9));
  for (let i = 0; i < 500; i++) m = tickMotives(m, rates, {});
  for (const k of MOTIVES) assert(m[k] >= 0 && m[k] <= 100, `clamp ${k}`);
  assert.equal(m.social, 0, 'social bottoms out without company');
  const rec = tickMotives({ ...initMotives(), social: 10 }, rates, { socializing: true });
  assert(rec.social > 10, 'company recovers social');
  const low = motiveSummary({ ...initMotives(), bladder: 5 });
  assert.equal(low.lowest, 'bladder');
}
console.log('PASS traits+motives — 16 quarry traits with priors, seeded determinism, jitter bounds, centered distributions, bit-exact culture compatibility, 8 Sims motives with trait-modulated dynamics, 500-tick clamp');
