// S03c read-only demonstration: authenticated retrieval of real NYC Open
// Data records into verified envelopes, plus one real schedule record
// classified and displayed. Live network. Writes artifacts to /tmp only —
// nothing is ingested into the repo, the simulation, or any journal.
// Read-only: no simulation imports beyond the evidence adapter, no world
// mutation, no ecological effects.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { retrieveEvidenceEnvelope } from '../src/nyc-retrieval.js';
import { classifyExternalRecord, describeEvidenceForDisplay } from '../src/external-evidence.js';
const shaOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const stableStringify = (value) => {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
};
const getJson = async (url) => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('metadata fetch failed: HTTP ' + res.status + ' for ' + url);
  return res.json();
};
const out = (name, text) => writeFile('/tmp/s03c-' + name, text).then(() => console.log('wrote /tmp/s03c-' + name));
// 1. Dataset metadata: authoritative timestamps for the pins.
const freqMeta = await getJson('https://data.cityofnewyork.us/api/views/rv63-53db');
const zonesMeta = await getJson('https://data.cityofnewyork.us/api/views/8ev8-jjxq');
const freqRowsUpdatedAt = new Date(freqMeta.rowsUpdatedAt * 1000).toISOString();
const zonesRowsUpdatedAt = new Date(zonesMeta.rowsUpdatedAt * 1000).toISOString();
console.log('rv63-53db:', freqMeta.name, '| rowsUpdatedAt:', freqRowsUpdatedAt);
console.log('8ev8-jjxq:', zonesMeta.name, '| rowsUpdatedAt:', zonesRowsUpdatedAt);
// 2. Live full row counts (never trust a sample count as the total).
const freqCount = await getJson('https://data.cityofnewyork.us/resource/rv63-53db.json?$select=count(*%20)');
const zonesCount = await getJson('https://data.cityofnewyork.us/resource/8ev8-jjxq.json?$select=count(*%20)');
const freqTotal = Number(freqCount[0].count);
const zonesTotal = Number(zonesCount[0].count);
console.log('live totals: frequencies =', freqTotal, '| zones =', zonesTotal);
// 3. Manhattan frequency sample (real published schedule rows + polygons).
const mnDistricts = Array.from({ length: 12 }, (_, i) => "'MN" + String(i + 1).padStart(2, '0') + "'").join(',');
const freqParams = {
  $select: 'district,section,frequency,schedulecode,freq_refuse,multipolygon',
  $where: 'district in(' + mnDistricts + ')',
  $order: 'district,section,frequency',
  $limit: '5000',
};
const { envelope: freqEnvelope, retrieval: freqRetrieval } = await retrieveEvidenceEnvelope({
  datasetId: 'rv63-53db',
  params: freqParams,
  rowsUpdatedAt: freqRowsUpdatedAt,
  fullRowCount: freqTotal,
  sampleQuery: 'district in(MN01..MN12), ordered, with multipolygon',
});
console.log('frequencies envelope: sha256 =', freqEnvelope.sha256, '| records =', freqEnvelope.recordCount, '| bytes =', freqRetrieval.byteLength);
await out('freq-raw.json', freqRetrieval.rawResponse);
// 4. Commercial zones (tabular context: envelope only — zones are service
// areas, not pickup timetables, so no schedule classification applies).
const { envelope: zonesEnvelope, retrieval: zonesRetrieval } = await retrieveEvidenceEnvelope({
  datasetId: '8ev8-jjxq',
  params: { $limit: '50000' },
  rowsUpdatedAt: zonesRowsUpdatedAt,
  fullRowCount: zonesTotal,
  sampleQuery: 'full pull of 8ev8-jjxq ($limit 50000)',
});
console.log('zones envelope: sha256 =', zonesEnvelope.sha256, '| records =', zonesEnvelope.recordCount, '| bytes =', zonesRetrieval.byteLength);
await out('zones-raw.json', zonesRetrieval.rawResponse);
// 5. One real record, fully classified: first frequency-A row in the sample.
const realRecord = freqEnvelope.coveredRecords.find((record) => record.frequency === 'A');
if (!realRecord) throw new Error('demo: no frequency-A record in the Manhattan sample');
const vertexSha256 = shaOf(stableStringify(realRecord.multipolygon));
const schedule = classifyExternalRecord({
  kind: 'published_schedule',
  envelope: freqEnvelope,
  // The exact covered record object — never a reconstructed subset. The
  // adapter ignores non-contract fields (multipolygon) but the record handed
  // to classification must be byte-identical to what was verified.
  record: realRecord,
  geographicKey: { polygonId: realRecord.schedulecode, vertexSha256 },
});
const shown = describeEvidenceForDisplay(schedule);
await out('display.json', JSON.stringify({
  headline: shown.headline,
  caveats: shown.caveats,
  provenance: {
    datasetId: 'rv63-53db',
    sourceUrl: freqRetrieval.requestedUrl,
    retrievedAt: freqRetrieval.retrievedAt,
    rowsUpdatedAt: freqRowsUpdatedAt,
    fullRowCount: freqTotal,
    sampleRecords: freqEnvelope.recordCount,
    envelopeSha256: freqEnvelope.sha256,
    polygonVertexSha256: vertexSha256,
  },
  warnings: [
    'A published timetable is not evidence that any collection occurred.',
    'Residential DSNY collection context only: never assign this schedule to commercial carting pickup.',
    'Byte consistency with the retrieved response is proven; NYC publication of these bytes is attested by origin (https://data.cityofnewyork.us) and timestamp, not by this adapter.',
  ],
}, null, 2));
console.log('---');
console.log(shown.headline);
for (const caveat of shown.caveats) console.log(' *', caveat);
console.log('---');
console.log('DONE: real bytes retrieved, verified, and labeled. Nothing simulated, nothing ingested.');
