// Life Itself — Manhattan wireframe.
// three.js over the Twin Earth ENU frame (origin: Times Square, meters, Y-up).
// Every building is drawn as a wireframe prism: real footprint, real roof height.
// One LineSegments draw call for the whole island.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { interpret, runQuery, describe } from './ask.js';
import { StateJournal, JournalEventType, hashWorldState } from './journal.js';

const statusEl = document.getElementById('status');

// --- The island's journal (Extraction 002): the hash-chained StateJournal
// ported from the quarry (genesis/state_journal.py). Every interaction is
// one tick, wrapped tick_begin / tick_end the way the runtime wraps a
// simulation step, with tick_end carrying the world hash. The ground never
// changes, so the world hash never moves; only the history grows. ---
const journal = new StateJournal();
let islandTick = 0;
let worldHash = null;
let journalNote = null;
const journalEl = document.getElementById('journal');
const shortHash = (h) => (h ? `${h.slice(0, 12)}…` : '—');
async function renderJournal() {
  const through = await journal.checksumUntilTick(islandTick);
  journalEl.textContent = journalNote ||
    `Journal · ${journal.entries.length} entries · tick ${islandTick} · head ${shortHash(journal.lastChecksum)} · history checksum ${shortHash(through)}`;
}
journal.onAppend = () => { renderJournal().catch(() => {}); };
window.islandJournal = journal; // anyone may audit the chain from the console

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
  buildPickIndex(buildings);
  statusEl.textContent =
    `Manhattan wireframe is up: ${buildings.length.toLocaleString()} buildings at real height. ` +
    `Twin Earth ENU frame, origin Times Square. Ground truth: NYC Open Data.`;
  const stats = {
    buildings: buildings.length,
    buildingsWithYear: buildings.filter((b) => b.yr).length,
    buildingsWithNeighborhood: buildings.filter((b) => b.nb).length,
    neighborhoods: nbNames.length,
    origin: { lat: 40.758, lon: -73.9855, name: 'Times Square' },
    datasets: ['BUILDING 5zhs-2jue', 'BUILDING_P u9wf-3gbt', 'NTA2020 9nt8-h7nd'],
  };
  worldHash = await hashWorldState(stats);
  await journal.append(JournalEventType.SNAPSHOT, 0, stats);
  await loadAnchors();
  await loadStreets();
}

// --- Extraction 004: the surveyed street corridors come home.
// gods-eye-view/src/life/manhattanStreets.js holds real WGS84 waypoints
// for eleven downtown corridors (Broadway, Wall Street, Maiden Lane,
// and a Times Square Broadway segment among them), authored for the
// twin's traffic layer. Projected through the verified transform into
// data/streets-enu.json; drawn as ground lines the buildings stand on.
async function loadStreets() {
  try {
    const res = await fetch('data/streets-enu.json');
    if (!res.ok) return;
    const corridors = await res.json();
    const names = Object.keys(corridors);
    const mat = new THREE.LineBasicMaterial({ color: 0x4a6fa5, transparent: true, opacity: 0.8 });
    for (const name of names) {
      const pts = corridors[name].map(([x, z]) => new THREE.Vector3(x, 1, z));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(geo, mat));
    }
    statusEl.textContent += ` ${names.length} surveyed street corridors underlie downtown.`;
  } catch { /* corridors are an overlay; the island stands without them */ }
}

// --- The docking: Twin Earth NYC's surveyed anchors stand on the island.
// The registry is the founder's (twin-earth-nyc, data/anchors.json),
// extracted verbatim; positions were projected by the verified transform
// (scripts/project-anchors.mjs) into data/anchors-enu.json. Red points at
// Times Square; click one to read its canonical record. ---
let islandAnchors = null;

async function loadAnchors() {
  try {
    const res = await fetch('data/anchors-enu.json');
    if (!res.ok) return;
    islandAnchors = await res.json();
    const pos = new Float32Array(islandAnchors.length * 3);
    islandAnchors.forEach((a, i) => {
      pos[i * 3] = a.x; pos[i * 3 + 1] = Math.max(a.y, 0) + 2; pos[i * 3 + 2] = a.z;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xff5340, size: 9, sizeAttenuation: false, transparent: true, opacity: 0.95,
    }));
    scene.add(points);
    statusEl.textContent += ` ${islandAnchors.length} Twin Earth survey anchors stand at Times Square, in red.`;
  } catch { /* anchors are an overlay; the island stands without them */ }
}

