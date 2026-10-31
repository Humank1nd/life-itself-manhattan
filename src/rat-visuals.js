// S3 — presentation-only, skinned rats. LIM remains the sole world authority.
// Does not modify pedestrians, choices, journal, resource or checkpoint state.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  RAT_HEIGHT_M, RAT_LENGTH_M, RAT_VISUAL_CAP, chooseRatVisuals,
  chooseRatClip, ratAnimationState, headingFromMovement,
} from './rat-visual-policy.js';

export const RAT_ASSET_URL = new URL('../assets/black-rat/blackrat.glb', import.meta.url).href;
const GROUND_Y = 2.6; // Existing crowd markers hover at y=3; feet near displayed pavement.
const TRANSITION_SECONDS = 0.23;

export function createRatVisuals({
  scene, assetUrl = RAT_ASSET_URL, cap = RAT_VISUAL_CAP, onStatus = () => {},
} = {}) {
  if (!scene || !scene.add || !scene.remove) throw new TypeError('rat visuals need a scene');
  let gltf = null;
  let failed = null;
  let stopped = false;
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xdcecff, 0x282321, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 12, 8);
  lights.add(key);
  scene.add(lights);
  const instances = new Map();
  const previous = new Map();
  let latest = [];
  let latestFocus = null;
  const worldSize = new THREE.Vector3();
  let modelScale = 1;
  let modelGroundOffset = 0;
  let modelRotateX = 0;
  let modelRotateY = 0;

  const loader = new GLTFLoader();
  const load = new Promise((resolve) => {
    loader.load(assetUrl, (result) => {
      if (stopped) { resolve(false); return; }
      gltf = result;
      gltf.scene.traverse((part) => {
        if (!part.isMesh) return;
        const mats = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of mats) {
          if (!material) continue;
          material.side = THREE.DoubleSide;
          if (/fur/i.test(material.name)) {
            // Original color alpha has a genuine cutout fur mask. Alpha test
            // retains cutout depth without per-strand transparent sorting.
            material.alphaTest = 0.36;
            material.transparent = false;
          }
          if (typeof material.roughness === 'number') material.roughness = Math.max(0.72, material.roughness);
          if (typeof material.metalness === 'number') material.metalness = Math.min(0.05, material.metalness);
          material.needsUpdate = true;
        }
        part.castShadow = false; // No shadow pipeline in wireframe preview.
        part.frustumCulled = false; // Skinned bounds move during animation.
      });
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      bounds.getSize(worldSize);
      if (!Number.isFinite(worldSize.y) || worldSize.y <= 1e-7) {
        failed = 'invalid model bounds'; gltf = null; onStatus(failed); resolve(false); return;
      }
      // FBX source uses +Y for nose-to-tail; Blender's glTF exporter can
      // already remap that into Z. Calibrate from actual loaded mesh bounds.
      const longest = Math.max(worldSize.x, worldSize.y, worldSize.z);
      if (!(longest > 0.01)) {
        failed = 'rat body has no valid length'; gltf = null; onStatus(failed); resolve(false); return;
      }
      const sourceLength = gltf.parser?.json?.asset?.extras?.sourceLengthMeters;
      // Skinned rest-pose bounds underreport the source body's extent.
      // Use Blender's measured original source dimensions, not raw rest bounds.
      modelScale = RAT_LENGTH_M / (Number.isFinite(sourceLength) && sourceLength > 0 ? sourceLength : longest);
      modelRotateX = worldSize.y === longest ? Math.PI / 2 : 0;
      modelRotateY = worldSize.x === longest ? -Math.PI / 2 : 0;
      const calibrated = cloneSkinned(gltf.scene);
      calibrated.scale.setScalar(modelScale);
      calibrated.rotation.set(modelRotateX, modelRotateY, 0);
      const oriented = new THREE.Box3().setFromObject(calibrated);
      modelGroundOffset = -oriented.min.y;
      onStatus('ready: ' + result.animations.length + ' rigged clips');
      resolve(true);
    }, undefined, (err) => {
      failed = String(err?.message || err);
      onStatus('rat model unavailable: ' + failed);
      resolve(false); // A visual failure must never pause the city.
    });
  });

  function setClip(entity, state) {
    if (entity.state === state) return;
    entity.state = state;
    if (state === 'dead') { entity.mixer.timeScale = 0; return; }
    entity.mixer.timeScale = 1;
    const clip = chooseRatClip(gltf.animations, state);
    if (!clip) return;
    const action = entity.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    if (entity.current && entity.current !== action) entity.current.crossFadeTo(action, TRANSITION_SECONDS, false);
    entity.current = action;
  }

  function createInstance(id, ped) {
    const model = cloneSkinned(gltf.scene);
    const root = new THREE.Group();
    model.scale.setScalar(modelScale);
    model.rotation.set(modelRotateX, modelRotateY, 0);
    model.position.y = modelGroundOffset;
    root.add(model);
    // Neutral, non-colliding ground contact cue: the current wireframe scene
    // has no pavement mesh, so dark rat fur needs a readable surface.
    const contact = new THREE.Mesh(
      new THREE.CircleGeometry(0.29, 40),
      new THREE.MeshBasicMaterial({
        color: 0x53646d, transparent: true, opacity: 0.58,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.008;
    root.add(contact);
    root.position.set(ped.x, GROUND_Y, ped.z);
    root.userData.ratId = id;
    const mixer = new THREE.AnimationMixer(model);
    scene.add(root);
    const entity = {
      root, mixer, state: null, current: null,
      target: new THREE.Vector3(ped.x, GROUND_Y, ped.z),
      heading: 0,
    };
    instances.set(id, entity);
    setClip(entity, ratAnimationState(ped, null));
    return entity;
  }

  function update(pedestrians, focusId) {
    if (!Array.isArray(pedestrians)) return false;
    latest = pedestrians;
    latestFocus = focusId;
    if (!gltf || stopped) return false;
    const ids = chooseRatVisuals(pedestrians, focusId, { cap });
    const keep = new Set(ids);
    for (const [id, entity] of instances) {
      if (keep.has(id)) continue;
      scene.remove(entity.root);
      entity.mixer.stopAllAction();
      instances.delete(id);
    }
    for (const id of ids) {
      const ped = pedestrians.find((p) => p.id === id);
      if (!ped) continue;
      const old = previous.get(id) || null;
      const entity = instances.get(id) || createInstance(id, ped);
      entity.target.set(ped.x, GROUND_Y, ped.z);
      entity.heading = headingFromMovement(ped, old, entity.heading);
      // A rat may rotate but never alter the actual movement position here.
      entity.root.rotation.y = entity.heading;
      setClip(entity, ratAnimationState(ped, old));
      previous.set(id, { x: ped.x, z: ped.z });
    }
    for (const id of previous.keys()) if (!keep.has(id)) previous.delete(id);
    return true;
  }

  function advance(dt) {
    if (stopped || !gltf || !Number.isFinite(dt)) return;
    const delta = Math.min(Math.max(dt, 0), 0.1);
    for (const entity of instances.values()) {
      entity.mixer.update(delta);
      // Visual smoothing only. The 5s simulation tick remains authoritative.
      entity.root.position.lerp(entity.target, Math.min(1, delta / 0.75));
    }
  }

  // Presentation camera only: the rat and its ENU coordinates remain read-only.
  function focus(camera, controls, id = latestFocus) {
    // Before the details panel opens, the selection is null. Use the same
    // deterministic first living rat that the capped visual roster uses.
    const ped = latest.find((p) => p?.id === id && p.alive !== false)
      || latest.find((p) => p && p.alive !== false && Number.isFinite(p.x) && Number.isFinite(p.z));
    if (!ped || !camera?.position || !controls?.target) return false;
    const target = new THREE.Vector3(ped.x, GROUND_Y + RAT_HEIGHT_M * 0.65, ped.z);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0.48, 0.32, 0.78));
    camera.near = Math.min(camera.near, 0.025);
    camera.updateProjectionMatrix();
    controls.update();
    return true;
  }

  load.then((ok) => { if (ok) update(latest, latestFocus); });
  return Object.freeze({
    load, update, advance, focus,
    // Camera can track a visual position while the world/journal remains
    // authoritative. This returns a copy, never a mutable scene handle.
    displayPositionOf: (id) => {
      const v = instances.get(id)?.root.position;
      return v ? Object.freeze({ x: v.x, y: v.y, z: v.z }) : null;
    },
    stats: () => Object.freeze({
      ready: Boolean(gltf), error: failed, visible: instances.size,
      ids: [...instances.keys()],
      actors: [...instances].map(([id, entity]) => ({
        id, state: entity.state,
        activeClip: entity.current?.getClip().name || null,
        simulatedTarget: entity.target.toArray(),
        displayPosition: entity.root.position.toArray(),
      })),
      clipNames: gltf ? gltf.animations.map((a) => a.name) : [],
      modelScale, modelDimensionsInput: worldSize.toArray(), modelGroundOffset,
      source: 'Nestaeric Black Rat CC BY 4.0 / Sketchfab',
    }),
    dispose: () => {
      stopped = true;
      scene.remove(lights);
      for (const entity of instances.values()) {
        scene.remove(entity.root); entity.mixer.stopAllAction();
      }
      instances.clear();
    },
  });
}
