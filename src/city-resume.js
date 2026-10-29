// Life Itself Manhattan — deterministic city resumption (Phase 016, L2b).
// A shutdown/restart round-trip over the ACTUAL living-city simulation:
// a resumption record carries the snapshot plus pinned executable context
// (corridor hash, world config, tick length, contract version); resume
// rebuilds immutable state from pinned sources and proves every entity
// consistent before the first post-restart tick. No imports beyond the
// city modules; runs in Node and the browser unchanged. Pure: no I/O,
// no clock, no model.
import { buildSidewalkLanes, TICK_MS, ZONE_DEFINITIONS } from './living-city.js';
import { motiveRateModifiers } from './traits.js';
import { MOTIVES } from './motives.js';
export const RESUME_CONTRACT = 'life-itself-city-resume/1.0.0';
const HEX64 = /^[0-9a-f]{64}$/;
const assert = (ok, why) => { if (!ok) throw new Error('resume: ' + why); };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function buildResumptionRecord({ snapshot, corridorsSha256, world, tickMs = TICK_MS }) {
  assert(snapshot && Number.isInteger(snapshot.tick) && snapshot.tick >= 0, 'record needs a tick');
  assert(HEX64.test(corridorsSha256 || ''), 'record needs pinned corridor hash');
  assert(world && typeof world.traffic === 'string' && typeof world.weather === 'string'
    && Array.isArray(world.disasters) && typeof world.servicesNear === 'boolean', 'record needs world config');
  assert(tickMs === TICK_MS, 'tick length drift');
  return {
    contract: RESUME_CONTRACT,
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    meta: {
      corridorsSha256,
      world: JSON.parse(JSON.stringify(world)),
      tickMs,
      resumedFromTick: snapshot.tick,
    },
  };
}

export function resumeLivingCity(corridors, record, expected = {}) {
  assert(record && record.contract === RESUME_CONTRACT, 'resumption contract mismatch');
  const { snapshot, meta } = record;
  assert(snapshot && meta && HEX64.test(meta.corridorsSha256 || ''), 'resumption metadata missing');
  // Strict pin when the caller supplies one (scripts/CI compute it with
  // crypto; the browser relies on lane-consistency below). Well-formed
  // but wrong hashes fail here, not silently.
  if (expected.corridorsSha256 !== undefined) {
    assert(HEX64.test(expected.corridorsSha256 || ''), 'expected corridor hash malformed');
    assert(meta.corridorsSha256 === expected.corridorsSha256, 'corridor hash mismatch');
  }
  assert(meta.tickMs === TICK_MS, 'tick length drift');
  assert(meta.world && typeof meta.world.traffic === 'string', 'world config missing');
  // Rebuild immutable lane geometry from pinned corridors and prove every
  // pedestrian lies on it: tampered corridors or lane assignments fail here.
  const lanes = buildSidewalkLanes(corridors);
  assert(lanes.length > 0, 'no walkable corridors');
  const pedById = new Map();
  for (const ped of snapshot.pedestrians || []) {
    assert(ped && typeof ped.id === 'string' && ped.id.length > 0, 'pedestrian identity');
    assert(!pedById.has(ped.id), 'duplicated pedestrian: ' + ped.id);
    pedById.set(ped.id, ped);
    const lane = lanes[ped.laneIndex];
    assert(lane, 'lane assignment out of range: ' + ped.id);
    assert(Number.isInteger(ped.segmentIndex) && ped.segmentIndex >= 0 && ped.segmentIndex < lane.waypoints.length - 1,
      'segment out of range: ' + ped.id);
    assert(ped.fraction >= 0 && ped.fraction <= 1 && ped.direction !== 0, 'pedestrian motion state: ' + ped.id);
    assert(ped.traits && typeof ped.traits.sleep_need === 'number', 'personality missing: ' + ped.id);
    for (const [k, v] of Object.entries(ped.traits)) assert(isNum(v) && v >= -1 && v <= 1, 'trait bounds: ' + ped.id + '.' + k);
    assert(ped.motives, 'motives missing: ' + ped.id);
    for (const m of MOTIVES) assert(isNum(ped.motives[m]) && ped.motives[m] >= 0 && ped.motives[m] <= 100, 'motive bounds: ' + ped.id + '.' + m);
    // On-lane proof: recompute position from (lane, segment, fraction) and
    // require the stored x/z to match. Corridor swaps change waypoints and fail.
    const a = lane.waypoints[ped.segmentIndex], b = lane.waypoints[ped.segmentIndex + 1];
    const x = a[0] + (b[0] - a[0]) * ped.fraction, z = a[1] + (b[1] - a[1]) * ped.fraction;
    assert(Math.abs(x - ped.x) < 1e-9 && Math.abs(z - ped.z) < 1e-9, 'pedestrian off rebuilt lanes: ' + ped.id);
  }
  // Zones: static fields must equal the code's zone definitions; only the
  // mutable census is restored.
  assert(Array.isArray(snapshot.zones) && snapshot.zones.length > 0, 'zones missing');
  const zoneDefs = new Map(ZONE_DEFINITIONS.map((z) => [z.id, z]));
  const zones = snapshot.zones.map((z) => {
    assert(z && typeof z.id === 'string', 'zone identity');
    const def = zoneDefs.get(z.id);
    assert(def, 'unknown zone: ' + z.id);
    assert(z.lat === def.lat && z.lon === def.lon && z.type === def.type && z.radiusKm === def.radiusKm,
      'zone geography drift: ' + z.id);
    for (const k of ['pop', 'jobs', 'money', 'happy']) assert(isNum(z[k]), 'zone census: ' + z.id + '.' + k);
    return { ...z };
  });
  const pedestrians = snapshot.pedestrians.map((ped) => ({
    ...JSON.parse(JSON.stringify(ped)),
    rates: motiveRateModifiers(ped.traits),
  }));
  return {
    seed: snapshot.seed, tickCount: snapshot.tick, zones, pedestrians, lanes,
    world: JSON.parse(JSON.stringify(meta.world)),
  };
}
