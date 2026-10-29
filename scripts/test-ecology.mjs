// Gate for the Phase A rat-ecology module: nutrient conservation,
// roach bloom/regrowth/extinction, sanitation resets, deterministic
// replay, 10-year stability, forage ranking. No model, no provider.
import assert from 'node:assert/strict';
import { createPatch, addWaste, seedRoaches, tickPatch, forageValue, patchTotals, patchAdded } from '../src/ecology.js';
const P = (o) => createPatch({ id: 'p1', x: 0, z: 0, moisture: 0.7, warmth: 0.6, disturbance: 0.2, ...o });
// 1. Conservation: every gram accounted for across a full year with
// seasonal swings and two sanitation events.
{
  const p = P({ wasteKg: 20 });
  seedRoaches(p, 1);
  for (let day = 0; day < 365; day++) {
    if (day === 100 || day === 250) addWaste(p, 5);
    if (day === 150 || day === 300) tickPatch(p, { day, sanitation: true });
    else tickPatch(p, { day });
    for (const k of ['fresh', 'rot', 'residue', 'biomass']) assert(p[k] >= -1e-12 && Number.isFinite(p[k]), `finite ${k}`);
  }
  assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-9, 'mass conserved');
}
// 2. Extinction without waste; a fresh pulse blooms then busts (closed system, no immigration).
{
  const p = P({ wasteKg: 0 });
  seedRoaches(p, 2);
  for (let day = 0; day < 120; day++) tickPatch(p, { day });
  assert(p.biomass < 0.01, 'starved colony collapses, biomass ' + p.biomass);
  addWaste(p, 30); seedRoaches(p, 0.5);
  let peak = 0;
  for (let day = 120; day < 240; day++) { tickPatch(p, { day }); peak = Math.max(peak, p.biomass); }
  assert(peak > 1.0, 'pulse triggers bloom, peak ' + peak);
  assert(p.rot < 5, 'bloom consumes the rot pulse, remaining ' + p.rot);
}
// 3. Fresh-only patch rots; sanitation clears everything but refuge.
{
  const p = P({ wasteKg: 10 });
  tickPatch(p, { day: 200 });
  assert(p.rot > 0 && p.fresh < 10, 'rot begins');
  seedRoaches(p, 1);
  for (let day = 201; day < 230; day++) tickPatch(p, { day });
  const before = patchTotals(p);
  tickPatch(p, { day: 230, sanitation: true });
  assert.equal(p.fresh, 0); assert.equal(p.rot, 0); assert.equal(p.residue, 0);
  assert(p.biomass < before && p.biomass > 0, 'refuge survives');
  assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-9, 'conserved through sanitation');
}
// 4. Determinism: identical runs byte-identical.
{
  const run = () => { const p = P({ wasteKg: 15 }); seedRoaches(p, 0.5);
    for (let day = 0; day < 200; day++) tickPatch(p, { day, sanitation: day > 0 && day % 90 === 0 });
    return JSON.stringify(p); };
  assert.equal(run(), run());
}
// 5. Ten-year stability: no NaN, no negatives, bounded.
{
  const p = P({ wasteKg: 50 });
  seedRoaches(p, 5);
  for (let day = 0; day < 3650; day++) { if (day % 365 === 0) addWaste(p, 10); tickPatch(p, { day }); }
  for (const k of ['fresh', 'rot', 'residue', 'biomass']) assert(p[k] >= 0 && Number.isFinite(p[k]), `stable ${k}`);
  assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-6, 'decade conservation');
}
// 6. Forage ranking: bloom opportunity > fresh pile > cleaned slab.
{
  const bloom = P({ wasteKg: 10 }); seedRoaches(bloom, 2);
  for (let day = 0; day < 30; day++) tickPatch(bloom, { day });
  const fresh = P({ wasteKg: 10 });
  const clean = P({ wasteKg: 0 });
  assert(forageValue(bloom) > forageValue(fresh), `bloom ${forageValue(bloom)} > fresh ${forageValue(fresh)}`);
  assert(forageValue(fresh) > forageValue(clean), 'fresh > cleaned');
  assert(forageValue(clean) >= 0 && forageValue(clean) <= 5, 'cleaned ~worthless');
}
// 7. Input validation fails closed.
{
  assert.throws(() => createPatch({ id: '', x: 0, z: 0 }), /id/);
  assert.throws(() => createPatch({ id: 'p', x: 0, z: 0, moisture: 2 }), /range/);
  assert.throws(() => tickPatch(P({}), { day: -1 }), /non-negative integer/);
  assert.throws(() => addWaste(P({}), -1), /non-negative/);
}
console.log('PASS rat ecology — mass conserved across a year + sanitation, extinction/regrowth, 10-year stability, deterministic replay, forage ranking, fail-closed inputs');
