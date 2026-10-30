// Life Itself Manhattan — authenticated NYC Open Data retrieval boundary.
// Fetches verbatim raw response bytes from approved data.cityofnewyork.us
// HTTPS endpoints, records retrieval provenance, and hands the ORIGINAL bytes
// to the external-evidence envelope API. Never re-serializes parsed records:
// the digest must cover the wire bytes, not a reconstruction.
//
// What this proves: the bytes came from an approved HTTPS origin, complete
// and untruncated, at a recorded time. What it does NOT prove: that any
// individual assertion inside the dataset is true. Origin authentication is
// not truth certification.
// Transport discipline, verified by gate: redirects are followed manually
// with each destination validated BEFORE the request goes out (an evil hop
// is never fetched); the body is read as a bounded byte stream with the
// timeout armed through completion; the digest is hashed over the collected
// binary bytes and the text is decoded strictly for the JSON adapter.
// This module performs network reads by design (it IS the retrieval
// boundary) but has no simulation imports and performs no world mutation.
import { createHash } from 'node:crypto';
import {
  DSNY_COMMERCIAL_ZONES_DATASET,
  DSNY_FREQUENCY_DATASET,
  validateRetrievedEnvelope,
  verifyRetrievedEnvelope,
} from './external-evidence.js';
export { DSNY_COMMERCIAL_ZONES_DATASET, DSNY_FREQUENCY_DATASET };
export const APPROVED_EVIDENCE_HOSTS = ['data.cityofnewyork.us'];
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 30000;
export const MAX_REDIRECTS = 5;
const SOCRATA_DATASET_ID = /^[a-z0-9]{4}-[a-z0-9]{4}$/;
const fail = (why) => { throw new Error('nyc-retrieval: ' + why); };
const need = (ok, why) => { if (!ok) fail(why); };
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
// The origin gate: https scheme plus an allowlisted host AND default port,
// applied to the requested URL, to every redirect destination before it is
// fetched, and to the final URL. An explicit non-default port is rejected:
// the approved origin is the full triple, not the hostname alone.
export function assertApprovedUrl(urlString) {
  let url = null;
  try { url = new URL(urlString); } catch { url = null; }
  need(url !== null, 'evidence URL is not parseable');
  need(url.protocol === 'https:', 'evidence origin must use https, got: ' + url.protocol);
  need(APPROVED_EVIDENCE_HOSTS.includes(url.hostname.toLowerCase()), 'evidence host is not approved: ' + url.hostname);
  need(url.port === '', 'evidence origin port is not approved: ' + url.host);
  return url.toString();
}
export function buildEvidenceUrl(datasetId, params = {}) {
  need(SOCRATA_DATASET_ID.test(datasetId || ''), 'dataset id required, e.g. rv63-53db');
  const url = new URL('https://data.cityofnewyork.us/resource/' + datasetId + '.json');
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  return assertApprovedUrl(url.toString());
}
// Fetches one response and returns its verbatim bytes plus provenance.
// fetchFn is injectable so regression tests can use controlled responses;
// production passes the global fetch. Redirects are followed manually so no
// request ever leaves for an unvalidated destination; the body is consumed as
// a bounded stream with the timeout armed until the last byte; the digest
// covers the collected binary bytes (never a decode/re-encode round trip).
// Every integrity property checked here fails closed.
export async function retrieveRawResponse({ url, fetchFn = fetch, maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const requestedUrl = assertApprovedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  try {
    let currentUrl = requestedUrl;
    let res = null;
    let hops = 0;
    for (;;) {
      try {
        res = await fetchFn(currentUrl, { signal, redirect: 'manual', headers: { Accept: 'application/json' } });
      } catch (err) {
        fail('request failed for ' + currentUrl + ': ' + (err && err.message ? err.message : String(err)));
      }
      need(res && typeof res === 'object', 'evidence endpoint returned no response object');
      if (res.status >= 300 && res.status < 400) {
        need(hops < MAX_REDIRECTS, 'evidence endpoint redirected too many times');
        const location = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
        need(typeof location === 'string' && location.length > 0, 'evidence endpoint redirected without a location');
        let next = null;
        try { next = new URL(location, currentUrl).toString(); } catch { next = null; }
        need(next !== null, 'evidence redirect location is not parseable');
        assertApprovedUrl(next);
        try { if (res.body && typeof res.body.cancel === 'function') await res.body.cancel(); } catch {}
        hops += 1;
        currentUrl = next;
        continue;
      }
      const finalUrl = currentUrl;
      need(Number.isInteger(res.status) && res.status >= 200 && res.status < 300, 'evidence endpoint returned HTTP ' + res.status);
      const headerGet = res.headers && typeof res.headers.get === 'function' ? (name) => res.headers.get(name) : () => null;
      const contentType = headerGet('content-type') || '';
      need(contentType.toLowerCase().includes('application/json'), 'evidence endpoint returned unexpected content type: ' + contentType);
      need(res.body && typeof res.body.getReader === 'function', 'evidence response has no readable body');
      const reader = res.body.getReader();
      const readChunk = async () => {
        try {
          return await reader.read();
        } catch (err) {
          fail('evidence response body could not be completed: ' + (err && err.message ? err.message : String(err)));
        }
      };
      const chunks = [];
      let received = 0;
      let oversize = false;
      for (;;) {
        const { done, value } = await readChunk();
        if (done) break;
        need(value instanceof Uint8Array, 'evidence response yielded a non-byte chunk');
        received += value.byteLength;
        if (received > maxBytes) { oversize = true; break; }
        chunks.push(value);
      }
      try { await reader.cancel(); } catch {}
      need(oversize === false, 'evidence response exceeds size cap: more than ' + maxBytes + ' bytes');
      const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
      const byteLength = bytes.length;
      const declaredLength = headerGet('content-length');
      if (declaredLength !== null && declaredLength !== '' && Number.isFinite(Number(declaredLength)) && Number(declaredLength) !== byteLength) {
        fail('evidence response incomplete: content-length ' + declaredLength + ' bytes but received ' + byteLength + ' bytes');
      }
      let rawResponse = null;
      try {
        rawResponse = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        fail('evidence response is not strictly decodable UTF-8');
      }
      return {
        requestedUrl,
        finalUrl,
        redirected: hops > 0,
        redirectHops: hops,
        statusCode: res.status,
        contentType,
        byteLength,
        retrievedAt: new Date().toISOString(),
        sha256: sha256Hex(bytes),
        rawResponse,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
// Full chain for one dataset query: approved HTTPS origin -> verbatim bytes
// -> declared digest (computed here, at the trusted boundary) -> envelope
// creation (adapter recomputes and cross-checks) -> verification against the
// held bytes. Returns the verified envelope plus the retrieval provenance.
export async function retrieveEvidenceEnvelope({ datasetId, params = {}, fetchFn = fetch, maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS, rowsUpdatedAt = null, fullRowCount = null, sampleQuery = null }) {
  const requestedUrl = buildEvidenceUrl(datasetId, params);
  const retrieval = await retrieveRawResponse({ url: requestedUrl, fetchFn, maxBytes, timeoutMs });
  const envelope = validateRetrievedEnvelope({
    datasetId,
    retrievedAt: retrieval.retrievedAt,
    sourceUrl: requestedUrl,
    rowsUpdatedAt,
    fullRowCount,
    sampleQuery,
    rawResponse: retrieval.rawResponse,
    declaredSha256: retrieval.sha256,
  });
  const verified = verifyRetrievedEnvelope(envelope, retrieval.rawResponse);
  return { envelope: verified, retrieval };
}
