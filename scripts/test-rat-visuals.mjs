import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { chooseRatVisuals, ratAnimationState, headingFromMovement, chooseRatClip, RAT_VISUAL_CAP } from '../src/rat-visual-policy.js';

const a = { id: 'rat-1', x: 0, z: 0, alive: true };
const b = { id: 'rat-2', x: 3, z: 4, alive: true };
const c = { id: 'rat-3', x: 3, z: -4, alive: true };
const d = { id: 'rat-4', x: 12, z: 0, alive: true };
const dead = { id: 'rat-5', x: 1, z: 0, alive: false };
const far = { id: 'rat-6', x: 1000, z: 1000, alive: true };
const roster = [a, d, c, b, dead, far];
assert.deepEqual(chooseRatVisuals(roster, 'rat-1'), ['rat-1','rat-2']);
assert.deepEqual(chooseRatVisuals(roster, 'rat-2', { cap:2 }), ['rat-2','rat-1']);
assert.deepEqual(chooseRatVisuals(roster, 'rat-6', { cap:3 }), ['rat-6']);
assert.deepEqual(chooseRatVisuals([dead], 'rat-5'), []);
assert.deepEqual(chooseRatVisuals(roster, 'rat-1', {cap:0}), []);
assert.equal(chooseRatVisuals(roster, 'rat-1').length <= RAT_VISUAL_CAP, true);
assert.deepEqual(roster, [a,d,c,b,dead,far], 'roster remains untouched');
assert.equal(ratAnimationState(a, {x:0,z:0}), 'idle');
assert.equal(ratAnimationState({...a, x:1}, {x:0,z:0}), 'walk');
assert.equal(ratAnimationState({...a, x:12}, {x:0,z:0}), 'run');
assert.equal(ratAnimationState(dead, a), 'dead');
assert.equal(ratAnimationState(a,null), 'idle');
assert.equal(headingFromMovement({x:1,z:0}, {x:0,z:0}), Math.PI/2);
assert.equal(headingFromMovement({x:0,z:0}, {x:0,z:0}, 1.2),1.2);

const asset = new URL('../assets/black-rat/blackrat.glb', import.meta.url);
const bytes=readFileSync(asset);
assert.equal(bytes.toString('ascii',0,4),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const chunkLength=bytes.readUInt32LE(12);
const doc=JSON.parse(bytes.subarray(20,20+chunkLength).toString('utf8'));
assert.equal(doc.asset.version,'2.0');
assert.equal(doc.skins.length,1);
assert.equal(doc.animations.length,3);
assert(doc.images.length>=2, 'PBR textures must be embedded');
for(const image of doc.images) assert(Number.isInteger(image.bufferView), 'Missing embedded image data');
assert.equal(doc.asset.extras.license,'CC-BY-4.0');
assert(statSync(asset).size > 100_000, 'model must contain non-placeholder textures');
for(const state of ['idle','walk','run','dead']){
 const clip=chooseRatClip(doc.animations,state);
 assert(clip && clip.channels.length>0, 'Missing valid '+state+' rigged animation');
}
assert.equal(doc.materials.length,3);
assert.equal(doc.meshes.length,2);
assert(doc.accessors.length>3000, 'Animated glTF data must not be stubbed');
assert(readFileSync(new URL('../assets/black-rat/ATTRIBUTION.md',import.meta.url),'utf8').includes('CC BY 4.0'));
console.log('PASS Black Rat — CC BY provenance, textured skin GLB, 3 runtime clips, 2-rat detailed mesh budget, idle/walk/run/death visual policies');
