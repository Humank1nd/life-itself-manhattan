// Gate for the read-only external-evidence adapter: pinned NYC records are
// validated and labeled as context only. Nothing here may reconcile into the
// world, create food, empty containers, schedule pickups, or move rats.
// S03b-01 hardening: complete pins, coherent geo keys, declared-vs-verified
// digests, provenance-bound occurrences, re-validating display.
// S03b-02 hardening: verified envelopes cover exact records (membership
// proofs), verification state is module-private (no forgeable boolean).
// Final binding condition: the digest is hashed in-module from the verbatim
// raw response, and covered records are parsed from those same bytes — so a
// digest of A can never authorize record set B.
// Trusted boundary: digests are computed here from the retrieved bytes with
// node:crypto. A matching digest supports byte consistency; it cannot
// independently establish source publication.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DSNY_COMMERCIAL_ZONES_DATASET,
  DSNY_FREQUENCY_DATASET,
  EVIDENCE_CLASSES,
  EXTERNAL_EVIDENCE_CONTRACT,
  classifyExternalRecord,
  describeEvidenceForDisplay,
  pinDataset,
  validateEstimatedQuantity,
  validatePublishedSchedule,
  validateRetrievedEnvelope,
  validateVerifiedOccurrence,
  verifyRetrievedEnvelope,
} from '../src/external-evidence.js';
const shaOf = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const HEX = 'a'.repeat(64);
// Isolation surface: the only permitted import is the node:crypto digest
// primitive that binds digests to bytes. No simulation modules, no network,
// no filesystem.
const sourceText = readFileSync(new URL('../src/external-evidence.js', import.meta.url), 'utf8');
const importSpecifiers = [...sourceText.matchAll(/^import\s+[^;]+?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
assert.ok(importSpecifiers.every((specifier) => specifier.startsWith('node:')), 'adapter may only import node builtins, never simulation modules');
assert.ok(importSpecifiers.includes('node:crypto'), 'adapter hashes raw responses with the node:crypto digest primitive');
assert.equal(/fetch\s*\(/.test(sourceText), false, 'adapter must not read the network');
assert.equal(/reconcileReport|attestReport|verifyReportHash|tickPatch/.test(sourceText), false, 'adapter must not touch reconciliation');
assert.deepEqual(EVIDENCE_CLASSES, ['published_schedule', 'verified_occurrence', 'estimated_quantity']);
assert.equal(DSNY_FREQUENCY_DATASET, 'rv63-53db');
assert.equal(DSNY_COMMERCIAL_ZONES_DATASET, '8ev8-jjxq');
// Complete pins: id alone, or id without timestamp/source, is rejected.
assert.throws(() => pinDataset({ datasetId: 'rv63-53db' }), /retrieval timestamp/);
assert.throws(() => pinDataset({ datasetId: 'rv63-53db', retrievedAt: '2026-10-30T10:00:00Z' }), /sourceUrl/);
const frequencyPin = pinDataset({
  datasetId: 'rv63-53db',
  retrievedAt: '2026-10-30T10:00:00Z',
  sourceUrl: 'https://data.cityofnewyork.us/resource/rv63-53db.json',
  fullRowCount: 610,
});
assert.equal(frequencyPin.fullRowCount, 610);
// Retrieval envelope: the digest is hashed in-module from the verbatim raw
// response, and the covered records are parsed from those same bytes.
const scheduleRecordA = {
  district: 'MN05', section: 'MN052', frequency: 'A', schedulecode: '1052A', freq_refuse: 'Mon, Wed, Fri',
};
const scheduleRecordB = {
  district: 'MN05', section: 'MN052', frequency: 'B', schedulecode: '1052B', freq_refuse: 'Tue, Thu, Sat',
};
const carried = [scheduleRecordA, scheduleRecordB];
const rawCarried = JSON.stringify(carried);
const sampleQuery = "district in('MN05') $select=district,section,frequency,schedulecode,freq_refuse";
const envelopeArgs = {
  datasetId: 'rv63-53db',
  retrievedAt: '2026-10-30T10:00:00Z',
  sourceUrl: 'https://data.cityofnewyork.us/resource/rv63-53db.json',
  fullRowCount: 610,
  sampleQuery,
  rawResponse: rawCarried,
  declaredSha256: shaOf(rawCarried),
};
const envelope = validateRetrievedEnvelope(envelopeArgs);
assert.equal(envelope.sha256, shaOf(rawCarried), 'the envelope digest is the hash of the retained bytes');
assert.equal(envelope.recordCount, 2, 'envelope carries the sample count, not the dataset total');
assert.equal(envelope.coveredRecords.length, 2, 'covered records are parsed from the verified bytes');
assert.throws(() => classifyExternalRecord({
  kind: 'published_schedule',
  envelope,
  record: scheduleRecordA,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
}), /unverified envelope/);
assert.throws(() => verifyRetrievedEnvelope(envelope, JSON.stringify([scheduleRecordA])), /mismatch/, 'presenting different bytes fails even with a valid digest shape');
assert.throws(() => validateRetrievedEnvelope({ ...envelopeArgs, rawResponse: 'not json' }), /mismatch/, 'undeclared bytes fail before parsing');
assert.throws(() => validateRetrievedEnvelope({
  ...envelopeArgs, rawResponse: rawCarried, declaredSha256: undefined,
}), /declared sha256/);
assert.throws(() => validateRetrievedEnvelope({
  ...envelopeArgs, fullRowCount: 610, sampleQuery: undefined,
}), /sampleQuery/, 'a sample without a query is ambiguous');
assert.throws(() => validateRetrievedEnvelope({
  ...envelopeArgs, fullRowCount: 1,
}), /full row count/, 'an envelope cannot carry more than the dataset total');
// Final binding condition — digest of A plus record set B must fail, even
// though B alone is a perfectly valid schedule record.
const rawA = JSON.stringify([scheduleRecordA]);
const rawB = JSON.stringify([scheduleRecordB]);
assert.throws(() => validateRetrievedEnvelope({ ...envelopeArgs, rawResponse: rawB, declaredSha256: shaOf(rawA) }),
  /not computed from this raw response/, 'a digest of different bytes authorizes nothing');
const verified = verifyRetrievedEnvelope(envelope, rawCarried);
assert.equal(verified, envelope, 'verification admits the envelope itself; no boolean flag is issued');
// Valid Manhattan timetable: coherent district/section/frequency/schedulecode,
// polygon pinned by stable schedulecode, commercial pickup out of scope.
const schedule = classifyExternalRecord({
  kind: 'published_schedule',
  envelope: verified,
  record: scheduleRecordA,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
});
assert.equal(schedule.contract, EXTERNAL_EVIDENCE_CONTRACT);
assert.deepEqual(schedule.recordKey, { district: 'MN05', section: 'MN052', scheduleCode: '1052A' });
assert.deepEqual(schedule.scheduleDays, ['Mon', 'Wed', 'Fri']);
assert.deepEqual(schedule.asserts, { occurrence: false, quantity: false });
assert.deepEqual(schedule.notApplicableTo, ['commercial-carting-pickup']);
assert.equal(schedule.outsidePolygon, 'UNZONED');
const shownSchedule = describeEvidenceForDisplay(schedule);
assert.ok(shownSchedule.headline.includes('1052A') && shownSchedule.headline.includes('Mon, Wed, Fri'));
assert.ok(shownSchedule.caveats.some((caveat) => caveat.includes('commercial-carting')));
assert.ok(shownSchedule.caveats.some((caveat) => caveat.includes('UNZONED')));
// Post-validation mutation throws instead of silently changing the claim.
assert.throws(() => { schedule.scheduleDays.push('Sun'); }, TypeError);
assert.throws(() => { schedule.recordKey.scheduleCode = '1052B'; }, TypeError);
// Each negative case gets its own covering envelope (raw bytes hashed
// in-module) so the semantic gate — not membership — is what rejects it.
const verifyCovering = (records, datasetId = 'rv63-53db', fullRowCount = 610) => {
  const raw = JSON.stringify(records);
  return verifyRetrievedEnvelope(validateRetrievedEnvelope({
    datasetId,
    retrievedAt: '2026-10-30T10:00:00Z',
    sourceUrl: `https://data.cityofnewyork.us/resource/${datasetId}.json`,
    fullRowCount,
    sampleQuery: 'synthetic negative-case probe',
    rawResponse: raw,
    declaredSha256: shaOf(raw),
  }), raw);
};
const incoherentDistrict = { district: 'MN05', section: 'MN041', frequency: 'A', schedulecode: '1052A', freq_refuse: 'Mon, Wed, Fri' };
assert.throws(() => classifyExternalRecord({
  kind: 'published_schedule',
  envelope: verifyCovering([incoherentDistrict]),
  record: incoherentDistrict,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
}), /belong to district/);
const mismatchedFrequency = { ...scheduleRecordA, frequency: 'B' };
assert.throws(() => classifyExternalRecord({
  kind: 'published_schedule',
  envelope: verifyCovering([mismatchedFrequency]),
  record: mismatchedFrequency,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
}), /frequency letter/);
const schedulecodeMissing = { district: 'MN05', section: 'MN052', freq_refuse: 'Mon, Wed, Fri' };
assert.throws(() => validatePublishedSchedule({
  envelope: verifyCovering([schedulecodeMissing]),
  record: schedulecodeMissing,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
}), /schedulecode/, 'district/section alone stays non-conformant');
assert.throws(() => validatePublishedSchedule({
  envelope: verifyCovering([scheduleRecordA]),
  record: scheduleRecordA,
  geographicKey: { polygonId: '27', vertexSha256: HEX },
}), /stable schedulecode/);
// S03b-02 probe 1 — record substitution: the envelope covers only MN052/A, so
// classifying MN052/B (Sunday) against it must fail.
const rawOnlyA = JSON.stringify([scheduleRecordA]);
const onlyAEnvelope = verifyRetrievedEnvelope(validateRetrievedEnvelope({
  ...envelopeArgs,
  fullRowCount: 610,
  sampleQuery: "schedulecode in('1052A')",
  rawResponse: rawOnlyA,
  declaredSha256: shaOf(rawOnlyA),
}), rawOnlyA);
assert.throws(() => validatePublishedSchedule({
  envelope: onlyAEnvelope,
  record: { district: 'MN05', section: 'MN052', frequency: 'B', schedulecode: '1052B', freq_refuse: 'Sun' },
  geographicKey: { polygonId: '1052B', vertexSha256: HEX },
}), /absent from the verified envelope records/);
// S03b-02 probe 2 — occurrence laundering: a schedule-data envelope cannot
// classify an invented occurrence, synthetic or not.
const inventedOccurrence = {
  eventId: 'invented-1',
  observedAt: '2026-10-30T09:00:00Z',
  observer: 'self-asserted',
  synthetic: false,
  geographicKey: { polygonId: 'invented-polygon', vertexSha256: HEX },
  measuredQuantity: 9,
  unit: 'bags',
  source: { title: 'SYNTHETIC TEST ONLY', url: 'https://example.com/invented' },
  methodOfObservation: 'asserted without observation',
  uncertainty: { kind: 'range', bounds: { low: 9, high: 9 } },
};
assert.throws(() => validateVerifiedOccurrence({ envelope: verified, record: inventedOccurrence }), /absent from the verified envelope records/);
// S03b-02 probe 3 — forged verification state: a caller-built object carrying
// verification-looking fields is not a member of module-private state.
const forged = JSON.parse(JSON.stringify(verified));
assert.throws(() => classifyExternalRecord({
  kind: 'published_schedule',
  envelope: forged,
  record: scheduleRecordA,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
}), /unverified envelope/);
assert.throws(() => verifyRetrievedEnvelope(forged, rawCarried), /cannot be constructed by hand/);
// Wrong-dataset envelope cannot smuggle a schedule in: the record is covered,
// so membership passes and the dataset pin is what rejects it.
assert.throws(() => validatePublishedSchedule({
  envelope: verifyCovering([scheduleRecordA], '8ev8-jjxq', 20),
  record: scheduleRecordA,
  geographicKey: { polygonId: '1052A', vertexSha256: HEX },
}), /rv63-53db/);
assert.throws(() => classifyExternalRecord({ kind: 'simulated_action', record: {} }), /unknown external evidence kind/);
// A timetable is not an occurrence, and a bare contract marker is not evidence.
assert.throws(() => validateVerifiedOccurrence({
  envelope: verified,
  record: { eventId: 'not-an-event', scheduleDays: ['Mon'] },
}), /absent from the verified envelope records/);
assert.throws(() => describeEvidenceForDisplay({
  contract: EXTERNAL_EVIDENCE_CONTRACT,
  kind: 'verified_occurrence',
  eventId: 'fabricated-1',
}), /retrieval envelope/);
// Occurrences need provenance: named observer plus an explicit synthetic flag.
// Synthetic fixtures render as synthetic, never as verified real events.
const occurrenceRecord = {
  eventId: 'synthetic-event-1',
  observedAt: '2026-10-30T09:00:00Z',
  observer: 'synthetic test observer',
  synthetic: true,
  geographicKey: { polygonId: 'synthetic-polygon-1', vertexSha256: HEX },
  measuredQuantity: 3,
  unit: 'bags',
  source: { title: 'SYNTHETIC TEST ONLY', url: 'https://example.com/synthetic-occurrence' },
  methodOfObservation: 'synthetic direct observation',
  uncertainty: { kind: 'range', bounds: { low: 2, high: 4 } },
};
const rawOccurrence = JSON.stringify([occurrenceRecord]);
const occurrenceEnvelope = verifyRetrievedEnvelope(validateRetrievedEnvelope({
  datasetId: 'test-0000',
  retrievedAt: '2026-10-30T10:00:00Z',
  sourceUrl: 'https://example.com/synthetic-occurrence',
  rawResponse: rawOccurrence,
  declaredSha256: shaOf(rawOccurrence),
}), rawOccurrence);
const occurrence = validateVerifiedOccurrence({ envelope: occurrenceEnvelope, record: occurrenceRecord });
assert.equal(occurrence.synthetic, true);
assert.deepEqual(occurrence.asserts, { occurrence: true, quantity: true, allScheduledEvents: false });
const shownSynthetic = describeEvidenceForDisplay(occurrence);
assert.ok(shownSynthetic.headline.startsWith('SYNTHETIC TEST occurrence'), 'synthetic fixtures must stay visibly synthetic');
assert.equal(shownSynthetic.headline.startsWith('Verified occurrence'), false);
const noObserverRecord = { ...occurrenceRecord, observer: '' };
const rawNoObserver = JSON.stringify([noObserverRecord]);
const noObserverEnvelope = verifyRetrievedEnvelope(validateRetrievedEnvelope({
  datasetId: 'test-0000',
  retrievedAt: '2026-10-30T10:00:00Z',
  sourceUrl: 'https://example.com/synthetic-occurrence',
  rawResponse: rawNoObserver,
  declaredSha256: shaOf(rawNoObserver),
}), rawNoObserver);
assert.throws(() => validateVerifiedOccurrence({
  envelope: noObserverEnvelope,
  record: noObserverRecord,
}), /observer/, 'anonymous records are not occurrences');
const { synthetic: _dropped, ...noFlagRecord } = occurrenceRecord;
const rawNoFlag = JSON.stringify([noFlagRecord]);
const noFlagEnvelope = verifyRetrievedEnvelope(validateRetrievedEnvelope({
  datasetId: 'test-0000',
  retrievedAt: '2026-10-30T10:00:00Z',
  sourceUrl: 'https://example.com/synthetic-occurrence',
  rawResponse: rawNoFlag,
  declaredSha256: shaOf(rawNoFlag),
}), rawNoFlag);
assert.throws(() => validateVerifiedOccurrence({
  envelope: noFlagEnvelope,
  record: noFlagRecord,
}), /synthetic/, 'the synthetic flag is mandatory, not defaultable');
// Estimates require method, cited inputs, flagged assumptions, and bounds.
const estimate = validateEstimatedQuantity({
  record: {
    value: 12.5,
    unit: 'kg',
    method: { id: 'edible-per-restaurant-day', version: 'v0.1' },
    inputs: [
      { kind: 'published_schedule', ref: 'rv63-53db#1052A' },
      { kind: 'assumption', ref: 'seats-proxy', statedAsAssumption: true },
    ],
    uncertainty: { kind: 'range', bounds: { low: 8, high: 19 } },
    validRange: { geography: 'MN05/MN052', period: '2026-10-01/2026-10-31' },
  },
});
assert.deepEqual(estimate.asserts, { occurrence: false, quantity: true, measured: false });
const shownEstimate = describeEvidenceForDisplay(estimate);
assert.ok(shownEstimate.headline.includes('edible-per-restaurant-day v0.1'));
assert.throws(() => validateEstimatedQuantity({
  record: {
    value: 1,
    unit: 'kg',
    method: { id: 'm', version: 'v1' },
    inputs: [{ kind: 'assumption', ref: 'unstated' }],
    uncertainty: { kind: 'range', bounds: { low: 1, high: 2 } },
    validRange: { geography: 'MN05', period: '2026-10-01/2026-10-31' },
  },
}), /explicitly flagged/);
console.log('PASS external evidence — pinned DSNY records validate as labeled context only; pins complete, geo keys coherent, digests bound to bytes, occurrences carry provenance, display re-validates frozen evidence');
