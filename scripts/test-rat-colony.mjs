// Gate for colony influence through shared world state (Phase A).
// Two rats, one rich patch: the first rat's grazing and scent marks
// measurably change the second rat's subsequent decision. No scripts,
// no direct coupling — only the patch both can smell. Deterministic.
import assert from 'node:assert/strict';
import { createPatch, addWaste, seedRoaches, tickPatch, forageValue, graze, markVisited, patchTotals, patchAdded } from '../src/ecology.js';
import { sensePatches, patchAppeal, proposeForage, rememberVisit } from '../src/rat-foraging.js';
import { createLivingCity, citySnapshot } from '../src/living-city.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const HUNGRY = { hunger: 20, thirst: 70, comfort: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 };
const mem = () => ({ visits: {} });
function richPatch(id, x) {
  const p = createPatch({ id, x, z: 0, moisture: 0.8, warmth: 0.7, disturbance: 0.1 });
  addWaste(p, 30); seedRoaches(p, 3);
  for (let d = 0; d < 8; d++) tickPatch(p, { day: d });
  return p;
}
// 1. Baseline: both rats head for the same rich patch.
const A = { id: 'rat-A', x: 0, z: 0, memory: mem() };
const B = { id: 'rat-B', x: 10, z: 5, memory: mem() };
const menu = richPatch('dumpster', 40, 0);
const actA0 = proposeForage(A, HUNGRY, [menu], A.memory, 8, 1);
const actB0 = proposeForage(B, HUNGRY, [menu], B.memory, 8, 1);
assert(actA0 && actB0, 'both rats forage');
assert(actA0.params.to.x > 0 && actB0.params.to.x > 0, 'both head east to the patch');
// 2. A eats and marks: B's appeal of the same patch drops.
const before = patchAppeal(menu, forageValue(menu), B.memory, 8, 'rat-B');
const taken = graze(menu, 12);
assert(taken > 0, 'A eats');
markVisited(menu, 'rat-A', 8);
rememberVisit(A.memory, 'dumpster', 8);
const after = patchAppeal(menu, forageValue(menu), B.memory, 8, 'rat-B');
assert(after < before, `depletion+crowding visible to B: ${before.toFixed(1)} -> ${after.toFixed(1)}`);
// Mass still conserved with grazing in the books.
assert(Math.abs(patchTotals(menu) - patchAdded(menu)) < 1e-9, 'conservation with grazing');
// 3. A satiated rat abstains: eating raises hunger past the threshold.
const full = { ...HUNGRY, hunger: 75 };
assert.equal(proposeForage(A, full, [menu], A.memory, 8, 2), null, 'satiated rats do not forage');
// 4. Influence is measured, not scripted: B eats less than A did,
// B's appeal drops after its own visit, and satiation stops foraging.
{
  const bMeal = graze(menu, 12);
  assert(bMeal < taken, `depleted patch feeds B less: ${bMeal.toFixed(2)} < ${taken.toFixed(2)}`);
  rememberVisit(B.memory, 'dumpster', 8);
  markVisited(menu, 'rat-B', 8);
  const appealBefore = patchAppeal(menu, forageValue(menu), { visits: {} }, 8, 'rat-B');
  const appealAfter = patchAppeal(menu, forageValue(menu), B.memory, 8, 'rat-B');
  assert(appealAfter < appealBefore, 'own visit discounts the patch');
  const full = { ...HUNGRY, hunger: 75 };
  assert.equal(proposeForage(B, full, [menu], B.memory, 8, 2), null, 'satiated B abstains');
}
// 6. Scent survives shutdown: checkpoint with ecology, restore, marks intact.
{
  const city = createLivingCity(corridors, { seed: 5, pedestrians: 4 });
  const p = createPatch({ id: 'alley', x: 0, z: 0, moisture: 0.7, warmth: 0.6, disturbance: 0.1 });
  addWaste(p, 10); seedRoaches(p, 1);
  for (let d = 0; d < 5; d++) tickPatch(p, { day: d });
  markVisited(p, 'rat-X', 4);
  markVisited(p, 'rat-Y', 5);
  const record = buildResumptionRecord({ snapshot: citySnapshot(city), corridorsSha256: corridorSha256, world: city.world, ecology: { patches: [p] } });
  const trust = { corridorsSha256: corridorSha256, world: city.world,
    citizenIds: city.pedestrians.map((q) => q.id), patchIds: ['alley'] };
  const wire = JSON.parse(JSON.stringify(record));
  const revived = resumeLivingCity(corridors, wire, trust);
  assert.deepEqual(revived.patches[0].marks, [{ by: 'rat-X', day: 4 }, { by: 'rat-Y', day: 5 }], 'scent marks round-trip');
  const bad = JSON.parse(JSON.stringify(wire));
  bad.ecology.patches[0].marks = [{ by: 'rat-X' }];
  assert.throws(() => resumeLivingCity(corridors, bad, trust), /scent mark/);
  const bad2 = JSON.parse(JSON.stringify(wire));
  delete bad2.ecology.patches[0].marks;
  assert.throws(() => resumeLivingCity(corridors, bad2, trust), /scent mark/);
  const bad3 = JSON.parse(JSON.stringify(wire));
  bad3.ecology.patches[0].marks = Array.from({ length: 21 }, (_, i) => ({ by: 'rat-' + i, day: i }));
  assert.throws(() => resumeLivingCity(corridors, bad3, trust), /cap exceeded/);
  assert.throws(() => buildResumptionRecord({ snapshot: JSON.parse(JSON.stringify(citySnapshot(city))),
    corridorsSha256: corridorSha256, world: city.world,
    ecology: { patches: [{ ...wire.ecology.patches[0], marks: bad3.ecology.patches[0].marks }] } }), /cap exceeded/);
  const appeal1 = patchAppeal(menu, forageValue(menu), B.memory, 8, 'rat-B');
  const appeal2 = patchAppeal(menu, forageValue(menu), B.memory, 8, 'rat-B');
  assert.equal(appeal1, appeal2);
}
console.log('PASS rat colony — shared depletion feeds the second rat less, scent marks discount revisits and survive restart, satiation stops foraging, mass conserved, deterministic');
