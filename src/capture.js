// Life Itself Manhattan — browser side of the renderer-neutral
// capture pipeline. Renders solid prisms from the authoritative
// current geometry for the buildings named in the capture spec and
// downloads RGB / depth / segmentation frames plus a run manifest.
// The canvas carries no HUD and no text: captures are clean inputs.
import * as THREE from 'three';

const statusEl = document.getElementById('status');
const btn = document.getElementById('capture-btn');
const setStatus = (t) => { statusEl.textContent = t; };

const spec = await (await fetch('data/capture-pilot-v1.json')).json();
const allBuildings = await (await fetch('data/manhattan-enu.json')).json();
const byBin = new Map(allBuildings.map((b) => [b.bin, b]));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(spec.image.width, spec.image.height);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(spec.image.fovDeg, 1, 0.5, 3000);

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x1a2432, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(400, 800, 200);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(700, 48).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x11161d })
);
ground.userData.rgbMaterial = ground.material;
ground.userData.segMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
scene.add(ground);

const LOW = new THREE.Color(0x2b6cb0);
const HIGH = new THREE.Color(0xaee7ff);
const meshes = [];
for (const entry of spec.buildings) {
  const source = byBin.get(entry.bin);
  if (!source) continue;
  const ring = source.rings[0];
  const shape = new THREE.Shape();
  ring.forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: source.h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // shape plane -> ground plane, extrusion -> up
  const t = Math.min(source.h / 300, 1);
  const rgbMat = new THREE.MeshLambertMaterial({ color: LOW.clone().lerp(HIGH, t) });
  const mesh = new THREE.Mesh(geo, rgbMat);
  mesh.userData.rgbMaterial = rgbMat;
  mesh.userData.segMaterial = new THREE.MeshBasicMaterial({ color: entry.color });
  scene.add(mesh);
  meshes.push(mesh);
}

const depthMaterial = new THREE.ShaderMaterial({
  uniforms: {
    nearM: { value: spec.image.depthEncoding.nearM },
    farM: { value: spec.image.depthEncoding.farM }
  },
  vertexShader: `
    varying float vDist;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying float vDist;
    uniform float nearM;
    uniform float farM;
    void main() {
      float g = 1.0 - clamp((vDist - nearM) / (farM - nearM), 0.0, 1.0);
      gl_FragColor = vec4(vec3(g), 1.0);
    }`
});

function applyPass(pass) {
  scene.overrideMaterial = null;
  if (pass === 'rgb') {
    scene.background = new THREE.Color(0x0b1626);
    for (const m of [ground, ...meshes]) m.material = m.userData.rgbMaterial;
  } else if (pass === 'depth') {
    scene.background = new THREE.Color(0x000000);
    scene.overrideMaterial = depthMaterial;
  } else { // segmentation
    scene.background = new THREE.Color(0x000000);
    for (const m of [ground, ...meshes]) m.material = m.userData.segMaterial;
  }
}
function setPose(enu) {
  camera.position.set(enu[0], enu[1], enu[2]);
  camera.lookAt(enu[0] + 10, enu[1], enu[2]); // faces +east, level
  camera.updateMatrixWorld();
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const frameBlob = () => new Promise((res) => renderer.domElement.toBlob(res, 'image/png'));
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// Preview the first waypoint's RGB pass so the tool is never a black box.
applyPass('rgb');
setPose(spec.frames[0].poseEnu);
renderer.render(scene, camera);
btn.disabled = false;
btn.textContent = `Capture ${spec.frames.length} frames + run manifest`;
setStatus(`Ready: ${meshes.length} buildings, ${spec.frames.length} frames planned.`);

btn.addEventListener('click', async () => {
  btn.disabled = true;
  for (const frame of spec.frames) {
    setStatus(`Rendering ${frame.id}…`);
    applyPass(frame.pass);
    setPose(frame.poseEnu);
    renderer.render(scene, camera);
    download(await frameBlob(), `${frame.id}.png`);
    await wait(150);
  }
  const run = {
    schemaVersion: 'life-itself-capture-run/1.0.0',
    capturedAt: new Date().toISOString(),
    tool: 'capture.html (Life Itself Manhattan capture pipeline)',
    specStatus: spec.status,
    note: 'Frames rendered from the current authoritative geometry. Captures are renderer inputs and evaluation material, not historical evidence.',
    geometry: spec.geometry,
    policy: spec.policy,
    image: spec.image,
    frames: spec.frames,
    legend: spec.buildings
  };
  download(new Blob([JSON.stringify(run, null, 2) + '\n'], { type: 'application/json' }), 'capture-manifest.json');
  applyPass('rgb');
  setPose(spec.frames[0].poseEnu);
  renderer.render(scene, camera);
  setStatus('Done: 9 frames + capture-manifest.json downloaded. Check your downloads folder.');
  btn.disabled = false;
});
