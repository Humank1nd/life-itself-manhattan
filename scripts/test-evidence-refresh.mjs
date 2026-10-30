// Gate for the S03d refresh cycle: versioned manifests, immutable archives,
// exact record-level diffs, and stale-source preservation — all against
// controlled stub responses in a temporary archive. No live network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  diffRecords,
  indexByKey,
  loadLatest,
  refreshAll,
  refreshDataset,
  storeRevision,
  validateRefreshManifest,
} from '../src/evidence-refresh.js';
import { buildEvidenceUrl } from '../src/nyc-retrieval.js';
// Isolation: the refresh layer may use node builtins and the retrieval
// boundary only — never simulation modules.
const refreshSource = readFileSync(new URL('../src/evidence-refresh.js', import.meta.url), 'utf8');
const specifiers = [...refreshSource.matchAll(/^import\s+[^;]+?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
assert.ok(specifiers.length > 0, 'expected imports to audit');
for (const specifier of specifiers) {
  assert.ok(specifier.startsWith('node:') || specifier === './nyc-retrieval.js', 'refresh layer must not import ' + specifier);
}
// The committed manifest validates as the versioned query contract.
const repoManifest = JSON.parse(await readFile(new URL('../data/evidence-queries-v1.json', import.meta.url), 'utf8'));
validateRefreshManifest(repoManifest);
assert.deepEqual(repoManifest.queries.map((query) => query.datasetId), ['rv63-53db', '8ev8-jjxq']);
assert.throws(() => validateRefreshManifest({ ...repoManifest, manifestVersion: 'v9' }), /version mismatch/);
assert.throws(() => validateRefreshManifest({ manifestVersion: 'life-itself-evidence-queries/1.0.0', queries: [] }), /at least one query/);
assert.throws(() => validateRefreshManifest({
  manifestVersion: 'life-itself-evidence-queries/1.0.0',
  queries: [
    { name: 'dup', datasetId: 'rv63-53db', params: {}, recordKey: ['schedulecode'], sampleQuery: 's' },
    { name: 'dup', datasetId: '8ev8-jjxq', params: {}, recordKey: ['zone'], sampleQuery: 's' },
  ],
}), /duplicate refresh query name/);
// Controlled HTTP: routes keyed by exact built URL, backed by mutable fixtures.
const freqParams = { $select: 'schedulecode,freq_refuse', $limit: '5000' };
const zonesParams = { $limit: '50000' };
const freqUrl = buildEvidenceUrl('rv63-53db', freqParams);
const zonesUrl = buildEvidenceUrl('8ev8-jjxq', zonesParams);
const manifest = {
  manifestVersion: 'life-itself-evidence-queries/1.0.0',
  queries: [
    { name: 'freq-test', datasetId: 'rv63-53db', params: freqParams, recordKey: ['schedulecode'], sampleQuery: 'synthetic sample' },
    { name: 'zones-test', datasetId: '8ev8-jjxq', params: zonesParams, recordKey: ['zone'], sampleQuery: 'synthetic full pull' },
  ],
};
const meta = {
  'rv63-53db': { rowsUpdatedAt: '2026-10-30T10:00:00Z', fullRowCount: 610 },
  '8ev8-jjxq': { rowsUpdatedAt: '2026-10-30T10:09:12Z', fullRowCount: 20 },
};
const fakeHeaders = (map) => ({ get: (name) => Object.prototype.hasOwnProperty.call(map, String(name).toLowerCase()) ? map[String(name).toLowerCase()] : null });
const streamBody = (chunks) => {
  const queue = chunks.slice();
  return { getReader: () => ({ read: async () => queue.length ? { done: false, value: queue.shift() } : { done: true, value: undefined }, cancel: async () => {} }) };
};
const fixtures = { freq: null, zones: null, failures: new Set() };
const stubFetch = async (url) => {
  if (fixtures.failures.has(url)) throw new Error('synthetic network failure');
  let records = null;
  if (url === freqUrl) records = fixtures.freq;
  else if (url === zonesUrl) records = fixtures.zones;
  else throw new Error('unexpected fetch: ' + url);
  const raw = JSON.stringify(records);
  return { url, status: 200, headers: fakeHeaders({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(raw, 'utf8')) }), body: streamBody([Buffer.from(raw, 'utf8')]) };
};
const revisionDirs = (archiveDir, datasetId) => readdirSync(join(archiveDir, datasetId), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const archive = mkdtempSync(join(tmpdir(), 's03d-archive-'));
fixtures.freq = [
  { schedulecode: '1052A', freq_refuse: 'Mon, Wed, Fri' },
  { schedulecode: '1052B', freq_refuse: 'Tue, Thu, Sat' },
];
fixtures.zones = [{ zone: 'MN-5' }, { zone: 'MN-7' }];
// First run: immutable revisions created, firstSeen, no predecessor.
{
  const status = await refreshAll({ archiveDir: archive, manifest, fetchFn: stubFetch, metaByDataset: meta });
  assert.equal(status.results.length, 2);
  for (const result of status.results) {
    assert.equal(result.status, 'ok');
    assert.equal(result.changed, true);
  }
  const freqLatest = JSON.parse(readFileSync(join(archive, 'rv63-53db', 'latest.json'), 'utf8'));
  assert.equal(freqLatest.recordCount, 2);
  const freqRevision = JSON.parse(readFileSync(join(freqLatest.revisionDir, 'revision.json'), 'utf8'));
  assert.equal(freqRevision.firstSeen, true);
  assert.equal(freqRevision.prevSha256, null);
  assert.deepEqual(freqRevision.changes.added.sort(), ['1052A', '1052B']);
  assert.equal(revisionDirs(archive, 'rv63-53db').length, 1);
}
// Identical bytes rerun: no false changes, no new revision.
{
  const before = revisionDirs(archive, 'rv63-53db');
  const status = await refreshAll({ archiveDir: archive, manifest, fetchFn: stubFetch, metaByDataset: meta });
  for (const result of status.results) {
    assert.equal(result.status, 'ok');
    assert.equal(result.changed, false);
  }
  assert.deepEqual(revisionDirs(archive, 'rv63-53db'), before, 'identical bytes must not mint a revision');
}
// Modified bytes: one changed, one added, one removed — exact keys.
fixtures.freq = [
  { schedulecode: '1052A', freq_refuse: 'Mon, Wed, Fri' },
  { schedulecode: '1052B', freq_refuse: 'Wed, Sat' },
  { schedulecode: '1052C', freq_refuse: 'Mon, Thu' },
];
{
  const status = await refreshAll({ archiveDir: archive, manifest, fetchFn: stubFetch, metaByDataset: meta });
  const freq = status.results.find((result) => result.datasetId === 'rv63-53db');
  assert.equal(freq.status, 'ok');
  assert.equal(freq.changed, true);
  assert.deepEqual(freq.changes.added, ['1052C']);
  assert.deepEqual(freq.changes.removed, []);
  assert.deepEqual(freq.changes.changed, ['1052B']);
  const zones = status.results.find((result) => result.datasetId === '8ev8-jjxq');
  assert.equal(zones.changed, false, 'untouched dataset reports no change');
  assert.equal(revisionDirs(archive, 'rv63-53db').length, 2);
}
// Network failure: snapshot preserved byte-for-byte, stale reported.
{
  const latestBefore = JSON.parse(readFileSync(join(archive, 'rv63-53db', 'latest.json'), 'utf8'));
  const rawBefore = readFileSync(join(latestBefore.revisionDir, 'raw.json'), 'utf8');
  fixtures.failures.add(freqUrl);
  const status = await refreshAll({ archiveDir: archive, manifest, fetchFn: stubFetch, metaByDataset: meta });
  const freq = status.results.find((result) => result.datasetId === 'rv63-53db');
  assert.equal(freq.status, 'stale');
  assert.ok(freq.error.length > 0);
  assert.equal(freq.preserved.sha256, latestBefore.sha256, 'stale run preserves the last verified digest');
  const latestAfter = JSON.parse(readFileSync(join(archive, 'rv63-53db', 'latest.json'), 'utf8'));
  assert.equal(latestAfter.sha256, latestBefore.sha256);
  assert.equal(readFileSync(join(latestAfter.revisionDir, 'raw.json'), 'utf8'), rawBefore, 'archived bytes untouched by failure');
  assert.equal(revisionDirs(archive, 'rv63-53db').length, 2, 'failure mints no revision');
  const zones = status.results.find((result) => result.datasetId === '8ev8-jjxq');
  assert.equal(zones.status, 'ok', 'healthy datasets still refresh during a partial failure');
  const statusFile = JSON.parse(readFileSync(join(archive, 'status.json'), 'utf8'));
  assert.equal(statusFile.results.find((result) => result.datasetId === 'rv63-53db').status, 'stale');
  fixtures.failures.clear();
}
// Ambiguous identity fails closed: duplicated keys and missing key fields.
await assert.rejects(() => refreshDataset({
  archiveDir: mkdtempSync(join(tmpdir(), 's03d-dup-')),
  query: manifest.queries[0],
  meta: meta['rv63-53db'],
  fetchFn: async (url) => {
    const raw = JSON.stringify([{ schedulecode: '1052A' }, { schedulecode: '1052A' }]);
    return { url, status: 200, headers: fakeHeaders({ 'content-type': 'application/json' }), body: streamBody([Buffer.from(raw, 'utf8')]) };
  },
}), /duplicated record key/);
assert.throws(() => indexByKey([{ schedulecode: '1052A' }], ['nope'], 'probe'), /missing key field/);
assert.deepEqual(diffRecords([{ id: 'a', v: 1 }], [{ id: 'a', v: 1 }], ['id'], 'probe').unchanged, 1);
// A single blip is retried inside the same cycle and does not go stale.
{
  const retryArchive = mkdtempSync(join(tmpdir(), 's03d-retry-'));
  let calls = 0;
  const fetchFn = async (url) => {
    calls += 1;
    if (calls === 1) throw new Error('synthetic blip');
    return stubFetch(url);
  };
  const status = await refreshAll({
    archiveDir: retryArchive,
    manifest: { manifestVersion: manifest.manifestVersion, queries: [manifest.queries[0]] },
    fetchFn,
    metaByDataset: meta,
  });
  assert.equal(status.results[0].status, 'ok');
  assert.equal(calls, 2, 'one failed attempt is retried before the snapshot is kept');
}
// Metadata failure preserves the verified snapshot and reports stale.
{
  const latestBefore = JSON.parse(readFileSync(join(archive, 'rv63-53db', 'latest.json'), 'utf8'));
  let fetched = false;
  const status = await refreshDataset({
    archiveDir: archive,
    query: manifest.queries[0],
    meta: { error: 'metadata fetch failed: HTTP 503' },
    fetchFn: async () => { fetched = true; throw new Error('must not fetch'); },
  });
  assert.equal(fetched, false, 'metadata failure must not retrieve bytes');
  assert.equal(status.status, 'stale');
  assert.match(status.error, /metadata fetch failed/);
  assert.equal(status.preserved.sha256, latestBefore.sha256);
  const latestAfter = JSON.parse(readFileSync(join(archive, 'rv63-53db', 'latest.json'), 'utf8'));
  assert.equal(latestAfter.sha256, latestBefore.sha256);
}
// Archive durability: same timestamp cannot replace bytes, a sealed file is
// not reopened, corruption fails the read, and a partial write is not latest.
{
  const durable = mkdtempSync(join(tmpdir(), 's03d-durable-'));
  const datasetId = 'rv63-53db';
  const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
  const rawA = JSON.stringify([{ schedulecode: '1052A', freq_refuse: 'Mon' }]);
  const rawB = JSON.stringify([{ schedulecode: '1052B', freq_refuse: 'Tue' }]);
  const stamp = '2026-10-30T12:00:00.000Z';
  const revisionFor = (raw) => ({
    revisionVersion: 'life-itself-evidence-revision/1.0.0',
    queryName: 'freq-test', datasetId, retrievedAt: stamp,
    sourceUrl: 'https://data.cityofnewyork.us/resource/rv63-53db.json',
    finalUrl: 'https://data.cityofnewyork.us/resource/rv63-53db.json',
    rowsUpdatedAt: '2026-10-30T10:00:00Z', fullRowCount: 610,
    sampleQuery: 'synthetic sample', sha256: sha256(raw), recordCount: 1,
    prevSha256: null, firstSeen: true,
    changes: { added: ['1052A'], removed: [], changed: [], unchanged: 0 },
  });
  const dirA = await storeRevision(durable, datasetId, rawA, revisionFor(rawA));
  chmodSync(join(dirA, 'raw.json'), 0o444);
  chmodSync(join(dirA, 'revision.json'), 0o444);
  const again = await storeRevision(durable, datasetId, rawA, revisionFor(rawA));
  assert.equal(again, dirA, 'the same bytes republish the sealed directory');
  assert.equal(readFileSync(join(dirA, 'raw.json'), 'utf8'), rawA);
  const dirB = await storeRevision(durable, datasetId, rawB, revisionFor(rawB));
  assert.notEqual(dirB, dirA);
  assert.equal(readFileSync(join(dirA, 'raw.json'), 'utf8'), rawA, 'same timestamp must not replace the first snapshot');
  await assert.rejects(
    () => storeRevision(durable, datasetId, rawB, revisionFor(rawA)),
    /digest does not match/,
  );
  assert.equal(readFileSync(join(dirA, 'raw.json'), 'utf8'), rawA);
  const loaded = await loadLatest(durable, datasetId);
  assert.equal(loaded.sha256, sha256(rawB));
  assert.equal(loaded.records[0].schedulecode, '1052B');
  writeFileSync(join(dirB, 'raw.json'), rawB + ' ');
  await assert.rejects(() => loadLatest(durable, datasetId), /digest/);
  const partial = mkdtempSync(join(tmpdir(), 's03d-partial-'));
  await storeRevision(partial, datasetId, rawA, revisionFor(rawA));
  const latestBefore = readFileSync(join(partial, datasetId, 'latest.json'), 'utf8');
  const staging = join(partial, datasetId, '.staging-dead');
  mkdirSync(staging);
  writeFileSync(join(staging, 'raw.json'), '{"partial":true}');
  const still = await loadLatest(partial, datasetId);
  assert.equal(still.sha256, sha256(rawA), 'an unfinished staging directory is not the latest snapshot');
  assert.equal(readFileSync(join(partial, datasetId, 'latest.json'), 'utf8'), latestBefore);
  const missingSha = 'b'.repeat(64);
  writeFileSync(join(partial, datasetId, 'latest.json'), JSON.stringify({
    revisionDir: join(partial, datasetId, missingSha),
    sha256: missingSha,
    retrievedAt: stamp,
    recordCount: 1,
  }) + '\n');
  await assert.rejects(() => loadLatest(partial, datasetId), /missing/);
  const lied = JSON.parse(latestBefore);
  lied.revisionDir = lied.revisionDir + '-other';
  writeFileSync(join(partial, datasetId, 'latest.json'), JSON.stringify(lied) + '\n');
  await assert.rejects(() => loadLatest(partial, datasetId), /content-addressed/);
}
console.log('PASS evidence refresh — versioned manifests, immutable revisions, exact diffs, stale preservation; identical bytes never mint false changes');
