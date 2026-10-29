// Gate for the 365-day world clock (Phase B, B01): named seasons,
// deterministic skips identical to continuous stepping, and seasonal
// checkpoint restore with ecological day carried through. Pure CPU.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DAYS_IN_YEAR, seasonOfDay, yearOfDay, tickDay, skipDays } from '../src/world-clock.js';
import { createPatch, addWaste, seedRoaches, tickPatch, patchTotals, patchAdded } from '../src/ecology.js';
import { createLivingCity, tickLivingCity, citySnapshot } from '../src/living-city.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
assert.equal(DAYS_IN_YEAR, 365);
// 1. Calendar: named seasons, year rollover, fail-closed inputs.
assert.equal(seasonOfDay(0), 'winter');
assert.equal(seasonOfDay(59), 'winter');
assert.equal(seasonOfDay(60), 'spring');
assert.equal(seasonOfDay(151), 'spring');
assert.equal(seasonOfDay(152), 'summer');
assert.equal(seasonOfDay(200), 'summer');
assert.equal(seasonOfDay(244), 'autumn');
assert.equal(seasonOfDay(334), 'autumn');
assert.equal(seasonOfDay(335), 'winter');
assert.equal(seasonOfDay(364), 'winter');
assert.equal(yearOfDay(0), 0);
assert.equal(yearOfDay(364), 0);
assert.equal(yearOfDay(365), 1);
assert.equal(yearOfDay(365 + 200), 1);
assert.throws(() => seasonOfDay(-1), /non-negative/);
assert.throws(() => seasonOfDay(1.5), /non-negative/);
assert.throws(() => yearOfDay(-1), /non-negative/);
assert.throws(() => skipDays([], tickPatch, 0, -1), /non-negative/);
assert.throws(() => tickDay(null, tickPatch, 0), /array/);
// 2. Skips equal continuous stepping, byte for byte.
{
  const mk = () => { const p = createPatch({ id: 'a', x: 0, z: 0, moisture: 0.7, warmth: 0.6 }); addWaste(p, 20); seedRoaches(p, 2); return [p]; };
  const a = mk(); const b = mk();
  for (let d = 0; d < 60; d++) tickDay(a, tickPatch, d);
  skipDays(b, tickPatch, 0, 60);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'skip == continuous');
  const c = mk();
  skipDays(c, tickPatch, 0, 0);
  assert.equal(JSON.stringify(c), JSON.stringify(mk()), 'empty skip is identity');
}
// 3. Seasonal checkpoint: K=300 (autumn), restore with ecoDay, continue.
{
  const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
  const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
  assert.equal(seasonOfDay(300), 'autumn');
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 16 });
  const patches = [createPatch({ id: 'p1', x: 0, z: 0, moisture: 0.8, warmth: 0.6, disturbance: 0.1 })];
  addWaste(patches[0], 15); seedRoaches(patches[0], 1);
  for (let n = 0; n < 10; n++) tickLivingCity(city);
  for (let d = 0; d < 300; d++) tickPatch(patches[0], { day: d });
  const record = buildResumptionRecord({ snapshot: citySnapshot(city), corridorsSha256: corridorSha256,
    world: city.world, ecology: { patches }, ecoDay: 300 });
  assert.equal(record.meta.ecoDay, 300);
  const trust = { corridorsSha256: corridorSha256, world: city.world, citizenIds: city.pedestrians.map((p) => p.id), patchIds: ['p1'] };
  const wire = JSON.parse(JSON.stringify({ record }));
  const revived = resumeLivingCity(corridors, wire.record, trust);
  assert.equal(revived.ecoDay, 300, 'ecological day survives restore');
  // Continue both worlds identically through the autumn→winter boundary.
  const ref = [];
  for (let n = 0; n < 5; n++) { tickLivingCity(city); tickPatch(patches[0], { day: 300 + n }); ref.push(JSON.stringify([citySnapshot(city), patches])); }
  const rev = [];
  for (let n = 0; n < 5; n++) { tickLivingCity(revived); tickPatch(revived.patches[0], { day: 300 + n }); rev.push(JSON.stringify([citySnapshot(revived), revived.patches])); }
  assert.deepEqual(rev, ref, 'post-restore seasons identical');
  assert.equal(seasonOfDay(335), 'winter', 'boundary crossed in-window');
  // Bad ecoDay values fail closed.
  assert.throws(() => buildResumptionRecord({ snapshot: citySnapshot(city), corridorsSha256: corridorSha256, world: city.world, ecoDay: -1 }), /non-negative/);
  assert.throws(() => buildResumptionRecord({ snapshot: citySnapshot(city), corridorsSha256: corridorSha256, world: city.world, ecoDay: 1.5 }), /non-negative/);
  const bad = JSON.parse(JSON.stringify(wire.record));
  bad.meta.ecoDay = -4;
  assert.throws(() => resumeLivingCity(corridors, bad, trust), /out of range/);
}
console.log('PASS world clock — 365-day calendar with seasons and year rollover, skips identical to continuous stepping, seasonal checkpoint restore with ecoDay, fail-closed inputs');
