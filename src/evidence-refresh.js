// Life Itself Manhattan — reproducible world-evidence refresh.
// One on-demand refresh cycle per invocation: read a versioned query
// manifest, retrieve each dataset through the authenticated boundary,
// verify the bytes, diff the covered records against the last archived
// revision, and persist an immutable revision plus a latest pointer.
// This module emits no simulation events and mutates no world state. It only
// archives observed bytes and reports what changed between observations.
// Scheduling is deliberately absent: schedulers invoke the runner; the
// runner itself runs exactly one cycle and exits.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
const sanitizeStamp = (iso) => iso.replace(/[:.]/g, '-');
const latestPath = (archiveDir, datasetId) => join(archiveDir, datasetId, 'latest.json');
const revisionDir = (archiveDir, datasetId, retrievedAt) => join(archiveDir, datasetId, sanitizeStamp(retrievedAt));
export async function loadLatest(archiveDir, datasetId) {
  try {
    const pointer = JSON.parse(await readFile(latestPath(archiveDir, datasetId), 'utf8'));
    need(pointer && typeof pointer.revisionDir === 'string' && typeof pointer.sha256 === 'string', 'latest pointer is corrupt for ' + datasetId);
    const raw = await readFile(join(pointer.revisionDir, 'raw.json'), 'utf8');
    const records = JSON.parse(raw);
    need(Array.isArray(records), 'archived raw response is not a record array for ' + datasetId);
    return { ...pointer, records };
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    fail('cannot load latest snapshot for ' + datasetId + ': ' + (err && err.message ? err.message : String(err)));
  }
}
export async function storeRevision(archiveDir, datasetId, rawResponse, revision) {
  const dir = revisionDir(archiveDir, datasetId, revision.retrievedAt);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'raw.json'), rawResponse);
  await writeFile(join(dir, 'revision.json'), JSON.stringify(revision, null, 2) + '\n');
  await writeFile(latestPath(archiveDir, datasetId), JSON.stringify({ revisionDir: dir, sha256: revision.sha256, retrievedAt: revision.retrievedAt, recordCount: revision.recordCount }, null, 2) + '\n');
  return dir;
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
