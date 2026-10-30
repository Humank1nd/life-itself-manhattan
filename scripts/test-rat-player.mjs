// Gate for one player choice (Sprint 2). The player names a rat and an
// eligible scavenge. P017 commit validates it, the world changes once, and
// the journal keeps the consequence. An unlawful choice writes nothing and
// does not fall through to another rat. Autonomy is unchanged when no
// choice is supplied. No DOM. No evidence-network imports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSidewalkLanes } from '../src/living-city.js';
import { sampleTraits, motiveRateModifiers } from '../src/traits.js';
import { buildAlley } from '../src/object-affordances.js';
import { StateJournal } from '../src/journal.js';
import { selectRatAction, selectPlayerRatAction, stepPlayerRatAction, stepRatAutonomy } from '../src/rat-autonomy.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const lanes = buildSidewalkLanes(corridors);
const TICK = 21, ECO_DAY = 9;
const lane0 = lanes[0];
const [ax, az] = lane0.waypoints[0], [bx, bz] = lane0.waypoints[1];
const fR = 0.5;
const traits = sampleTraits(undefined, 301);

function makeRat(hunger = 20) {
  return { id: 'rat-A', laneIndex: 0, segmentIndex: 0, fraction: fR, direction: 1, speed: 1.2,
    x: ax + (bx - ax) * fR, z: az + (bz - az) * fR, state: 'walking', traits, rates: motiveRateModifiers(traits),
    motives: { hunger, thirst: 70, comfort: 70, hygiene: 70, bladder: 70, energy: 70, fun: 70, social: 70, env: 70 },
    memory: { visits: {} }, ageTicks: 100, injury: 0, starveTicks: 0, alive: true, death: null };
}
function makeState(hunger = 20) {
  const alley = buildAlley(lanes);
  return { pedestrians: [makeRat(hunger)], lanes, patches: alley.patches, objects: alley.objects };
}
function ctxFor(journal) {
  return { applied: new Set(), ledger: [], lastTick: { n: -1 }, integrity: { fault: null },
    journalAppend: (type, tick, payload) => journal.append(type, tick, payload),
    journalEntries: async () => journal.entries };
}
const choice = { actorId: 'rat-A', objectId: 'dumpster-2', interactionId: 'scavenge-fresh' };
const freshOf = (state, id) => state.patches.find((p) => p.id === id).fresh;

// The policy winner is dumpster-1. The player may lawfully choose dumpster-2.
{
  const state = makeState();
  const before = JSON.stringify(state.patches) + JSON.stringify(state.pedestrians[0].motives);
  const auto = selectRatAction(state, TICK, ECO_DAY);
  assert.equal(auto.action.params.objectId, 'dumpster-1');
  assert.ok(auto.action.actionId.endsWith('-autonomy'));
  const picked = selectPlayerRatAction(state, TICK, ECO_DAY, choice);
  assert.equal(picked.status, 'selected');
  assert.equal(picked.action.params.objectId, 'dumpster-2');
  assert.ok(picked.action.actionId.endsWith('-player'));
  assert.equal(picked.decision.chosen.objectId, 'dumpster-2');
  assert.equal(JSON.stringify(state.patches) + JSON.stringify(state.pedestrians[0].motives), before, 'selection writes nothing');
}

