// Life Itself Manhattan — event-window adaptation of the God’s Eye View city.
// Sources (read from the founder's local gods-eye-view checkout, commit 9264301):
//   src/life/tick.js: makeZone(), tickCity(), demoState(), 5-second clock.
//   src/life/pedestrianCrowd.js: 6.2m sidewalk lanes, 1.3m/s walkers,
//       corridor-following and endpoint reversal.
//   data/streets-enu.json: already-extracted, true-ENU corridor waypoints.
// We intentionally do NOT import GTA, cops, collision physics, mission logic,
// or visual gait/IK. This island-view adapter operates directly in ENU meters.
// A seeded crowd and fixed timestep make replay deterministic.
// Walkers carry quarry traits (Extraction 014, founder-seated): each
// pedestrian's motive rates derive from its own seeded personality.
import { sampleTraits, motiveRateModifiers } from './traits.js';
import { initMotives, tickMotives, crowdContext, MOTIVES } from './motives.js';
export const TICK_MS = 5000;
export const SIDEWALK_OFFSET_M = 6.2;
export const DEFAULT_SEED = 20261028;
export const DEFAULT_PEDESTRIANS = 96;

export const ZONE_DEFINITIONS = Object.freeze([
  { id: 'times_square_hub', lat: 40.7580, lon: -73.9855, type: 'C', radiusKm: 0.40 },
  { id: 'fidi_residence', lat: 40.707422, lon: -74.011979, type: 'R', radiusKm: 0.25 },
  { id: 'quilt_commercial', lat: 40.709745, lon: -74.010047, type: 'C', radiusKm: 0.35 },
  { id: 'comedy_cellar', lat: 40.730131, lon: -74.00035, type: 'C', radiusKm: 0.25 },
  { id: 'bowery_shelter', lat: 40.7180, lon: -73.9930, type: 'I', radiusKm: 0.30 },
]);

function rngFromSeed(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeZone(id, lat, lon, type, radiusKm = 1) {
  // The names and initialization match gods-eye-view/src/life/tick.js.
  return { id, lat, lon, radiusKm, type, pop: type === 'R' ? 10 : 0, jobs: 0, money: 0, happy: 60 };
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const dLa = (aLat - bLat) * 111;
  const dLo = (aLon - bLon) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.hypot(dLa, dLo);
}

export function tickCity(zones, world) {
  // Lifted with the same state transitions as source tickCity(), on cloned
  // zone records; caller controls the simulation clock and world conditions.
  for (const z of zones) {
    const trafficPenalty = world.traffic === 'red' ? 2 : world.traffic === 'yellow' ? 1 : 0;
    const disasterHit = world.disasters.some((d) => distanceKm(z.lat, z.lon, d.lat, d.lon) < 5) ? 10 : 0;
    const baseJobs = z.type === 'I' ? 3 : z.type === 'C' ? 2 : 0;
    z.jobs = Math.max(0, baseJobs - trafficPenalty);
    z.pop = Math.max(0, z.pop - disasterHit + (z.type === 'R' ? z.jobs * 0.1 : 0));
    z.money += z.jobs * 0.07 * 10 - 1;
    let h = 50;
    if (world.weather === 'good') h += 10;
    if (world.traffic === 'red') h -= 15;
    if (disasterHit) h -= 20;
    if (world.servicesNear) h += 5;
    if (z.type === 'R' && zones.some((o) => o.type === 'I' && distanceKm(z.lat, z.lon, o.lat, o.lon) < 2)) h -= 10;
    z.happy = Math.max(0, Math.min(100, h));
    if (z.happy >= 80) z.pop *= 1.05;
    else if (z.happy < 50) z.pop *= 0.95;
    z.pop = Math.round(z.pop);
  }
  return zones;
}

export function buildSidewalkLanes(corridors, offsetM = SIDEWALK_OFFSET_M) {
  if (!corridors || typeof corridors !== 'object') throw new TypeError('corridors must be an object');
  const lanes = [];
  for (const [corridorKey, nodes] of Object.entries(corridors).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Array.isArray(nodes) || nodes.length < 2) continue;
    for (const side of [1, -1]) {
      const waypoints = [];
      for (let i = 0; i < nodes.length; i++) {
        const [x, z] = nodes[i];
        const [nx, nz] = nodes[i < nodes.length - 1 ? i + 1 : i - 1];
        const dx = nx - x, dz = nz - z;
        const length = Math.hypot(dx, dz);
        if (!Number.isFinite(length) || length < 1e-9) throw new Error('degenerate sidewalk segment: ' + corridorKey);
        // Perpendicular to the verified ENU corridor, 6.2m in engine units.
        waypoints.push([x - side * dz / length * offsetM, z + side * dx / length * offsetM]);
      }
      lanes.push({ laneId: 'lane_' + corridorKey + '_' + (side === 1 ? 'east' : 'west'),
        corridorKey, side, waypoints });
    }
  }
  return lanes;
}

