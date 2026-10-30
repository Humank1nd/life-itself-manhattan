// S03d local refresh runner: exactly one on-demand cycle. Reads the
// versioned query manifest, resolves live dataset metadata, refreshes each
// dataset into a local archive, prints the outcome, and exits. No timers, no
// daemons, no unattended execution: schedulers invoke this process.
// Usage: node scripts/run-evidence-refresh.mjs [--archive-dir <path>]
import { readFile } from 'node:fs/promises';
import { refreshAll } from '../src/evidence-refresh.js';
import { assertApprovedUrl } from '../src/nyc-retrieval.js';
const args = process.argv.slice(2);
const archiveDir = (() => {
  const flag = args.indexOf('--archive-dir');
  if (flag >= 0 && args[flag + 1]) return args[flag + 1];
  return '/tmp/s03d-archive';
})();
const getJson = async (url) => {
  assertApprovedUrl(url);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('metadata fetch failed: HTTP ' + res.status + ' for ' + url);
  return res.json();
};
const manifest = JSON.parse(await readFile(new URL('../data/evidence-queries-v1.json', import.meta.url), 'utf8'));
const metaByDataset = {};
for (const query of manifest.queries) {
  try {
    const meta = await getJson('https://data.cityofnewyork.us/api/views/' + query.datasetId);
    const count = await getJson('https://data.cityofnewyork.us/resource/' + query.datasetId + '.json?$select=count(*%20)');
    const fullRowCount = Number(count[0] && count[0].count);
    if (!Number.isInteger(fullRowCount)) throw new Error('full row count is not an integer for ' + query.datasetId);
    const rowsUpdatedAt = new Date(meta.rowsUpdatedAt * 1000).toISOString();
    if (rowsUpdatedAt === 'Invalid Date') throw new Error('rowsUpdatedAt is not a timestamp for ' + query.datasetId);
    metaByDataset[query.datasetId] = { rowsUpdatedAt, fullRowCount };
  } catch (err) {
    metaByDataset[query.datasetId] = { error: err && err.message ? err.message : String(err) };
  }
}
const status = await refreshAll({ archiveDir, manifest, fetchFn: fetch, metaByDataset });
let stale = 0;
for (const result of status.results) {
  if (result.status === 'stale') {
    stale += 1;
    console.log('STALE ' + result.queryName + ' (' + result.datasetId + '): ' + result.error);
    if (result.preserved) console.log('  preserved snapshot ' + result.preserved.sha256 + ' from ' + result.preserved.retrievedAt);
  } else if (result.changed) {
    console.log('CHANGED ' + result.queryName + ': +' + result.changes.added.length + ' -' + result.changes.removed.length + ' ~' + result.changes.changed.length + ' (' + result.sha256.slice(0, 12) + ')');
  } else {
    console.log('UNCHANGED ' + result.queryName + ' (' + result.sha256.slice(0, 12) + ', ' + result.recordCount + ' records)');
  }
}
console.log('archive: ' + archiveDir);
if (stale > 0) {
  console.log(stale + ' dataset(s) stale; last verified snapshots preserved');
  process.exit(2);
}
console.log('DONE: one refresh cycle, no simulation events emitted');
