// Gate for natural foraging pressure (P017.8e). No hunger overrides, no
// threshold changes, no granted food: the sim-owned alley alone turns
// lane-0 walkers into foragers whose hunger emerges from living unfed.
// Proves emergence, eligibility, lawful consumption, post-meal
// satisfaction, crowd abstention, conservation, and restored continuation
// with the regime intact. Deterministic. Uses the browser's own default
// configuration (seed 20261028, 96 walkers).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLivingCity, tickLivingCity, citySnapshot, establishAlley, isAlleyForager } from '../src/living-city.js';
import { stepRatAutonomy, HUNGER_ACT_THRESHOLD } from '../src/rat-autonomy.js';
import { buildResumptionRecord, resumeLivingCity } from '../src/city-resume.js';
import { StateJournal } from '../src/journal.js';
import { patchTotals, patchAdded } from '../src/ecology.js';
import { rebuildApplied, verifyRecovery } from '../src/citizen-agency.js';
import { snapshotLiveRat } from '../src/rat-perception.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const corridorSha256 = createHash('sha256').update(JSON.stringify(corridors)).digest('hex');
const world = { traffic: 'green', weather: 'good', disasters: [], servicesNear: true };
const ecoDayOf = (city) => Math.floor(city.tickCount / 288);
function browserCity() {
  const city = createLivingCity(corridors); // browser defaults
  establishAlley(city);
  return city;
}
function autonomyCtx(journal) {
  return { applied: new Set(), ledger: [], lastTick: { n: -1 }, integrity: { fault: null },
    journalAppend: (type, tick, payload) => journal.append(type, tick, payload) };
}

// 1. Hunger emerges naturally for foragers only; the crowd stays fed.
{
  const city = browserCity();
  const forageIds = city.pedestrians.filter(isAlleyForager).map((p) => p.id);
  assert.deepEqual(forageIds, ['ped_1', 'ped_23', 'ped_45', 'ped_67', 'ped_89'], 'designation is deterministic roster fact');
  assert(city.pedestrians.every((p) => p.motives.hunger === 70), 'no artificial hunger at spawn');
  for (let n = 0; n < 60; n++) tickLivingCity(city);
  const fh = city.pedestrians.filter(isAlleyForager).map((p) => p.motives.hunger);
  const ch = city.pedestrians.filter((p) => !isAlleyForager(p)).map((p) => p.motives.hunger);
  assert(Math.max(...fh) < HUNGER_ACT_THRESHOLD, 'foragers genuinely hungry by tick 60');
  assert(Math.min(...ch) > 90, 'crowd still feasting on schedule');
  // Legacy control: without the alley, the same walkers never hunger.
  const plain = createLivingCity(corridors);
  for (let n = 0; n < 60; n++) tickLivingCity(plain);
  assert(plain.pedestrians.every((p) => p.motives.hunger > 90), 'no alley, no hunger: regime is opt-in');
  assert(!('objects' in citySnapshot(plain)), 'legacy snapshot untouched');
}

// 2. Eligibility becomes action: the first natural meal, pinned.
const journal = new StateJournal();
const city = browserCity();
const ctx = autonomyCtx(journal);
const log = [];
let first = null;
for (let n = 0; n < 70; n++) {
  tickLivingCity(city);
  const out = await stepRatAutonomy(city, ctx, city.tickCount, ecoDayOf(city));
  if (out.status === 'acted' && !first) {
    const eater = city.pedestrians.find((p) => p.id === out.event.actorId);
    first = { tick: city.tickCount, actor: out.event.actorId, amount: out.effect.takenKg,
      hungerAfter: eater.motives.hunger, freshAfter: out.effect.fresh, patch: out.event.params.patchId };
  }
  if (out.status === 'acted') log.push(out.event);
}
assert(first, 'a natural meal occurs without any override');
assert.equal(first.tick, 65, 'first meal tick deterministic');
assert.equal(first.actor, 'ped_45', 'first actor deterministic in roster order');
assert.equal(first.patch, 'deli-1', 'rich near patch first');
assert.equal(first.amount, 1.0, 'max-boundary meal');
assert(Math.abs(first.hungerAfter - (37.5 + 30)) < 1e-9, 'post-meal satisfaction is the lawful effect');
assert.equal(isAlleyForager(city.pedestrians.find((p) => p.id === first.actor)), true);
for (const p of city.patches) assert(Math.abs(patchTotals(p) - patchAdded(p)) < 1e-9, 'mass conserved on ' + p.id);
assert.equal(await journal.verifyChain(), true);
// Only foragers ever act over a long window.
{
  const city2 = browserCity();
  const j2 = new StateJournal();
  const c2 = autonomyCtx(j2);
  const actors = new Set();
  for (let n = 0; n < 200; n++) {
    tickLivingCity(city2);
    const out = await stepRatAutonomy(city2, c2, city2.tickCount, ecoDayOf(city2));
    if (out.status === 'acted') actors.add(out.event.actorId);
  }
  assert(actors.size > 0, 'colony eats over time');
  for (const id of actors) {
    assert(isAlleyForager(city2.pedestrians.find((p) => p.id === id)), `only foragers act: ${id}`);
  }
}

