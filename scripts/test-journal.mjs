// Extraction 002 checks. Run: node scripts/test-journal.mjs
// 1. Checksum-for-checksum parity with the quarry's Python source
//    (fixture written by scripts/parity-journal.py from the verbatim file).
// 2. Determinism: the same inputs rebuilt produce the same head.
// 3. Tamper evidence: one altered payload breaks verifyChain().
// 4. JSONL round-trip preserves the chain.

import { readFileSync } from 'node:fs';
import { StateJournal, JournalEventType, hashWorldState } from '../src/journal.js';

const expected = JSON.parse(readFileSync(new URL('./parity-expected.json', import.meta.url), 'utf8'));

const STATS = {
  buildings: 45172,
  buildingsWithYear: 44345,
  buildingsWithNeighborhood: 44929,
  neighborhoods: 38,
  origin: { lat: 40.758, lon: -73.9855, name: 'Times Square' },
};
const ACTION = {
  kind: 'ask',
  via: 'model',
  question: 'pre-war buildings under 50 feet in the East Village',
  query: { nb: 'East Village', yrMax: 1944, hMax: 15.24 },
  matches: 589,
  sampleBins: [1004983],
};

let passed = 0;
function eq(actual, want, label) {
  if (actual !== want) throw new Error(`${label}: got ${actual}, expected ${want}`);
  passed++;
}

const worldHash = await hashWorldState(STATS);
eq(worldHash, expected.worldHash, 'world hash parity');

async function build() {
  const j = new StateJournal();
  await j.append(JournalEventType.SNAPSHOT, 0, STATS);
  await j.append(JournalEventType.TICK_BEGIN, 1, { action: 'ask' });
  await j.append(JournalEventType.ACTION, 1, ACTION);
  await j.append(JournalEventType.TICK_END, 1, { world_hash: worldHash });
  return j;
}

const j = await build();
eq(JSON.stringify(j.entries.map((e) => e.checksum)), JSON.stringify(expected.checksums), 'entry checksums parity');
eq(await j.verifyChain(), expected.verifyChain, 'verifyChain parity');
eq(await j.checksumUntilTick(1), expected.checksumUntilTick1, 'checksumUntilTick parity');

const j2 = await build();
eq(j2.lastChecksum, j.lastChecksum, 'deterministic replay: same head checksum');

const tampered = StateJournal.fromJSONL(j.toJSONL());
tampered._entries[2].payload.matches = 590; // history, rewritten
eq(await tampered.verifyChain(), false, 'tamper detected');

const loaded = StateJournal.fromJSONL(j.toJSONL());
eq(loaded.lastChecksum, j.lastChecksum, 'JSONL round-trip head');
eq(await loaded.verifyChain(), true, 'JSONL round-trip chain verifies');

console.log(`journal: ${passed} checks passed`);
