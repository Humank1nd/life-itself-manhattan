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

export function buildResumptionRecord({ snapshot, corridorsSha256, world, ecology = null, ecoDay = null, appliedReports = [], objects = null, tickMs = TICK_MS }) {
  assert(snapshot && Number.isInteger(snapshot.tick) && snapshot.tick >= 0, 'record needs a tick');
  assert(HEX64.test(corridorsSha256 || ''), 'record needs pinned corridor hash');
  assert(world && typeof world.traffic === 'string' && typeof world.weather === 'string'
    && Array.isArray(world.disasters) && typeof world.servicesNear === 'boolean', 'record needs world config');
  assert(tickMs === TICK_MS, 'tick length drift');
  if (ecoDay !== undefined && ecoDay !== null) {
    assert(Number.isInteger(ecoDay) && ecoDay >= 0, 'ecological day must be a non-negative integer');
  }
  let eco = null;
  if (ecology !== null && ecology !== undefined) {
    assert(Array.isArray(ecology.patches), 'ecology needs a patches array');
    const ids = new Set();
    for (const p of ecology.patches) {
      assert(p && typeof p.id === 'string' && p.id.length > 0, 'patch identity');
      assert(!ids.has(p.id), 'duplicated patch: ' + p.id);
      ids.add(p.id);
      for (const k of ['x', 'z', 'fresh', 'rot', 'residue', 'biomass', 'moisture', 'warmth', 'disturbance', 'day']) {
        assert(isNum(p[k]), 'patch field ' + k + ': ' + p.id);
      }
      assert(Array.isArray(p.marks), 'patch scent marks missing: ' + p.id);
      assert(p.marks.length <= 20, 'scent mark cap exceeded at checkpoint: ' + p.id);
      for (const m of p.marks) {
        assert(m && typeof m.by === 'string' && Number.isInteger(m.day) && m.day >= 0, 'scent mark shape: ' + p.id);
      }
    }
    eco = { patches: JSON.parse(JSON.stringify(ecology.patches)) };
  }
  assert(Array.isArray(appliedReports), 'applied reports must be a list');
  const seenIds = new Set();
  for (const id of appliedReports) {
    assert(typeof id === 'string' && id.length > 0, 'applied report id');
    assert(!seenIds.has(id), 'duplicated applied report: ' + id);
    seenIds.add(id);
  }
  // World-object roster (P017.5): pinned alongside patches and applied
  // reports. Additive and optional — pre-P017.5 records carry null and
  // restore exactly as before. When present, every entry is shape-pinned
  // (identity, kind, position, patch link, revision); restore compares the
  // roster and, when full descriptors are trusted, every field per object.
  // `rev` is bumped by reviseObject() on any pinned-property change, so a
  // silent substitution reads as a revision mismatch, not a quiet drift.
  let objs = null;
  if (objects !== null && objects !== undefined) {
    assert(Array.isArray(objects), 'objects must be a list');
    const seenObjs = new Set();
    for (const o of objects) {
      assert(o && typeof o.id === 'string' && o.id.length > 0, 'object identity');
      assert(!seenObjs.has(o.id), 'duplicated object: ' + o.id);
      seenObjs.add(o.id);
      assert(typeof o.kind === 'string' && o.kind.length > 0, 'object kind: ' + o.id);
      assert(isNum(o.x) && isNum(o.z), 'object position: ' + o.id);
      if (o.patchId !== null && o.patchId !== undefined) {
        assert(typeof o.patchId === 'string' && o.patchId.length > 0, 'object patch link: ' + o.id);
      }
      assert(Number.isInteger(o.rev) && o.rev >= 0, 'object revision: ' + o.id);
    }
    objs = objects.map((o) => ({ id: o.id, kind: o.kind, x: o.x, z: o.z,
      patchId: o.patchId ?? null, rev: o.rev }));
  }
  return {
    contract: RESUME_CONTRACT,
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    appliedReports: [...seenIds],
    objects: objs,
    meta: {
      corridorsSha256,
      world: JSON.parse(JSON.stringify(world)),
      tickMs,
      resumedFromTick: snapshot.tick,
      ecoDay: ecoDay === undefined ? null : ecoDay,
    },
    ecology: eco,
  };
}