// 3. Restored continuation keeps the regime: same later meals, same state.
{
  const K = 70, N = 170;
  const ref = browserCity();
  const refJournal = new StateJournal();
  const refCtx = autonomyCtx(refJournal);
  const refLog = [];
  for (let n = 0; n < N; n++) {
    tickLivingCity(ref);
    const out = await stepRatAutonomy(ref, refCtx, ref.tickCount, ecoDayOf(ref));
    if (out.status === 'acted') refLog.push(out.event);
  }
  const cut = browserCity();
  const cutJournal = new StateJournal();
  const cutCtx = autonomyCtx(cutJournal);
  const cutLog = [];
  for (let n = 0; n < K; n++) {
    tickLivingCity(cut);
    const out = await stepRatAutonomy(cut, cutCtx, cut.tickCount, ecoDayOf(cut));
    if (out.status === 'acted') cutLog.push(out.event);
  }
  const record = buildResumptionRecord({ snapshot: citySnapshot(cut), corridorsSha256: corridorSha256,
    world, ecology: { patches: cut.patches }, ecoDay: ecoDayOf(cut), appliedReports: [],
    objects: cut.objects });
  const trust = { corridorsSha256: corridorSha256, world,
    citizenIds: cut.pedestrians.map((p) => p.id), patchIds: ['deli-1', 'deli-2'],
    objectIds: ['dumpster-1', 'dumpster-2'], objects: cut.objects };
  const wire = JSON.parse(JSON.stringify({ record, log: cutLog, journal: cutJournal.toJSONL() }));
  const revived = resumeLivingCity(corridors, wire.record, trust);
  // No regime flag was pinned anywhere: the roster's presence in the
  // restored snapshot re-arms forager hunger by itself.
  assert(Array.isArray(revived.objects) && revived.objects.length === 2, 'roster restored');
  const revivedApplied = rebuildApplied(wire.log);
  assert.equal(verifyRecovery(wire.log, revivedApplied), true);
  const revivedJournal = StateJournal.fromJSONL(wire.journal);
  const contCtx = { applied: revivedApplied, ledger: [], lastTick: { n: K }, integrity: { fault: null },
    journalAppend: (t, k, p) => revivedJournal.append(t, k, p) };
  const contLog = [];
  for (let n = K; n < N; n++) {
    tickLivingCity(revived);
    const out = await stepRatAutonomy(revived, contCtx, revived.tickCount, ecoDayOf(revived));
    if (out.status === 'acted') contLog.push(out.event);
  }
  assert.deepEqual(contLog.map((e) => [e.tick, e.actionId, e.actorId, e.params]),
    refLog.slice(cutLog.length).map((e) => [e.tick, e.actionId, e.actorId, e.params]),
    'restored foragers eat identically');
  assert.equal(JSON.stringify(citySnapshot(revived)), JSON.stringify(citySnapshot(ref)), 'identical world state');
  // The panel reads the restored forager through the same pure projection.
  const rView = snapshotLiveRat({ rat: revived.pedestrians.find((p) => p.id === 'ped_45'),
    tick: revived.tickCount, ecoDay: ecoDayOf(revived), patches: revived.patches, objects: revived.objects,
    receipts: contCtx.ledger.filter((l) => l.decision.actorId === 'ped_45').map((l) => l.receipt) });
  assert(rView, 'restored forager projects');
}

// 4. Forager designation is roster fact, stable across restore.
assert.equal(isAlleyForager({ laneIndex: 0 }), true);
assert.equal(isAlleyForager({ laneIndex: 5 }), false);
assert.equal(isAlleyForager(null), false);

console.log('PASS rat pressure — hunger emerges naturally for lane-0 foragers only, first meal deterministic, crowd abstains, restore keeps the regime with identical continuation');