// One commit: the named patch changes once, the other patch does not, the
// journal holds the consequence, and a second submission does not repeat it.
{
  const state = makeState();
  const journal = new StateJournal();
  const ctx = ctxFor(journal);
  const before1 = freshOf(state, 'deli-1');
  const before2 = freshOf(state, 'deli-2');
  const out = await stepPlayerRatAction(state, ctx, TICK, ECO_DAY, choice);
  assert.equal(out.status, 'acted');
  assert.equal(out.receipt.status, 'committed');
  assert.ok(out.receipt.actionId.includes('-player'));
  assert.equal(freshOf(state, 'deli-1'), before1, 'the unchosen dumpster stays put');
  assert.ok(freshOf(state, 'deli-2') < before2, 'the chosen dumpster loses stock');
  assert.ok(state.pedestrians[0].motives.hunger > 20, 'the named rat takes the meal');
  const once = freshOf(state, 'deli-2');
  const again = await stepPlayerRatAction(state, ctx, TICK, ECO_DAY, choice);
  assert.equal(again.status, 'rejected');
  assert.equal(freshOf(state, 'deli-2'), once, 'a second submission does not eat again');
  assert.equal(ctx.ledger.length, 1);
  assert.equal(await journal.verifyChain(), true);
  const kinds = journal.entries.map((entry) => entry.payload.kind);
  assert.deepEqual(kinds, ['rat-decision', 'world-event', 'scavenge-effect']);
  assert.equal(journal.entries[0].payload.decision.chosen.objectId, 'dumpster-2');
}

// Same state and same choice, same consequence.
{
  const a = makeState();
  const b = makeState();
  const ja = new StateJournal();
  const jb = new StateJournal();
  const oa = await stepPlayerRatAction(a, ctxFor(ja), TICK, ECO_DAY, choice);
  const ob = await stepPlayerRatAction(b, ctxFor(jb), TICK, ECO_DAY, choice);
  assert.equal(oa.receipt.actionId, ob.receipt.actionId);
  assert.equal(oa.effect.takenKg, ob.effect.takenKg);
  assert.equal(freshOf(a, 'deli-2'), freshOf(b, 'deli-2'));
}

// Unlawful choices write nothing and do not hand the tick to autonomy.
{
  const state = makeState(90);
  const journal = new StateJournal();
  const before = JSON.stringify(state.patches);
  const out = await stepPlayerRatAction(state, ctxFor(journal), TICK, ECO_DAY, choice);
  assert.equal(out.status, 'rejected');
  assert.equal(out.reason, 'satiated');
  assert.equal(JSON.stringify(state.patches), before);
  assert.equal(journal.entries.length, 0);
  const dead = makeState();
  dead.pedestrians[0].alive = false;
  const deadBefore = JSON.stringify(dead.patches);
  const deadOut = await stepPlayerRatAction(dead, ctxFor(new StateJournal()), TICK, ECO_DAY, choice);
  assert.equal(deadOut.status, 'rejected');
  assert.equal(deadOut.reason, 'actor-dead');
  assert.equal(JSON.stringify(dead.patches), deadBefore);
  const far = makeState();
  far.pedestrians[0].x += 1000;
  const farBefore = JSON.stringify(far.patches);
  const farOut = await stepPlayerRatAction(far, ctxFor(new StateJournal()), TICK, ECO_DAY, choice);
  assert.equal(farOut.status, 'rejected');
  assert.equal(farOut.reason, 'out-of-range');
  assert.equal(JSON.stringify(far.patches), farBefore);
  const missing = await stepPlayerRatAction(makeState(), ctxFor(new StateJournal()), TICK, ECO_DAY,
    { actorId: 'nobody', objectId: 'dumpster-2', interactionId: 'scavenge-fresh' });
  assert.equal(missing.status, 'rejected');
  assert.equal(missing.reason, 'unknown-actor');
  assert.throws(() => selectPlayerRatAction(makeState(), TICK, ECO_DAY, { actorId: 'rat-A', objectId: 'dumpster-2', interactionId: 'investigate-scent' }), /scavenge-fresh/);
}

// No player choice: autonomy still selects and commits the policy winner.
{
  const state = makeState();
  const journal = new StateJournal();
  const out = await stepRatAutonomy(state, ctxFor(journal), TICK, ECO_DAY);
  assert.equal(out.status, 'acted');
  assert.equal(out.event.params.objectId, 'dumpster-1');
  assert.ok(out.receipt.actionId.endsWith('-autonomy'));
  assert.ok(freshOf(state, 'deli-1') < 1);
  assert.equal(freshOf(state, 'deli-2'), 0.6);
}

console.log('PASS rat player — one named lawful scavenge commits once through P017, the journal keeps it, unlawful choices change nothing, autonomy stays the unchosen path');
