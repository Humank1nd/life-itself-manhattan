// Life Itself Manhattan — reproducible world-evidence refresh.
// One on-demand refresh cycle per invocation: read a versioned query
// manifest, retrieve each dataset through the authenticated boundary,
// verify the bytes, diff the covered records against the last archived
// revision, and persist a content-addressed revision. The latest pointer
// is published by rename only after the bytes are sealed, and every read
// recomputes the digest before trusting the archive.
// This module emits no simulation events and mutates no world state. It only
// archives observed bytes and reports what changed between observations.
// Scheduling is deliberately absent: schedulers invoke the runner; the
// runner itself runs exactly one cycle and exits.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { retrieveEvidenceEnvelope } from './nyc-retrieval.js';
export const REFRESH_MANIFEST_VERSION = 'life-itself-evidence-queries/1.0.0';
export const REFRESH_REVISION_VERSION = 'life-itself-evidence-revision/1.0.0';
// One transient blip is retried inside the same on-demand cycle. A cycle
// that still fails reports stale and leaves the last verified snapshot.
export const REFRESH_ATTEMPTS = 3;
const fail = (why) => { throw new Error('evidence-refresh: ' + why); };
const need = (ok, why) => { if (!ok) fail(why); };
const clone = (value) => JSON.parse(JSON.stringify(value));
// Self-consistent canonical form for within-run record identity and hashing.
// Key order never distinguishes records.
const canonicalize = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
};
const shaOfRecord = (record) => createHash('sha256').update(canonicalize(record), 'utf8').digest('hex');
// A manifest pins exactly what may be retrieved: named queries with stable
// keys for record matching. Unknown datasets, missing keys, or unversioned
// manifests are rejected before any network read.
export function validateRefreshManifest(manifest) {
  need(manifest && typeof manifest === 'object', 'refresh manifest required');
  need(manifest.manifestVersion === REFRESH_MANIFEST_VERSION, 'refresh manifest version mismatch, expected ' + REFRESH_MANIFEST_VERSION);
  need(Array.isArray(manifest.queries) && manifest.queries.length > 0, 'refresh manifest must declare at least one query');
  const names = new Set();
  for (const query of manifest.queries) {
    need(query && typeof query.name === 'string' && query.name.length > 0, 'refresh query needs a name');
    need(!names.has(query.name), 'duplicate refresh query name: ' + query.name);
    names.add(query.name);
    need(typeof query.datasetId === 'string' && query.datasetId.length > 0, 'refresh query needs a datasetId: ' + query.name);
    need(query.params && typeof query.params === 'object', 'refresh query needs params: ' + query.name);
    need(Array.isArray(query.recordKey) && query.recordKey.length > 0, 'refresh query needs recordKey fields: ' + query.name);
    for (const field of query.recordKey) need(typeof field === 'string' && field.length > 0, 'refresh recordKey fields must be strings: ' + query.name);
    need(typeof query.sampleQuery === 'string' && query.sampleQuery.length > 0, 'refresh query needs a sampleQuery description: ' + query.name);
  }
  return clone(manifest);
}
const keyOf = (record, keyFields, what) => {
  const parts = keyFields.map((field) => {
    const value = record[field];
    need(typeof value === 'string' || typeof value === 'number', what + ' record is missing key field: ' + field);
    return String(value);
  });
  return parts.join('|');
};
// Index covered records by their stable key. Duplicate keys fail closed: a
// diff over ambiguous identity would fabricate added/removed events.
export function indexByKey(records, keyFields, what) {
  need(Array.isArray(records), what + ' records must be an array');
  const index = new Map();
  for (const record of records) {
    const key = keyOf(record, keyFields, what);
    need(!index.has(key), what + ' has a duplicated record key: ' + key);
    index.set(key, record);
  }
  return index;
}
// Record-level change report between two observations. Added, removed, and
// changed entries describe byte differences only — never simulated events.
export function diffRecords(beforeRecords, afterRecords, keyFields, what) {
  const before = indexByKey(beforeRecords, keyFields, what + ' previous');
  const after = indexByKey(afterRecords, keyFields, what + ' current');
  const added = [];
  const removed = [];
  const changed = [];
  let unchanged = 0;
  for (const [key, afterRecord] of after) {
    if (!before.has(key)) {
      added.push(key);
      continue;
    }
    const beforeHash = shaOfRecord(before.get(key));
    const afterHash = shaOfRecord(afterRecord);
    if (beforeHash === afterHash) unchanged += 1;
    else changed.push({ key, beforeSha256: beforeHash, afterSha256: afterHash });
  }
  for (const key of before.keys()) {
    if (!after.has(key)) removed.push(key);
  }
  return { added: added.sort(), removed: removed.sort(), changed, unchanged };
}
export function buildRevision({ query, retrieval, envelope, previous, changes }) {
  need(query && envelope && retrieval && changes, 'revision needs query, retrieval, envelope, and changes');
  return {
    revisionVersion: REFRESH_REVISION_VERSION,
    queryName: query.name,
    datasetId: query.datasetId,
    sourceUrl: retrieval.requestedUrl,
    finalUrl: retrieval.finalUrl,
    retrievedAt: retrieval.retrievedAt,
    rowsUpdatedAt: query.rowsUpdatedAt || null,
    fullRowCount: query.fullRowCount ?? null,
    sampleQuery: query.sampleQuery,
    sha256: envelope.sha256,
    recordCount: envelope.recordCount,
    prevSha256: previous ? previous.sha256 : null,
    firstSeen: previous === null,
    changes: clone(changes),
  };
}
const latestPath = (archiveDir, datasetId) => join(archiveDir, datasetId, 'latest.json');
const sha256OfBuffer = (buf) => createHash('sha256').update(buf).digest('hex');
const contentDir = (archiveDir, datasetId, digest) => join(archiveDir, datasetId, digest);
// A missing latest pointer is an empty archive. A present pointer that does
// not hash back to its bytes is corruption, never a fresh baseline.
export async function loadLatest(archiveDir, datasetId) {
  let pointerText = null;
  try {
    pointerText = await readFile(latestPath(archiveDir, datasetId), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    fail('cannot load latest snapshot for ' + datasetId + ': ' + (err && err.message ? err.message : String(err)));
  }
  let pointer = null;
  try { pointer = JSON.parse(pointerText); } catch { pointer = null; }
  need(pointer && typeof pointer.revisionDir === 'string' && /^[a-f0-9]{64}$/.test(pointer.sha256 || ''), 'latest pointer is corrupt for ' + datasetId);
  const expectedDir = contentDir(archiveDir, datasetId, pointer.sha256);
  need(pointer.revisionDir === expectedDir, 'latest pointer is not the content-addressed revision for ' + datasetId);
  let rawBuf = null;
  try {
    rawBuf = await readFile(join(expectedDir, 'raw.json'));
  } catch (err) {
    fail('archived raw response is missing for ' + datasetId + ': ' + (err && err.message ? err.message : String(err)));
  }
  const digest = sha256OfBuffer(rawBuf);
  need(digest === pointer.sha256, 'archived bytes do not match the stored digest for ' + datasetId);
  let sealed = null;
  try { sealed = JSON.parse(await readFile(join(expectedDir, 'revision.json'), 'utf8')); } catch { sealed = null; }
  need(sealed && sealed.sha256 === pointer.sha256, 'revision manifest digest does not match the pointer for ' + datasetId);
  let records = null;
  try { records = JSON.parse(rawBuf.toString('utf8')); } catch { records = null; }
  need(Array.isArray(records), 'archived raw response is not a record array for ' + datasetId);
  return { ...pointer, records };
}
async function publishLatest(archiveDir, datasetId, pointer) {
  const root = join(archiveDir, datasetId);
  await mkdir(root, { recursive: true });
  const tmp = join(root, '.latest-' + randomBytes(8).toString('hex') + '.tmp');
  await writeFile(tmp, JSON.stringify(pointer, null, 2) + '\n', { flag: 'wx' });
  await rename(tmp, latestPath(archiveDir, datasetId));
}
// Content-addressed and exclusive. The directory name is the digest of the
// raw bytes. Files are created with wx inside a private staging directory
// and renamed into place only when both are complete. A second write of the
// same bytes does not open the sealed files. A different body under the same
// claimed digest is rejected. The latest pointer is replaced by rename last,
// so a crash leaves either the previous pointer or a complete revision.
export async function storeRevision(archiveDir, datasetId, rawResponse, revision) {
  need(typeof rawResponse === 'string' && rawResponse.length > 0, 'revision needs the raw response');
  need(revision && typeof revision === 'object', 'revision manifest required');
  const rawBuf = Buffer.from(rawResponse, 'utf8');
  const digest = sha256OfBuffer(rawBuf);
  need(revision.sha256 === digest, 'revision digest does not match the raw bytes');
  const root = join(archiveDir, datasetId);
  await mkdir(root, { recursive: true });
  const finalDir = contentDir(archiveDir, datasetId, digest);
  let sealedRaw = null;
  try {
    sealedRaw = await readFile(join(finalDir, 'raw.json'));
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  if (sealedRaw) {
    need(sha256OfBuffer(sealedRaw) === digest, 'existing revision bytes do not match its content address');
  } else {
    const staging = join(root, '.staging-' + digest + '-' + randomBytes(6).toString('hex'));
    await mkdir(staging);
    try {
      await writeFile(join(staging, 'raw.json'), rawBuf, { flag: 'wx' });
      await writeFile(join(staging, 'revision.json'), JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
      try {
        await rename(staging, finalDir);
      } catch (err) {
        if (!(err && (err.code === 'EEXIST' || err.code === 'ENOTEMPTY'))) throw err;
        const raced = await readFile(join(finalDir, 'raw.json'));
        need(sha256OfBuffer(raced) === digest, 'existing revision bytes do not match its content address');
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  let sealed = null;
  try { sealed = JSON.parse(await readFile(join(finalDir, 'revision.json'), 'utf8')); } catch { sealed = null; }
  need(sealed && sealed.sha256 === digest, 'revision manifest digest does not match the stored bytes');
  await publishLatest(archiveDir, datasetId, {
    revisionDir: finalDir,
    sha256: digest,
    retrievedAt: sealed.retrievedAt,
    recordCount: sealed.recordCount,
  });
  return finalDir;
}
// One dataset refresh: retrieve, verify, diff, and persist — or, on any
// retrieval failure, preserve the last verified snapshot untouched and report
// stale. The archive is never rewritten on failure; staleness is a status,
// not a revision.
export async function refreshDataset({ archiveDir, query, meta, fetchFn }) {
  need(archiveDir && typeof archiveDir === 'string', 'archive directory required');
  const previous = await loadLatest(archiveDir, query.datasetId);
  const preserved = previous ? { sha256: previous.sha256, retrievedAt: previous.retrievedAt, recordCount: previous.recordCount } : null;
  // Metadata failure is staleness, not a crash: the last snapshot stays put.
  if (!meta || meta.error || typeof meta.rowsUpdatedAt !== 'string' || !Number.isInteger(meta.fullRowCount)) {
    return {
      queryName: query.name,
      datasetId: query.datasetId,
      status: 'stale',
      error: meta && meta.error ? meta.error : 'live metadata unavailable',
      preserved,
    };
  }
  let envelope = null;
  let retrieval = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
    try {
      const result = await retrieveEvidenceEnvelope({
        datasetId: query.datasetId,
        params: query.params,
        fetchFn,
        rowsUpdatedAt: meta.rowsUpdatedAt,
        fullRowCount: meta.fullRowCount,
        sampleQuery: query.sampleQuery,
      });
      envelope = result.envelope;
      retrieval = result.retrieval;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    return {
      queryName: query.name,
      datasetId: query.datasetId,
      status: 'stale',
      error: lastErr && lastErr.message ? lastErr.message : String(lastErr),
      preserved,
    };
  }
  const current = envelope.coveredRecords;
  // Duplicate or missing keys refuse the revision before any archive write.
  // That is a contract failure, not a stale source.
  const indexed = indexByKey(current, query.recordKey, query.name);
  if (previous !== null && previous.sha256 === envelope.sha256) {
    return {
      queryName: query.name,
      datasetId: query.datasetId,
      status: 'ok',
      changed: false,
      sha256: envelope.sha256,
      recordCount: envelope.recordCount,
      retrievedAt: retrieval.retrievedAt,
    };
  }
  const changes = previous === null
    ? { added: [...indexed.keys()].sort(), removed: [], changed: [], unchanged: 0 }
    : diffRecords(previous.records, current, query.recordKey, query.name);
  const revision = buildRevision({
    query: { ...query, rowsUpdatedAt: meta.rowsUpdatedAt, fullRowCount: meta.fullRowCount },
    retrieval,
    envelope,
    previous,
    changes,
  });
  const dir = await storeRevision(archiveDir, query.datasetId, retrieval.rawResponse, revision);
  return {
    queryName: query.name,
    datasetId: query.datasetId,
    status: 'ok',
    changed: true,
    sha256: envelope.sha256,
    recordCount: envelope.recordCount,
    retrievedAt: retrieval.retrievedAt,
    revisionDir: dir,
    changes: { added: changes.added, removed: changes.removed, changed: changes.changed.map((entry) => entry.key), unchanged: changes.unchanged },
  };
}
// One full cycle over the manifest. Writes status.json last so a partial run
// never masquerades as a complete one.
export async function refreshAll({ archiveDir, manifest, fetchFn, metaByDataset }) {
  const queries = validateRefreshManifest(manifest).queries;
  need(metaByDataset && typeof metaByDataset === 'object', 'live dataset metadata required');
  const results = [];
  for (const query of queries) {
    const meta = metaByDataset[query.datasetId];
    need(meta, 'live metadata missing for dataset: ' + query.datasetId);
    results.push(await refreshDataset({ archiveDir, query, meta, fetchFn }));
  }
  const status = { updatedAt: new Date().toISOString(), results };
  await mkdir(archiveDir, { recursive: true });
  await writeFile(join(archiveDir, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  return status;
}