function positionOnLane(lane, segmentIndex, fraction) {
  const a = lane.waypoints[segmentIndex];
  const b = lane.waypoints[segmentIndex + 1];
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

export function createLivingCity(corridors, { seed = DEFAULT_SEED, pedestrians = DEFAULT_PEDESTRIANS } = {}) {
  if (!Number.isInteger(pedestrians) || pedestrians < 0 || pedestrians > 1000) {
    throw new RangeError('pedestrians must be an integer between 0 and 1000');
  }
  const lanes = buildSidewalkLanes(corridors);
  if (!lanes.length) throw new Error('no walkable corridors in dataset');
  const random = rngFromSeed(seed);
  const crowd = [];
  for (let i = 0; i < pedestrians; i++) {
    const laneIndex = i % lanes.length;
    const lane = lanes[laneIndex];
    const segmentIndex = Math.floor(random() * (lane.waypoints.length - 1));
    const fraction = random();
    const direction = random() < 0.5 ? 1 : -1;
    const speed = 1.1 + random() * 0.4;
    const [x, z] = positionOnLane(lane, segmentIndex, fraction);
    const traits = sampleTraits(undefined, seed * 1000 + i);
    crowd.push({ id: 'ped_' + (i + 1), laneIndex, segmentIndex, fraction,
      direction, speed, x, z, state: 'walking',
      traits, rates: motiveRateModifiers(traits), motives: initMotives(),
      memory: { visits: {} } });
  }
  const zones = ZONE_DEFINITIONS.map((z) => makeZone(z.id, z.lat, z.lon, z.type, z.radiusKm));
  return { seed, tickCount: 0, zones, pedestrians: crowd, lanes,
    world: { traffic: 'green', weather: 'good', disasters: [], servicesNear: true } };
}

function advancePedestrian(ped, lane, seconds) {
  let remaining = seconds * ped.speed;
  // A walker travels at most 7.5m per tick; the guard also handles tiny segments.
  let guard = 0;
  while (remaining > 1e-9 && guard++ < 100) {
    const a = lane.waypoints[ped.segmentIndex];
    const b = lane.waypoints[ped.segmentIndex + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-9) throw new Error('degenerate segment during pedestrian step');
    const distanceToEnd = (ped.direction > 0 ? 1 - ped.fraction : ped.fraction) * length;
    if (remaining < distanceToEnd) {
      ped.fraction += ped.direction * remaining / length;
      remaining = 0;
    } else {
      remaining -= distanceToEnd;
      if (ped.direction > 0) {
        if (ped.segmentIndex === lane.waypoints.length - 2) {
          ped.fraction = 1;
          ped.direction = -1;
        } else {
          ped.segmentIndex++;
          ped.fraction = 0;
        }
      } else if (ped.segmentIndex === 0) {
        ped.fraction = 0;
        ped.direction = 1;
      } else {
        ped.segmentIndex--;
        ped.fraction = 1;
      }
    }
  }
  if (remaining > 1e-9) throw new Error('pedestrian failed to converge on lane');
  [ped.x, ped.z] = positionOnLane(lane, ped.segmentIndex, ped.fraction);
}

export function tickLivingCity(state) {
  state.tickCount += 1;
  tickCity(state.zones, state.world);
  const context = crowdContext(state.tickCount % 24);
  for (const ped of state.pedestrians) {
    advancePedestrian(ped, state.lanes[ped.laneIndex], TICK_MS / 1000);
    ped.motives = tickMotives(ped.motives, ped.rates, context);
  }
  return state;
}

export function citySnapshot(state) {
  // Include reproducible state, exclude immutable lane geometry already in data/.
  // Traits ride along (seed-derived but explicit for audit); motives are live.
  return {
    seed: state.seed, tick: state.tickCount,
    zones: state.zones.map(({ id, lat, lon, type, radiusKm, pop, jobs, money, happy }) =>
      ({ id, lat, lon, type, radiusKm, pop, jobs, money, happy })),
    pedestrians: state.pedestrians.map(({ id, laneIndex, segmentIndex, fraction, direction, speed, x, z, traits, motives, memory }) =>
      ({ id, laneIndex, segmentIndex, fraction, direction, speed, x, z, traits, motives, memory: memory || { visits: {} } })),
  };
}

export function citySummary(state) {
  const happiness = state.zones.length
    ? Math.round(state.zones.reduce((sum, z) => sum + z.happy, 0) / state.zones.length) : 0;
  let moodSum = 0, moodN = 0;
  const moodLow = {};
  for (const ped of state.pedestrians) {
    for (const m of MOTIVES) {
      moodSum += ped.motives[m]; moodN++;
      if (!(m in moodLow) || ped.motives[m] < moodLow[m]) moodLow[m] = ped.motives[m];
    }
  }
  const lowest = Object.keys(moodLow).sort((a, b) => moodLow[a] - moodLow[b])[0] || null;
  return { tick: state.tickCount, simHour: state.tickCount % 24,
    people: state.pedestrians.length, zones: state.zones.length, happiness,
    mood: state.pedestrians.length ? { mean: Math.round(moodSum / moodN), lowest } : null };
}