function selectAnchor(a) {
  if (highlight) { scene.remove(highlight); highlight.geometry.dispose(); }
  const geo = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(16));
  highlight = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff5340 }));
  highlight.position.set(a.x, Math.max(a.y, 0) + 2, a.z);
  scene.add(highlight);
  pickEl.textContent =
    `Anchor ${a.id} · ${a.name} · ${a.type} · surveyed tolerance ±${a.tolerance_m} m. ` +
    'Source: Twin Earth NYC anchor registry.';
  if (worldHash) {
    journalNote = null;
    const tick = ++islandTick;
    journal.append(JournalEventType.TICK_BEGIN, tick, { action: 'select' });
    journal.append(JournalEventType.ACTION, tick, {
      kind: 'anchor', id: a.id, name: a.name, tolerance_m: a.tolerance_m,
    });
    journal.append(JournalEventType.TICK_END, tick, { world_hash: worldHash });
  }
}

// --- Building selection: click the island, get the building's real record. ---
const pickEl = document.getElementById('pick');
const CELL = 100; // meters
const pickGrid = new Map();
let islandBuildings = null;
let highlight = null;

function buildPickIndex(buildings) {
  islandBuildings = buildings;
  nbNames = [...new Set(buildings.map((b) => b.nb).filter(Boolean))];
  for (let i = 0; i < buildings.length; i++) {
    const ring = buildings[i].rings[0];
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x; cz += z; }
    cx /= ring.length; cz /= ring.length;
    buildings[i].cx = cx; buildings[i].cz = cz;
    const key = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
    if (!pickGrid.has(key)) pickGrid.set(key, []);
    pickGrid.get(key).push(i);
  }
}

function prismPositions(b) {
  const pts = [];
  for (const ring of b.rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % n];
      pts.push(x1, 0, z1, x2, 0, z2, x1, b.h, z1, x2, b.h, z2, x1, 0, z1, x1, b.h, z1);
    }
  }
  return new Float32Array(pts);
}

function selectBuilding(b) {
  if (highlight) { scene.remove(highlight); highlight.geometry.dispose(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(prismPositions(b), 3));
  highlight = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd76a }));
  scene.add(highlight);
  pickEl.textContent =
    `Building ${b.bin} · ${Math.round(b.h / 0.3048).toLocaleString()} ft tall` +
    (b.yr ? ` · built ${b.yr}` : ' · year not in the city record') +
    (b.nb ? ` · ${b.nb}` : '') +
    '. Source: NYC Open Data.';
  if (worldHash) {
    journalNote = null;
    const tick = ++islandTick;
    journal.append(JournalEventType.TICK_BEGIN, tick, { action: 'select' });
    journal.append(JournalEventType.ACTION, tick, {
      kind: 'select', bin: b.bin, height_m: b.h, built_year: b.yr, neighborhood: b.nb,
    });
    journal.append(JournalEventType.TICK_END, tick, { world_hash: worldHash });
  }
}

// --- Ask the Island: a question becomes a query; matches light up gold. ---
const answerEl = document.getElementById('answer');
const askForm = document.getElementById('ask');
const askInput = document.getElementById('ask-input');
let matchLines = null;
let nbNames = [];

function showMatches(matches, cap) {
  if (matchLines) { scene.remove(matchLines); matchLines.geometry.dispose(); matchLines = null; }
  const shown = matches.slice(0, cap);
  if (!shown.length) return shown;
  let total = 0;
  const chunks = [];
  for (const b of shown) { const arr = prismPositions(b); chunks.push(arr); total += arr.length; }
  const all = new Float32Array(total);
  let o = 0;
  for (const arr of chunks) { all.set(arr, o); o += arr.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
  matchLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.95 }));
  scene.add(matchLines);
  return shown;
}