export function resumeLivingCity(corridors, record, expected = {}) {
  assert(record && record.contract === RESUME_CONTRACT, 'resumption contract mismatch');
  const { snapshot, meta } = record;
  assert(snapshot && meta && HEX64.test(meta.corridorsSha256 || ''), 'resumption metadata missing');
  // Mandatory source pinning (L2c): the caller MUST supply the trusted
  // corridor hash — there is no unauthenticated restore path.
  assert(HEX64.test(expected.corridorsSha256 || ''), 'expected corridor hash required');
  assert(meta.corridorsSha256 === expected.corridorsSha256, 'corridor hash mismatch');
  // Checkpoint integrity (L2c): the world config and citizen roster must
  // exactly equal the trusted values. Alterations are rejected here, not
  // merely detected as downstream divergence.
  assert(expected.world && typeof expected.world === 'object', 'expected world config required');
  assert(JSON.stringify(meta.world) === JSON.stringify(expected.world), 'world config mismatch');
  assert(Array.isArray(expected.citizenIds) && expected.citizenIds.length > 0, 'expected citizen roster required');
  {
    const got = (snapshot.pedestrians || []).map((p) => p.id).sort();
    const want = [...expected.citizenIds].sort();
    assert(JSON.stringify(got) === JSON.stringify(want), 'citizen roster mismatch');
  }
  assert(meta.tickMs === TICK_MS, 'tick length drift');
  if (meta.ecoDay !== undefined && meta.ecoDay !== null) {
    assert(Number.isInteger(meta.ecoDay) && meta.ecoDay >= 0, 'ecological day out of range');
  }
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
    assert(ped.memory && typeof ped.memory.visits === 'object', 'scent memory missing: ' + ped.id);
    assert(Number.isInteger(ped.ageTicks) && ped.ageTicks >= 0, 'age missing: ' + ped.id);
    assert(isNum(ped.injury) && ped.injury >= 0 && ped.injury <= 100, 'injury bounds: ' + ped.id);
    assert(Number.isInteger(ped.starveTicks) && ped.starveTicks >= 0, 'starvation counter: ' + ped.id);
    assert(typeof ped.alive === 'boolean', 'alive flag: ' + ped.id);
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
  // Ecological state is owned restored state, not sidecar data: validated
  // here, attached to the revived world, advanced by the same tick loop.
  let patches = null;
  if (record.ecology !== null && record.ecology !== undefined) {
    assert(Array.isArray(record.ecology.patches), 'ecology patches missing');
    patches = [];
    const seen = new Set();
    for (const p of record.ecology.patches) {
      assert(p && typeof p.id === 'string' && p.id.length > 0, 'restored patch identity');
      assert(!seen.has(p.id), 'duplicated restored patch: ' + p.id);
      seen.add(p.id);
      for (const k of ['x', 'z', 'fresh', 'rot', 'residue', 'biomass', 'moisture', 'warmth', 'disturbance', 'day']) assert(isNum(p[k]), 'restored patch field ' + k);
      assert(Array.isArray(p.marks), 'restored patch scent marks missing: ' + p.id);
      assert(p.marks.length <= 20, 'scent mark cap exceeded on restore: ' + p.id);
      for (const m of p.marks) {
        assert(m && typeof m.by === 'string' && Number.isInteger(m.day) && m.day >= 0, 'restored scent mark shape: ' + p.id);
      }
      patches.push(JSON.parse(JSON.stringify(p)));
    }
    if (expected.patchIds !== undefined) {
      assert(Array.isArray(expected.patchIds), 'expected patch roster malformed');
      const got = patches.map((p) => p.id).sort();
      assert(JSON.stringify(got) === JSON.stringify([...expected.patchIds].sort()), 'patch roster mismatch');
    }
  }
  // World-object roster (P017.5): when the checkpoint pins objects, the
  // caller MUST supply the trusted roster — there is no unauthenticated
  // restore path for pinned objects. Missing, extra, substituted, revised,
  // or patch-link-broken objects are rejected here, never merely detected
  // as downstream divergence. Records without pinned objects skip all of
  // this, preserving pre-P017.5 restore behavior byte-for-byte.
  let restoredObjects = null;
  if (record.objects !== null && record.objects !== undefined) {
    assert(Array.isArray(record.objects), 'object roster missing');
    const seenRestored = new Set();
    for (const o of record.objects) {
      assert(o && typeof o.id === 'string' && o.id.length > 0, 'restored object identity');
      assert(!seenRestored.has(o.id), 'duplicated restored object: ' + o.id);
      seenRestored.add(o.id);
      assert(typeof o.kind === 'string' && o.kind.length > 0, 'restored object kind: ' + o.id);
      assert(isNum(o.x) && isNum(o.z), 'restored object position: ' + o.id);
      if (o.patchId !== null && o.patchId !== undefined) {
        assert(typeof o.patchId === 'string' && o.patchId.length > 0, 'restored object patch link: ' + o.id);
      }
      assert(Number.isInteger(o.rev) && o.rev >= 0, 'restored object revision: ' + o.id);
    }
    assert(Array.isArray(expected.objectIds), 'expected object roster required');
    {
      const got = record.objects.map((o) => o.id).sort();
      const want = [...expected.objectIds].sort();
      assert(JSON.stringify(got) === JSON.stringify(want), 'object roster mismatch');
    }
    if (expected.objects !== undefined) {
      assert(Array.isArray(expected.objects), 'expected objects malformed');
      const trusted = new Map(expected.objects.map((o) => [o && o.id, o]));
      for (const o of record.objects) {
        const w = trusted.get(o.id);
        assert(w, 'object substitution: ' + o.id);
        for (const k of ['kind', 'x', 'z', 'patchId', 'rev']) {
          assert(JSON.stringify(o[k] ?? null) === JSON.stringify(w[k] ?? null), 'object mismatch: ' + o.id + '.' + k);
        }
      }
    }
    if (patches !== null) {
      const patchIds = new Set(patches.map((p) => p.id));
      for (const o of record.objects) {
        if (o.patchId !== null && o.patchId !== undefined) {
          assert(patchIds.has(o.patchId), 'object patch association broken: ' + o.id);
        }
      }
    }
    restoredObjects = record.objects.map((o) => ({ ...o }));
  }
  // Applied report IDs ride the checkpoint: the deduplication set is
  // restored, never rebuilt from scratch. A report applied before the
  // shutdown stays applied after the restart.
  const applied = Array.isArray(record.appliedReports) ? record.appliedReports : [];
  {
    const seen = new Set();
    for (const id of applied) {
      assert(typeof id === 'string' && id.length > 0, 'applied report id');
      assert(!seen.has(id), 'duplicated applied report: ' + id);
      seen.add(id);
    }
  }
  return {
    seed: snapshot.seed, tickCount: snapshot.tick, zones, pedestrians, lanes,
    world: JSON.parse(JSON.stringify(meta.world)),
    patches,
    objects: restoredObjects,
    ecoDay: meta.ecoDay === undefined ? null : meta.ecoDay,
    appliedReports: [...applied],
  };
}
