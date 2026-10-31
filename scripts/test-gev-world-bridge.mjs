import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonical } from '../src/journal.js';
import { createLivingCity, tickLivingCity } from '../src/living-city.js';
import { normalizeGEVWorldSnapshot, verifyGEVWorldSnapshot, applyGEVWorldSnapshot } from '../src/gev-world-bridge.js';
const corridors = JSON.parse(readFileSync(new URL('../data/streets-enu.json', import.meta.url), 'utf8'));
const make = () => createLivingCity(corridors, { seed: 20261028, pedestrians: 96 });
const recordedAt = new Date().toISOString();
const snapshot = {
  schemaVersion:'life-itself-gev-world/1.0.0',
  snapshotId:'gev-'+'a'.repeat(64),
  source:{system:'gods-eye-view',revision:'926430176df5'},
  recordedAt, world:{traffic:'green',weather:'good',disasters:[{lon:-146.862,lat:64.499,type:'quake',mag:1.5}],servicesNear:false},
  provenance:{
    traffic:{classification:'proxy'},
    weather:{classification:'fallback'},
    fires:{classification:'unavailable'},
    quakes:{classification:'observed-feed'},
    servicesNear:{classification:'camera-registry-proxy'},
  },
};
snapshot.snapshotId = 'gev-' + createHash('sha256').update(canonical([
  snapshot.recordedAt,snapshot.source.revision,snapshot.world,snapshot.provenance
])).digest('hex');
assert.equal((await verifyGEVWorldSnapshot(snapshot)).snapshotId,snapshot.snapshotId);
assert.equal((await verifyGEVWorldSnapshot(normalizeGEVWorldSnapshot(snapshot))).snapshotId,snapshot.snapshotId,
  'content ID survives normalized disaster field order');
const forged=structuredClone(snapshot); forged.world.servicesNear=true;
await assert.rejects(()=>verifyGEVWorldSnapshot(forged),/digest mismatch/);
const control = make(), applied = make();
tickLivingCity(control);
const accepted = applyGEVWorldSnapshot(applied,snapshot);
assert.equal(accepted.applied,true);
tickLivingCity(applied);
assert.deepEqual(applied.zones.map((z,i) => z.happy-control.zones[i].happy),[-5,-5,-5,-5,-5]);
assert.equal(applied.pedestrians.length,96);
const prior = JSON.stringify(applied);
assert.equal(applyGEVWorldSnapshot(applied,snapshot,snapshot.snapshotId).applied,false);
assert.equal(JSON.stringify(applied),prior,'duplicate must not change state');
const restored = make();
applyGEVWorldSnapshot(restored,snapshot);
tickLivingCity(restored);
assert.deepEqual(restored,applied,'replay with pinned snapshot is deterministic');
for(const [label, mutate] of Object.entries({
  future:s => {s.recordedAt='2099-01-01T00:00:00.000Z';},
  stale:s => {s.recordedAt='2020-01-01T00:00:00.000Z';},
  missingSource:s => {s.source.system='other';},
  wrongWorld:s => {s.world.traffic='purple';},
  badCoordinates:s => {s.world.disasters=[{lat:91,lon:0,type:'quake'}];},
  missingProvenance:s => {delete s.provenance.servicesNear;},
  forgedClassification:s => {s.provenance.servicesNear.classification='measured';},
})){
 const broken=structuredClone(snapshot);mutate(broken);
 assert.throws(()=>normalizeGEVWorldSnapshot(broken),undefined,label);
}
console.log('PASS GEV live bridge — 5-zone −5 effect, idempotency, pinned deterministic replay, seven adversarial rejections');