// Camera flight: after an answer, glide to frame the lit buildings.
// (Idea adopted from the parallel local build, founder's ruling 2026-10-28;
// implementation is this repo's own.)
let flight = null;
function flyToMatches(shown) {
  if (!shown.length) return;
  let cx = 0, cz = 0;
  for (const b of shown) { cx += b.cx; cz += b.cz; }
  cx /= shown.length; cz /= shown.length;
  let r = 0;
  for (const b of shown) r = Math.max(r, Math.hypot(b.cx - cx, b.cz - cz));
  const dist = THREE.MathUtils.clamp(r * 2.4, 700, 16000);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const toTgt = new THREE.Vector3(cx, 0, cz);
  const toPos = toTgt.clone().add(dir.multiplyScalar(dist));
  toPos.y = Math.max(toPos.y, dist * 0.45);
  flight = { t0: performance.now(), dur: 1400, fromPos: camera.position.clone(), toPos, fromTgt: controls.target.clone(), toTgt };
  controls.enabled = false;
}
function stepFlight() {
  if (!flight) return;
  let t = Math.min((performance.now() - flight.t0) / flight.dur, 1);
  t = 1 - Math.pow(1 - t, 3); // easeOutCubic
  camera.position.lerpVectors(flight.fromPos, flight.toPos, t);
  controls.target.lerpVectors(flight.fromTgt, flight.toTgt, t);
  if (t >= 1) { flight = null; controls.enabled = true; }
}

askForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question) return;
  if (!islandBuildings) { answerEl.textContent = 'The island is still drawing itself. One moment.'; return; }
  answerEl.textContent = 'Asking the island…';
  journalNote = null;
  const tick = ++islandTick;
  if (worldHash) await journal.append(JournalEventType.TICK_BEGIN, tick, { action: 'ask' });
  const { query, via } = await interpret(question, nbNames);
  const { matches, stats } = runQuery(islandBuildings, query);
  const cap = query.sort ? 200 : 4000;
  const shown = showMatches(matches, cap);
  let text = describe(query, stats, via);
  if (stats.count > shown.length && shown.length > 0) text += ` (Lighting up ${shown.length.toLocaleString()} of them.)`;
  answerEl.textContent = text;
  flyToMatches(shown);
  if (worldHash) {
    await journal.append(JournalEventType.ACTION, tick, {
      kind: 'ask', via, question, query, matches: stats.count,
      sampleBins: shown.slice(0, 5).map((b) => b.bin),
    });
    await journal.append(JournalEventType.TICK_END, tick, { world_hash: worldHash });
  }
});

document.getElementById('verify').addEventListener('click', async () => {
  const checked = journal.entries.length;
  const ok = await journal.verifyChain();
  const through = await journal.checksumUntilTick(islandTick);
  journalNote = ok
    ? `Journal verified · ${checked} entries · chain intact · history through tick ${islandTick}: ${through}`
    : 'Journal verification FAILED — the chain does not recompute. This history cannot be trusted.';
  if (worldHash) {
    const tick = ++islandTick;
    await journal.append(JournalEventType.TICK_BEGIN, tick, { action: 'verify' });
    await journal.append(JournalEventType.ACTION, tick, {
      kind: 'verify', ok, entriesChecked: checked, throughChecksum: through,
    });
    await journal.append(JournalEventType.TICK_END, tick, { world_hash: worldHash });
  }
  renderJournal().catch(() => {});
});

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    askInput.value = chip.textContent.trim();
    askForm.requestSubmit();
  });
}

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY;
  if (flight) { flight = null; controls.enabled = true; } // a grab cancels the flight
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!islandBuildings) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return; // it was a drag
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
  if (islandAnchors) {
    let aBest = null, aD = 60; // meters — anchors are sparse, surveyed points
    for (const a of islandAnchors) {
      const d = Math.hypot(a.x - hit.x, a.z - hit.z);
      if (d < aD) { aD = d; aBest = a; }
    }
    if (aBest) { selectAnchor(aBest); return; }
  }
  const gx = Math.floor(hit.x / CELL), gz = Math.floor(hit.z / CELL);
  let best = null, bestD = 75; // meters
  for (let a = -1; a <= 1; a++) for (let bCell = -1; bCell <= 1; bCell++) {
    const cell = pickGrid.get(`${gx + a},${gz + bCell}`);
    if (!cell) continue;
    for (const i of cell) {
      const b = islandBuildings[i];
      const d = Math.hypot(b.cx - hit.x, b.cz - hit.z);
      if (d < bestD) { bestD = d; best = b; }
    }
  }
  if (best) selectBuilding(best);
});

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
  stepFlight();
  controls.update();
  renderer.render(scene, camera);
});
