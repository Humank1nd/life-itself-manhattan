// Gate for survival: thirst, aging, injury, terminal mortality (Phase B, B02).
//Deterministic: same seeds, same deaths, same ticks. No model, no provider.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, citySummary, checkMortality, TICKS_PER_DAY, LIFESPAN_DAYS } from '../src/living-city.js';
import { initMotives, tickMotives } from '../src/motives.js';
import { sampleTraits, motiveRateModifiers, GENOME_PRIORS } from '../src/traits.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { createHash } from 'node:crypto';
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
assert.equal(TICKS_PER_DAY, 288);
assert.equal(LIFESPAN_DAYS, 365);
const rates = motiveRateModifiers(sampleTraits(GENOME_PRIORS, 1));
// 1. Thirst behaves like hunger: drains, recovers only when drinking.
{
  let m = { ...initMotives(), thirst: 50 };
  const d1 = tickMotives(m, rates, {});
  assert(d1.thirst < 50, 'thirst drains');
  const d2 = tickMotives(m, rates, { drinking: true });
  assert(d2.thirst > 50, 'drinking restores');
  assert('thirst' in initMotives(), 'thirst is a first-class motive');
}
// 2. Old age weakens energy recovery (0.85 past day 200).
{
  const m = { ...initMotives(), energy: 50 };
  const young = tickMotives(m, rates, { resting: true, ageDays: 100 });
  const old = tickMotives(m, rates, { resting: true, ageDays: 250 });
  assert(young.energy > old.energy, `young ${young.energy.toFixed(2)} > old ${old.energy.toFixed(2)}`);
  const unset = tickMotives(m, rates, { resting: true });
  assert.equal(unset.energy, young.energy, 'no age = full recovery');
}
// 3. Mortality predicates are exact.
{
  const base = { ageTicks: 0, injury: 0, starveTicks: 0 };
  assert.equal(checkMortality({ ...base }), null);
  assert.equal(checkMortality({ ...base, injury: 100 }), 'injury');
  assert.equal(checkMortality({ ...base, injury: 99 }), null);
  assert.equal(checkMortality({ ...base, starveTicks: 3 }), 'starvation');
  assert.equal(checkMortality({ ...base, starveTicks: 2 }), null);
  assert.equal(checkMortality({ ...base, ageTicks: (LIFESPAN_DAYS + 1) * TICKS_PER_DAY }), 'age');
  assert.equal(checkMortality({ ...base, ageTicks: LIFESPAN_DAYS * TICKS_PER_DAY + 287 }), null);
}
// 4. Integration: a fully depleted city dies on schedule; the dead stay put.
// (Start at sim-hour 13: no meals, no rest recovery — true starvation.)
{
  const city = createLivingCity(corridors, { seed: 21, pedestrians: 6 });
  for (let n = 0; n < 13; n++) tickLivingCity(city);
  for (const p of city.pedestrians) { p.motives.hunger = 0; p.motives.thirst = 0; p.motives.energy = 0.1; p.motives.fun = 50; }
  for (let n = 0; n < 2; n++) tickLivingCity(city);
  assert(city.pedestrians.every((p) => p.alive), 'two ticks of nothing is survivable');
  tickLivingCity(city);
  assert(city.pedestrians.every((p) => !p.alive), 'third tick kills');
  assert(city.pedestrians.every((p) => p.death && p.death.cause === 'starvation'), 'cause recorded');
  assert.equal(citySummary(city).deaths, 6);
  const frozen = city.pedestrians.map((p) => [p.x, p.z]);
  tickLivingCity(city);
  assert.deepEqual(city.pedestrians.map((p) => [p.x, p.z]), frozen, 'corpses do not walk');
}
// 5. Old age kills on schedule in a living city.
{
  const city = createLivingCity(corridors, { seed: 22, pedestrians: 4 });
  for (const p of city.pedestrians) p.ageTicks = (LIFESPAN_DAYS + 1) * TICKS_PER_DAY;
  tickLivingCity(city);
  assert(city.pedestrians.every((p) => !p.alive && p.death.cause === 'age'), 'old age is terminal');
}
// 6. Vitals round-trip through checkpoint and resume; tampering fails closed.
{
  const city = createLivingCity(corridors, { seed: 23, pedestrians: 4 });
  for (let n = 0; n < 10; n++) tickLivingCity(city);
  const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
  const record = buildResumptionRecord({ snapshot: citySnapshot(city), corridorsSha256: corridorSha256, world: city.world });
  const trust = { corridorsSha256: corridorSha256, world: city.world, citizenIds: city.pedestrians.map((p) => p.id) };
  const revived = resumeLivingCity(corridors, JSON.parse(JSON.stringify(record)), trust);
  assert(revived.pedestrians.every((p) => Number.isInteger(p.ageTicks) && p.alive === true), 'vitals survive restore');
  const bad = JSON.parse(JSON.stringify(record));
  bad.snapshot.pedestrians[0].ageTicks = -5;
  assert.throws(() => resumeLivingCity(corridors, bad, trust), /age missing|non-negative|age/);
  const bad2 = JSON.parse(JSON.stringify(record));
  bad2.snapshot.pedestrians[1].injury = 101;
  assert.throws(() => resumeLivingCity(corridors, bad2, trust), /injury bounds/);
}
console.log('PASS rat survival — thirst, age-weakened recovery, starvation/injury/age mortality, corpses stay put, vitals round-trip checkpoint');
