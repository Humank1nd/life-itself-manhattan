// Gate for the authenticated NYC retrieval boundary: approved HTTPS origins
// (full origin including port), manual redirect validation, bounded streaming
// reads with an armed-through-completion timeout, and binary-first digesting
// — all against controlled stub responses. No live network in this gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  APPROVED_EVIDENCE_HOSTS,
  assertApprovedUrl,
  buildEvidenceUrl,
  retrieveEvidenceEnvelope,
  retrieveRawResponse,
} from '../src/nyc-retrieval.js';
import { describeEvidenceForDisplay, validatePublishedSchedule } from '../src/external-evidence.js';
const HEX = 'a'.repeat(64);
const BASE = 'https://data.cityofnewyork.us/resource/rv63-53db.json';
const fakeHeaders = (map) => ({ get: (name) => Object.prototype.hasOwnProperty.call(map, String(name).toLowerCase()) ? map[String(name).toLowerCase()] : null });
const bytesOf = (text) => Buffer.from(text, 'utf8');
// A stub body is a chunk queue with an observable read count, so the gate can
// prove the retriever stopped early instead of consuming the whole stream.
const streamBody = (chunks, onRead) => {
  const queue = chunks.slice();
  return {
    getReader: () => ({
      read: async () => {
        if (onRead) onRead();
        const value = queue.shift();
        return value === undefined ? { done: true, value: undefined } : { done: false, value };
      },
      cancel: async () => {},
    }),
  };
};
const jsonRoute = (records, extraHeaders = {}) => {
  const raw = JSON.stringify(records);
  return {
    status: 200,
    headers: fakeHeaders({ 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(raw, 'utf8')), ...extraHeaders }),
    body: streamBody([bytesOf(raw)]),
  };
};
const routeStub = (routes, calls) => async (url) => {
  calls.push(url);
  if (!Object.prototype.hasOwnProperty.call(routes, url)) throw new Error('unexpected fetch: ' + url);
  return { url, ...routes[url] };
};
const scheduleRecordA = {
  district: 'MN05', section: 'MN052', frequency: 'A', schedulecode: '1052A', freq_refuse: 'Mon, Wed, Fri',
};
const scheduleRecordB = {
  district: 'MN05', section: 'MN052', frequency: 'B', schedulecode: '1052B', freq_refuse: 'Tue, Thu, Sat',
};
// 1. Happy path: controlled bytes flow into a verified envelope and classify.
{
  const calls = [];
  const { envelope, retrieval } = await retrieveEvidenceEnvelope({
    datasetId: 'rv63-53db',
    params: { $select: 'district,section', $limit: '2' },
    fetchFn: routeStub({ [BASE + '?%24select=district%2Csection&%24limit=2']: jsonRoute([scheduleRecordA, scheduleRecordB]) }, calls),
    fullRowCount: 610,
    sampleQuery: 'synthetic gate probe',
  });
  assert.ok(retrieval.requestedUrl.includes('rv63-53db.json'));
  assert.ok(retrieval.requestedUrl.includes('select'));
  assert.equal(retrieval.redirected, false);
  assert.equal(retrieval.redirectHops, 0);
  assert.equal(envelope.recordCount, 2);
  const schedule = validatePublishedSchedule({
    envelope,
    record: scheduleRecordA,
    geographicKey: { polygonId: '1052A', vertexSha256: HEX },
  });
  const shown = describeEvidenceForDisplay(schedule);
  assert.ok(shown.headline.includes('1052A') && shown.headline.includes('Mon, Wed, Fri'));
}
// 2. Origin gate: wrong host, plain http, and non-default port all rejected
// before any request logic — and an unapproved URL is never fetched.
assert.throws(() => assertApprovedUrl('https://evil.example/resource/rv63-53db.json'), /not approved/);
assert.throws(() => assertApprovedUrl('http://data.cityofnewyork.us/resource/rv63-53db.json'), /https/);
assert.throws(() => assertApprovedUrl('https://data.cityofnewyork.us:8443/resource/rv63-53db.json'), /port is not approved/);
{
  const calls = [];
  await assert.rejects(() => retrieveRawResponse({
    url: 'https://evil.example/x',
    fetchFn: routeStub({}, calls),
  }), /not approved/);
  assert.deepEqual(calls, [], 'no request may leave for an unapproved origin');
}
// 3. Manual redirects: an evil intermediate hop is never fetched; a same-host
// hop is followed and flagged; chains and locationless redirects fail.
{
  const calls = [];
  await assert.rejects(() => retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({ [BASE]: { status: 302, headers: fakeHeaders({ location: 'https://evil.example/stolen.json' }) } }, calls),
  }), /not approved/);
  assert.deepEqual(calls, [BASE], 'the evil destination must never be fetched');
}
{
  const calls = [];
  const target = BASE + '?x=1';
  const retrieval = await retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({
      [BASE]: { status: 302, headers: fakeHeaders({ location: target }) },
      [target]: jsonRoute([scheduleRecordA]),
    }, calls),
  });
  assert.equal(retrieval.redirected, true);
  assert.equal(retrieval.redirectHops, 1);
  assert.equal(retrieval.finalUrl, target);
  assert.deepEqual(calls, [BASE, target]);
}
{
  const hopping = {};
  let hop = BASE;
  for (let i = 0; i < 6; i += 1) {
    const next = BASE + '?hop=' + i;
    hopping[hop] = { status: 302, headers: fakeHeaders({ location: next }) };
    hop = next;
  }
  await assert.rejects(() => retrieveRawResponse({ url: BASE, fetchFn: routeStub(hopping, []) }), /redirected too many times/);
}
await assert.rejects(() => retrieveRawResponse({
  url: BASE,
  fetchFn: routeStub({ [BASE]: { status: 301, headers: fakeHeaders({}) } }, []),
}), /without a location/);
// 4. HTTP error statuses fail closed.
await assert.rejects(() => retrieveRawResponse({
  url: BASE,
  fetchFn: routeStub({ [BASE]: { status: 500, headers: fakeHeaders({ 'content-type': 'application/json' }), body: streamBody([]) } }, []),
}), /HTTP 500/);
await assert.rejects(() => retrieveRawResponse({
  url: BASE,
  fetchFn: routeStub({ [BASE]: { status: 404, headers: fakeHeaders({ 'content-type': 'application/json' }), body: streamBody([]) } }, []),
}), /HTTP 404/);
// 5. Unexpected content type rejected before any byte is consumed.
{
  let reads = 0;
  await assert.rejects(() => retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({ [BASE]: { status: 200, headers: fakeHeaders({ 'content-type': 'text/html' }), body: streamBody([bytesOf('<html></html>')], () => { reads += 1; }) } }, []),
  }), /content type/);
  assert.equal(reads, 0, 'rejected content type must not start the body');
}
// 6. Streaming cap: an oversized body is cut off mid-stream, not read fully.
{
  let reads = 0;
  const chunks = Array.from({ length: 10 }, () => Buffer.alloc(100, 0x41));
  await assert.rejects(() => retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({
      [BASE]: {
        status: 200,
        headers: fakeHeaders({ 'content-type': 'application/json', 'content-length': '1000' }),
        body: streamBody(chunks, () => { reads += 1; }),
      },
    }, []),
    maxBytes: 250,
  }), /exceeds size cap/);
  assert.ok(reads <= 4, 'reading must stop at the cap instead of consuming the stream, got ' + reads + ' reads');
}
// 7. Truncated and stalled bodies fail with the timeout armed throughout.
await assert.rejects(() => retrieveRawResponse({
  url: BASE,
  fetchFn: routeStub({
    [BASE]: {
      status: 200,
      headers: fakeHeaders({ 'content-type': 'application/json' }),
      body: {
        getReader: () => {
          let yielded = false;
          return {
            read: async () => {
              if (!yielded) { yielded = true; return { done: false, value: bytesOf('[{"half":') }; }
              throw new Error('socket hang up');
            },
            cancel: async () => {},
          };
        },
      },
    },
  }, []),
}), /could not be completed/);
{
  const stalled = async (url, opts) => ({
    url,
    status: 200,
    headers: fakeHeaders({ 'content-type': 'application/json' }),
    body: {
      getReader: () => ({
        read: () => new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('The operation was aborted')), { once: true });
        }),
        cancel: async () => {},
      }),
    },
  });
  const started = Date.now();
  await assert.rejects(() => retrieveRawResponse({ url: BASE, fetchFn: stalled, timeoutMs: 100 }), /could not be completed/);
  assert.ok(Date.now() - started < 5000, 'a stalled body must die with the timeout instead of hanging');
}
// 8. Binary-first digest: multibyte text hashes over the wire bytes, and
// malformed UTF-8 fails strictly instead of hashing a repaired string.
{
  const records = [{ ...scheduleRecordA, note: 'café — naïve ☃' }];
  const raw = JSON.stringify(records);
  const expected = createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex');
  const retrieval = await retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({ [BASE]: jsonRoute(records) }, []),
  });
  assert.equal(retrieval.sha256, expected, 'digest must cover the original bytes, not a re-encoding');
}
{
  const malformed = Buffer.concat([Buffer.from('[{"x":"', 'utf8'), Buffer.from([0xff, 0xfe]), Buffer.from('"}]', 'utf8')]);
  await assert.rejects(() => retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({
      [BASE]: {
        status: 200,
        headers: fakeHeaders({ 'content-type': 'application/json', 'content-length': String(malformed.length) }),
        body: streamBody([malformed]),
      },
    }, []),
  }), /strictly decodable UTF-8/);
}
// 9. Corrupted bytes pass the byte layer (bytes are bytes) and die at parsing.
{
  const retrieval = await retrieveRawResponse({
    url: BASE,
    fetchFn: routeStub({ [BASE]: { status: 200, headers: fakeHeaders({ 'content-type': 'application/json' }), body: streamBody([bytesOf('not json{{{')]) } }, []),
  });
  assert.ok(retrieval.byteLength > 0);
  await assert.rejects(() => retrieveEvidenceEnvelope({
    datasetId: 'rv63-53db',
    fetchFn: routeStub({ [BASE]: { status: 200, headers: fakeHeaders({ 'content-type': 'application/json' }), body: streamBody([bytesOf('not json{{{')]) } }, []),
  }), /JSON array/);
}
// 10. Substituted bytes after retrieval fail verification.
{
  const { envelope, retrieval } = await retrieveEvidenceEnvelope({
    datasetId: 'rv63-53db',
    fetchFn: routeStub({ [BASE]: jsonRoute([scheduleRecordA]) }, []),
  });
  const tampered = retrieval.rawResponse.replace('1052A', '1052B');
  const { verifyRetrievedEnvelope } = await import('../src/external-evidence.js');
  assert.throws(() => verifyRetrievedEnvelope(envelope, tampered), /mismatch/);
}
// 11. Network failures surface with the requested URL attached.
await assert.rejects(() => retrieveRawResponse({
  url: BASE,
  fetchFn: async () => { throw new Error('fetch failed'); },
}), /request failed.*rv63-53db/);
// 12. Malformed dataset ids never become URLs.
assert.throws(() => buildEvidenceUrl('not-a-dataset'), /dataset id required/);
assert.deepEqual(APPROVED_EVIDENCE_HOSTS, ['data.cityofnewyork.us']);
console.log('PASS nyc retrieval — manual redirects, bounded streaming with armed timeout, binary-first digests; hostile and broken transports all fail closed');
