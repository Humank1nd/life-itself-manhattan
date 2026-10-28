import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildSidewalkLanes, createLivingCity, tickLivingCity, citySnapshot,
  citySummary, SIDEWALK_OFFSET_M, TICK_MS,
} from '../src/living-city.js';

const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const lanes = buildSidewalkLanes(corridors);
assert.equal(Object.keys(corridors).length, 11);
assert.equal(lanes.length, 22);
assert.equal(SIDEWALK_OFFSET_M, 6.2);
assert.equal(TICK_MS, 5000);
console.log('PASS: original 11 surveyed corridors yield 22 sidewalk lanes');

const a = createLivingCity(corridors);
const b = createLivingCity(corridors);
assert.equal(a.pedestrians.length, 96);
assert.equal(a.zones.length, 5);
assert.deepEqual(citySnapshot(a), citySnapshot(b));
const start = a.pedestrians.map((p) => [p.x, p.z]);
for (let n = 0; n < 30; n++) {
  tickLivingCity(a);
  tickLivingCity(b);
  assert.deepEqual(citySnapshot(a), citySnapshot(b));
  for (const ped of a.pedestrians) {
    assert.ok(Number.isFinite(ped.x) && Number.isFinite(ped.z), 'walker is positioned in ENU');
    assert.ok(ped.fraction >= 0 && ped.fraction <= 1, 'walker is on a valid segment');
    assert.ok(ped.segmentIndex >= 0 && ped.segmentIndex < a.lanes[ped.laneIndex].waypoints.length - 1);
  }
}
assert.equal(citySummary(a).tick, 30);
assert.equal(citySummary(a).simHour, 6);
assert.equal(citySummary(a).people, 96);
assert.notDeepEqual(a.pedestrians.map((p) => [p.x, p.z]), start);
console.log('PASS: 30 repeatable five-second ticks, walkers stay on lanes, original zones advance');

const left = createLivingCity(corridors, { seed: 1, pedestrians: 6 });
const right = createLivingCity(corridors, { seed: 2, pedestrians: 6 });
assert.notDeepEqual(citySnapshot(left), citySnapshot(right));
assert.throws(() => createLivingCity({}, {}), /no walkable corridors/);
assert.throws(() => createLivingCity(corridors, { pedestrians: -1 }), /pedestrians/);
const small = createLivingCity({ short: [[0, 0], [2, 0]] }, { seed: 7, pedestrians: 4 });
for (let n = 0; n < 100; n++) tickLivingCity(small);
assert.ok(small.pedestrians.every((p) => p.fraction >= 0 && p.fraction <= 1));
console.log('PASS: seeds diverge, bad inputs rejected, endpoint reversal is bounded');

console.log('PASS: living-city adapter verified (3 groups)');
