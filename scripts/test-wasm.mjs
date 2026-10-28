// Verifies the COMPILED WASM core (not just the Rust source) against
// the same fixtures as the native tests. Usage:
//   node scripts/test-wasm.mjs <dir-with-nodejs-target-build>
// The nodejs-target build is a test artifact (the page uses the web
// target in pkg/); both are generated from the same crate by
// wasm-bindgen in docs/extraction-003-rust-core.md's build recipe.

import { readFileSync } from 'node:fs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/test-wasm.mjs <build-dir>'); process.exit(2); }
const core = await import(dir.replace(/\/?$/, '/') + 'twin_core.js');

const expected = JSON.parse(readFileSync(new URL('./parity-expected.json', import.meta.url), 'utf8'));
const STATS = {
  buildings: 45172, buildingsWithYear: 44345, buildingsWithNeighborhood: 44929,
  neighborhoods: 38, origin: { lat: 40.758, lon: -73.9855, name: 'Times Square' },
};
const ACTION = {
  kind: 'ask', via: 'model',
  question: 'pre-war buildings under 50 feet in the East Village',
  query: { nb: 'East Village', yrMax: 1944, hMax: 15.24 },
  matches: 589, sampleBins: [1004983],
};

let passed = 0;
const eq = (a, b, label) => { if (a !== b) throw new Error(`${label}: got ${a}, expected ${b}`); passed++; };

const worldHash = core.core_hash_world_state(JSON.stringify(STATS));
eq(worldHash, expected.worldHash, 'wasm world hash');

const j = new core.CoreJournal();
const sums = [
  j.append('snapshot', 0, JSON.stringify(STATS)),
  j.append('tick_begin', 1, JSON.stringify({ action: 'ask' })),
  j.append('action', 1, JSON.stringify(ACTION)),
  j.append('tick_end', 1, JSON.stringify({ world_hash: worldHash })),
];
eq(JSON.stringify(sums), JSON.stringify(expected.checksums), 'wasm entry checksums');
eq(j.verify(), true, 'wasm verify');
eq(j.checksum_until_tick(1), expected.checksumUntilTick1, 'wasm checksum until tick');

const registry = JSON.parse(readFileSync(new URL('../core/tests/fixtures/anchors.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../core/tests/fixtures/anchors-enu.json', import.meta.url), 'utf8'));
const o = registry.metadata.origin;
let maxDelta = 0;
for (const a of registry.anchors) {
  const g = golden.find((x) => x.id === a.id);
  const p = core.core_enu(o.lat, o.lon, o.elev, a.lat, a.lon, a.elev);
  maxDelta = Math.max(maxDelta, Math.abs(p[0] - g.east), Math.abs(p[1] - g.north), Math.abs(p[2] - g.up));
}
if (maxDelta >= 1e-6) throw new Error(`wasm geodesy drift ${maxDelta} m`);
passed++;

console.log(`wasm core: ${passed} checks passed; anchor max delta ${maxDelta.toExponential(2)} m`);
