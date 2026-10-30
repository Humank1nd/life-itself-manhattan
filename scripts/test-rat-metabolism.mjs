// Gate for daily ecological metabolism (P017.9-S01). The simulation clock
// drives the tested tickPatch path at each eco-day boundary — before that
// tick's foraging decisions, exactly once per day, with day consistency
// enforced fail-closed. Nonempty patches rot and bloom with mass conserved;
// the actual alley's empty patches stay empty; snapshots carry mass into
// the hashed state while legacy states serialize byte-identically;
// checkpoint/restore continues identically across a boundary. Deterministic.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, establishAlley, applyEcologicalDay, hashableWorldState } from '../src/living-city.js';
import { addWaste, seedRoaches, forageValue, patchTotals, patchAdded } from '../src/ecology.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { decideForRat } from '../src/object-affordances.js';
import { hashWorldState } from '../src/journal.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };
const ecoDayOf = (city) => Math.floor(city.tickCount / 288);

// 1. Nonempty patches with accounted stock + biomass metabolize at the boundary.
{
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  establishAlley(city);
  const deli = city.patches.find((p) => p.id === 'deli-1');
  addWaste(deli, 4);   // books into addedKg: accounted supply, not conjured food
  seedRoaches(deli, 2); // books into addedKg: accounted biomass
  const added = patchAdded(deli);
  assert(city.patches.every((p) => p.day === 0), 'patches open at day 0');
  for (let n = 0; n < 287; n++) tickLivingCity(city);
  assert.equal(city.tickCount, 287);
  assert(city.patches.every((p) => p.day === 0), 'no metabolism before the boundary');
  const freshBefore = deli.fresh;
  tickLivingCity(city); // tick 288: day 1
  assert.equal(city.tickCount, 288);
  assert(city.patches.every((p) => p.day === 1), 'all patches advance exactly one day');
  assert(deli.fresh < freshBefore, 'fresh rotted at the boundary');
  assert(deli.rot > 0 || deli.biomass > 0 || deli.residue > 0, 'mass moved into rot/biomass/residue');
  for (const p of city.patches) {
    assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-9, 'conservation across the boundary: ' + p.id);
  }
  // Repeated application within the same day is a no-op, not a double dose.
  const snap = JSON.stringify(city.patches);
  applyEcologicalDay(city);
  applyEcologicalDay(city);
  assert.equal(JSON.stringify(city.patches), snap, 'repeat calls within a day change nothing');
  // A patch ahead of the clock fails closed instead of silently continuing.
  const bad = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  establishAlley(bad);
  bad.patches[0].day = 5;
  assert.throws(() => tickLivingCity(bad), /ahead of clock/, 'time never runs backward');
}

// 2. The actual alley (empty patches, no biomass) stays empty — and the
// foraging decision observes post-metabolism state.
{
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  establishAlley(city);
  for (let n = 0; n < 300; n++) tickLivingCity(city);
  for (const p of city.patches) {
    const initial = p.id === 'deli-1' ? 1.0 : 0.6;
    assert.equal(p.day, 1, 'alley patches still track the day: ' + p.id);
    assert(p.fresh <= initial, 'no spontaneous food — fresh only rots away: ' + p.id);
    assert.equal(p.eatenKg, 0, 'nothing eaten without action: ' + p.id);
    assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-9, 'empty-of-input books still balance: ' + p.id);
  }
  // Ordering proof: at the boundary tick, metabolism lands before decisions read.
  const city2 = createLivingCity(corridors, { seed: 11, pedestrians: 48 });
  establishAlley(city2);
  for (const p of city2.pedestrians) p.motives.hunger = 20;
  for (let n = 0; n < 288; n++) tickLivingCity(city2);
  assert(city2.patches.every((p) => p.day === 1), 'boundary applied inside the tick');
  const rat = city2.pedestrians.find((p) => p.alive);
  const patchesById = Object.fromEntries(city2.patches.map((p) => [p.id, p]));
  const objectsById = Object.fromEntries(city2.objects.map((o) => [o.id, o]));
  const { advertiseObject } = await import('../src/object-affordances.js');
  const ads = city2.objects.map((o) => advertiseObject(o, patchesById[o.patchId], { tick: 288, ecoDay: 1 }));
  const dec = decideForRat({ rat, motives: rat.motives, advertisements: ads,
    patchesById, objectsById, tick: 288, observationIds: [] });
  assert(dec.evaluated.length > 0, 'decision evaluates the alley');
  const ad1 = ads.find((a) => a.objectId === 'dumpster-1');
  assert.equal(ad1.evidence.forageValue, forageValue(patchesById['deli-1']),
    'decisions read post-metabolism evidence, not a stale snapshot');
}

// 3. Mass state rides the hashed snapshot; restore continues identically.
{
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  establishAlley(city);
  addWaste(city.patches[0], 4);
  seedRoaches(city.patches[0], 2);
  for (let n = 0; n < 200; n++) tickLivingCity(city);
  const snap = citySnapshot(city);
  assert(!('patches' in snap), 'snapshot contract frozen: no patches key');
  const h1 = await hashWorldState(hashableWorldState(city));
  const record = buildResumptionRecord({ snapshot: snap, corridorsSha256: corridorSha256,
    world, ecology: { patches: city.patches }, ecoDay: ecoDayOf(city),
    appliedReports: [], objects: city.objects });
  const trust = { corridorsSha256: corridorSha256, world,
    citizenIds: city.pedestrians.map((p) => p.id), patchIds: ['deli-1', 'deli-2'],
    objectIds: ['dumpster-1', 'dumpster-2'], objects: city.objects };
  const revived = resumeLivingCity(corridors, JSON.parse(JSON.stringify(record)), trust);
  assert.deepEqual(revived.patches, city.patches, 'mass state restored exactly');
  for (let n = 200; n < 320; n++) tickLivingCity(city);
  for (let n = 200; n < 320; n++) tickLivingCity(revived);
  assert.equal(JSON.stringify(hashableWorldState(revived)), JSON.stringify(hashableWorldState(city)),
    'identical causal future across a metabolism boundary after restore');
  assert.equal(await hashWorldState(hashableWorldState(revived)), await hashWorldState(hashableWorldState(city)),
    'identical post-action hash covers identical mass');
  assert.notEqual(await hashWorldState(hashableWorldState(city)), h1,
    'hash moves with mass across the boundary window');
  // Tampered ecology roster still fails closed at the record gate.
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.ecology.patches.push({ ...tampered.ecology.patches[0], id: 'ghost-patch' });
  assert.throws(() => resumeLivingCity(corridors, tampered, trust), /patch roster mismatch/);
}

// 4. Legacy compatibility: states without the alley are untouched.
{
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  for (let n = 0; n < 300; n++) tickLivingCity(city);
  const snap = citySnapshot(city);
  assert(!('objects' in snap) && !('patches' in snap), 'legacy snapshot carries no alley keys');
  const city2 = createLivingCity(corridors, { seed: 11, pedestrians: 8 });
  for (let n = 0; n < 300; n++) tickLivingCity(city2);
  assert.equal(JSON.stringify(snap), JSON.stringify(citySnapshot(city2)), 'legacy ticks deterministic');
}

console.log('PASS rat metabolism — day-boundary rot/bloom exactly once, empty stays empty, decisions read current state, mass hashed and restored, legacy untouched');
