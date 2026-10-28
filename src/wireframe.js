// Life Itself — Manhattan wireframe.
// three.js over the Twin Earth ENU frame (origin: Times Square, meters, Y-up).
// Every building is drawn as a wireframe prism: real footprint, real roof height.
// One LineSegments draw call for the whole island.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const statusEl = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.Fog(0x05070a, 18000, 42000);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 120000);
camera.position.set(6800, 4300, 15200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById('app').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, -2600);
controls.enableDamping = true;
controls.maxDistance = 45000;

const grid = new THREE.GridHelper(26000, 52, 0x1d2b3a, 0x111a24);
grid.position.z = -2600;
scene.add(grid);

// Wire color ramps with height: deep blue at the street, pale ice at the towers.
const LOW = new THREE.Color(0x2b6cb0);
const HIGH = new THREE.Color(0xaee7ff);
function colorFor(h, out) {
  const t = Math.min(h / 300, 1);
  out.copy(LOW).lerp(HIGH, t);
  return out;
}

async function loadIsland() {
  const res = await fetch('data/manhattan-enu.json');
  if (!res.ok) throw new Error(`data HTTP ${res.status}`);
  const buildings = await res.json();

  let vertCount = 0;
  for (const b of buildings) for (const ring of b.rings) vertCount += ring.length * 6;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  let p = 0;
  const c = new THREE.Color();
  function push(x1, y1, z1, x2, y2, z2, col) {
    positions[p] = x1; positions[p + 1] = y1; positions[p + 2] = z1;
    positions[p + 3] = x2; positions[p + 4] = y2; positions[p + 5] = z2;
    colors[p] = col.r; colors[p + 1] = col.g; colors[p + 2] = col.b;
    colors[p + 3] = col.r; colors[p + 4] = col.g; colors[p + 5] = col.b;
    p += 6;
  }
  for (const b of buildings) {
    colorFor(b.h, c);
    for (const ring of b.rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const [x1, z1] = ring[i];
        const [x2, z2] = ring[(i + 1) % n];
        push(x1, 0, z1, x2, 0, z2, c);          // ground loop
        push(x1, b.h, z1, x2, b.h, z2, c);      // roof loop
        push(x1, 0, z1, x1, b.h, z1, c);        // vertical
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
  scene.add(lines);
  statusEl.textContent =
    `Manhattan wireframe is up: ${buildings.length.toLocaleString()} buildings at real height. ` +
    `Twin Earth ENU frame, origin Times Square. Ground truth: NYC Open Data.`;
}

loadIsland().catch((err) => {
  console.error(err);
  statusEl.textContent = 'The island data failed to load. Check the console for details.';
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
