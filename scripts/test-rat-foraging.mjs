// Gate: ecological state drives rat decisions (Phase A integration).
// A hungry rat smells nearby patches, weighs hunger/safety/memory, and
// the deterministic policy proposes one lawful move. Different ecology
// => different behavior. Checkpoint/restore preserves patches + memory
// and reproduces the identical decision. No model, no provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot } from '../src/living-city.js';
import { createPatch, seedRoaches, addWaste, tickPatch, forageValue } from '../src/ecology.js';
import { sensePatches, patchAppeal, proposeForage, rememberVisit } from '../src/rat-foraging.js';
import { validateAction, commitAction } from '../src/action-contract.js';
import { applyEventOnce } from '../src/citizen-agency.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
// Two patches flanking a fixed point; rich one seeded and bloomed.
function block(day) {
  const rich = createPatch({ id: 'dumpster-1', x: 100, z: 100, moisture: 0.8, warmth: 0.7, disturbance: 0.1 });
  seedRoaches(rich, 2);
  const poor = createPatch({ id: 'curb-2', x: -100, z: -100, moisture: 0.4, warmth: 0.4, disturbance: 0.6 });
  return { rich, poor };
}
const ped = { id: 'rat-1', x: 90, z: 90 };
// 1. Smell is distance-limited; rich beats poor; satiation abstains.
{
  const { rich, poor } = block(100);
  addWaste(rich, 25);
  for (let d = 100; d < 108; d++) { tickPatch(rich, { day: d }); tickPatch(poor, { day: d }); }
  const sensed = sensePatches({ ...ped }, [rich, poor], 60);
  assert(sensed.every((s) => Math.hypot(s.patch.x - ped.x, s.patch.z - ped.z) <= 60), 'radius');
  const far = createPatch({ id: 'far', x: 5000, z: 5000, moisture: 0.8, warmth: 0.7 });
  addWaste(far, 50); seedRoaches(far, 5);
  assert(sensePatches({ ...ped }, [far], 60).length === 0, 'distant patch unsmelled');
  assert(forageValue(rich) > forageValue(poor), `rich ${forageValue(rich).toFixed(1)} > poor ${forageValue(poor).toFixed(1)}`);
  assert.equal(proposeForage(ped, { hunger: 80 }, [rich, poor], { visits: {} }, 108, 10), null, 'satiated abstains');
  const act = proposeForage(ped, { hunger: 20 }, [rich, poor], { visits: {} }, 108, 10);
  assert(act && act.type === 'move', 'hungry rat moves');
  assert(Math.hypot(act.params.to.x - 100, act.params.to.z - 100) < Math.hypot(act.params.to.x + 100, act.params.to.z + 100), 'toward the rich patch');
}
// 2. Memory: a visited patch loses to a fresh one.
{
  const { rich, poor } = block(100);
  addWaste(rich, 25); addWaste(poor, 25);
  seedRoaches(rich, 2); seedRoaches(poor, 2);
  for (let d = 100; d < 108; d++) { tickPatch(rich, { day: d }); tickPatch(poor, { day: d }); }
  const mem = { visits: {} };
  rememberVisit(mem, 'dumpster-1', 108);
  const aNew = patchAppeal(rich, forageValue(rich), { visits: {} }, 120);
  const aSeen = patchAppeal(rich, forageValue(rich), mem, 109);
  assert(aSeen < aNew, 'recent visit discounts appeal');
}
// 3. Live round-trip: decide, commit, apply, checkpoint, restore, identical future.
// All validation context derives from the city under test — never from a
// closed-over original. Patches ride the wire and are rehydrated on restore.
{
  const city = createLivingCity(corridors, { seed: 11, pedestrians: 24 });
  for (let n = 0; n < 5; n++) tickLivingCity(city);
  const rat = city.pedestrians[0];
  rat.motives.hunger = 20;
  const rich = createPatch({ id: 'dumpster-1', x: rat.x + 30, z: rat.z, moisture: 0.8, warmth: 0.7, disturbance: 0.1 });
  addWaste(rich, 25); seedRoaches(rich, 2);
  for (let d = 0; d < 8; d++) tickPatch(rich, { day: d });
  const patches = [rich];
  const applied = new Set();
  const obs = (actor, id, tick) => ({ schemaVersion: 'life-itself-observation/1.0.0', observationId: id, observerId: actor, tick, kind: 'local-survey', summary: 'food-scent' });
  const ctxFor = (c, actor, tick, last) => ({ citizenIds: c.pedestrians.map((p) => p.id),
    positions: Object.fromEntries(c.pedestrians.map((p) => [p.id, p])),
    tick, lanes: c.lanes, lastTick: last });
  const r0 = city.pedestrians[0];
  const action = { ...proposeForage(r0, r0.motives, patches, r0.memory, 8, 5), basis: [obs(r0.id, 'o1', 5)] };
  assert(action, 'forage action proposed');
  validateAction(action, ctxFor(city, r0.id, 5, -1));
  const ev = commitAction(action, ctxFor(city, r0.id, 5, -1), applied, -1);
  applyEventOnce(city, ev, applied);
  rememberVisit(r0.memory, 'dumpster-1', 8);
  // Reference second proposal from the identical post-apply state: replay
  // must reproduce exactly this, not the pre-move proposal.
  const actionRef = { ...proposeForage(r0, r0.motives, patches, r0.memory, 8, 5), basis: [obs(r0.id, 'o1', 5)] };
  const log = [ev];
  const record = buildResumptionRecord({ snapshot: citySnapshot(city), corridorsSha256: corridorSha256, world: city.world });
  const trust = { corridorsSha256: corridorSha256, world: city.world, citizenIds: city.pedestrians.map((p) => p.id) };
  const wire = JSON.parse(JSON.stringify({ record, log, patches: patches.map((p) => JSON.parse(JSON.stringify(p))) }));
  const revived = resumeLivingCity(corridors, wire.record, trust);
  // Restored patches drive restored decisions: re-propose from the revived
  // world and the rehydrated ecology, and require the identical action.
  const r1 = revived.pedestrians[0];
  const patchesBack = wire.patches;
  const action2 = { ...proposeForage(r1, r1.motives, patchesBack, r1.memory, 8, 5), basis: [obs(r1.id, 'o1', 5)] };
  assert.deepEqual({ ...action2, basis: action2.basis.map((o) => o.observationId) },
    { ...actionRef, basis: actionRef.basis.map((o) => o.observationId) }, 'same world+ecology => same decision');
  const appliedB = new Set();
  for (const e of wire.log) appliedB.add(e.eventId);
  assert.throws(() => commitAction(action2, ctxFor(revived, r1.id, 5, -1), appliedB, -1), /duplicate/);
  assert.throws(() => applyEventOnce(revived, wire.log[0], appliedB), /duplicate/);
  const ref = [];
  for (let n = 0; n < 10; n++) { tickLivingCity(city); ref.push(JSON.stringify(citySnapshot(city))); }
  for (let n = 0; n < 10; n++) { tickLivingCity(revived); assert.equal(JSON.stringify(citySnapshot(revived)), ref[n], `divergence at +${n + 1}`); }
}
// 4. Swapped ecology => different behavior, same rat.
{
  const base = { id: 'rat-x', x: 0, z: 0 };
  const motives = { hunger: 20, comfort: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 };
  const mem = { visits: {} };
  const eastRich = createPatch({ id: 'e', x: 40, z: 0, moisture: 0.8, warmth: 0.7, disturbance: 0.1 });
  const westPoor = createPatch({ id: 'w', x: -40, z: 0, moisture: 0.3, warmth: 0.3, disturbance: 0.5 });
  addWaste(eastRich, 25); seedRoaches(eastRich, 2);
  for (let d = 0; d < 8; d++) { tickPatch(eastRich, { day: d }); tickPatch(westPoor, { day: d }); }
  const aEast = proposeForage(base, motives, [eastRich, westPoor], mem, 8, 4);
  assert(aEast && aEast.params.to.x > 0, 'heads east to the rich patch');
  const eastPoor = createPatch({ id: 'e', x: 40, z: 0, moisture: 0.3, warmth: 0.3, disturbance: 0.5 });
  const westRich = createPatch({ id: 'w', x: -40, z: 0, moisture: 0.8, warmth: 0.7, disturbance: 0.1 });
  addWaste(westRich, 25); seedRoaches(westRich, 2);
  for (let d = 0; d < 8; d++) { tickPatch(eastPoor, { day: d }); tickPatch(westRich, { day: d }); }
  const aWest = proposeForage(base, motives, [eastPoor, westRich], mem, 8, 4);
  assert(aWest && aWest.params.to.x < 0, 'heads west when richness swaps');
  assert.notDeepEqual(aEast.params.to, aWest.params.to, 'same rat, swapped ecology => different target');
}
console.log('PASS rat foraging — scent radius, rich beats poor, satiation abstains, memory discounts, forage-committed once, restore reproduces future identically');
