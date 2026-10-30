// Life Itself Manhattan — read-only external evidence adapter.
// Validates pinned NYC Open Data records and labels them as contextual
// evidence. This module keeps no mutable registry and exports no simulation
// hooks. It cannot create food, empty containers, schedule pickups, or change
// rat behavior. Its single import is the node:crypto digest primitive —
// no simulation modules, no network reads, no filesystem access.
//
// Verification chain, in order:
//   1. pinDataset proves which dataset and retrieval the bytes came from.
//      Partial pins (id alone) are rejected at every entry point.
//   2. validateRetrievedEnvelope takes the VERBATIM raw response bytes, hashes
//      them in-module, and requires the caller-declared digest to match that
//      computation. A digest computed over different bytes fails here, at
//      creation — comparison alone could never catch that lie. The covered
//      records are parsed by the module from those same bytes, so digest,
//      bytes, and records are one bound unit.
//   3. verifyRetrievedEnvelope requires the presenter to hold those exact
//      bytes (the digest is recomputed and must match) and admits the
//      envelope to module-private verified state. A matching digest supports
//      byte consistency; it cannot independently establish that the claimed
//      source published those bytes — source authentication stays out of band.
//   4. Classification accepts only records covered by a verified envelope, so
//      a credible-looking envelope can never launder a substituted record.
// Verification state lives in module-private WeakSets, never in a
// caller-visible boolean, so it cannot be forged by hand-built objects.
// Validated outputs are deep-frozen against post-validation mutation, and
// display labels re-validate from the retained inputs instead of trusting a
// caller-supplied contract marker.
import { createHash } from 'node:crypto';
export const EXTERNAL_EVIDENCE_CONTRACT = 'life-itself-external-evidence/1.0.0';
export const EVIDENCE_CLASSES = ['published_schedule', 'verified_occurrence', 'estimated_quantity'];
export const DSNY_FREQUENCY_DATASET = 'rv63-53db';
export const DSNY_COMMERCIAL_ZONES_DATASET = '8ev8-jjxq';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MANHATTAN_FREQUENCIES = ['A', 'B'];
const DATASET_ID = /^[a-z0-9]{4}-[a-z0-9]{4}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const MANHATTAN_DISTRICT = /^MN\d{2}$/;
const MANHATTAN_SECTION = /^MN\d{3}$/;
const SCHEDULE_CODE = /^\d{4}[A-E]$/;
// Nonforgeable verification state: only envelopes that passed through
// validateRetrievedEnvelope (issued) and verifyRetrievedEnvelope (verified)
// are members. Hand-built lookalikes are never members.
const issuedEnvelopes = new WeakSet();
const verifiedEnvelopes = new WeakSet();
const fail = (why) => { throw new Error('external-evidence: ' + why); };
const need = (ok, why) => { if (!ok) fail(why); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const isISOTime = (value) => typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
// Canonical form for record identity: key order never distinguishes records.
const canonicalize = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
};
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};
// A pin is complete only with id, retrieval time, and a reproducible source
// URL. fullRowCount, when known, is the dataset total — never a sample count.
export function pinDataset({ datasetId, retrievedAt, sourceUrl, rowsUpdatedAt = null, fullRowCount = null }) {
  need(DATASET_ID.test(datasetId || ''), 'dataset id required, e.g. rv63-53db');
  need(isISOTime(retrievedAt), 'dataset retrieval timestamp required as UTC ISO-8601');
  need(HTTPS_URL.test(sourceUrl || ''), 'dataset sourceUrl required as https so the retrieval is reproducible');
  if (rowsUpdatedAt !== null) need(isISOTime(rowsUpdatedAt), 'dataset rowsUpdatedAt must be UTC ISO-8601');
  if (fullRowCount !== null) need(Number.isInteger(fullRowCount) && fullRowCount >= 0, 'dataset fullRowCount must be a non-negative integer');
  return deepFreeze({ datasetId, retrievedAt, sourceUrl, rowsUpdatedAt, fullRowCount });
}
export function validateGeographicKey({ polygonId, vertexSha256 }) {
  need(typeof polygonId === 'string' && polygonId.length > 0, 'geographic key needs a stable polygon id');
  need(HEX64.test(vertexSha256 || ''), 'geographic key needs a 64-hex vertex hash');
  return deepFreeze({ polygonId, vertexSha256 });
}
const parseRefuseDays = (freqRefuse) => {
  need(typeof freqRefuse === 'string' && freqRefuse.length > 0, 'DSNY frequency record needs freq_refuse');
  const days = freqRefuse.split(',').map((day) => day.trim()).filter((day) => day.length > 0);
  need(days.length > 0 && days.length <= 7, 'freq_refuse must name one to seven weekdays');
  for (const day of days) need(WEEKDAYS.includes(day), 'unknown weekday in freq_refuse: ' + day);
  need(new Set(days).size === days.length, 'freq_refuse must not repeat a weekday');
  return days;
};
// The envelope starts unverified, but its digest is already bound: it is the
// in-module hash of the retained raw response, cross-checked against the
// caller-declared digest. The covered records are parsed from those bytes,
// never supplied as a parallel caller-controlled list.
export function validateRetrievedEnvelope({ datasetId, retrievedAt, sourceUrl, rowsUpdatedAt = null, fullRowCount = null, sampleQuery = null, rawResponse, declaredSha256 }) {
  const dataset = pinDataset({ datasetId, retrievedAt, sourceUrl, rowsUpdatedAt, fullRowCount });
  need(typeof rawResponse === 'string' && rawResponse.length > 0, 'retrieved envelope needs the verbatim raw response bytes');
  need(HEX64.test(declaredSha256 || ''), 'retrieved envelope needs the declared sha256 of the raw response bytes');
  const computed = sha256Hex(rawResponse);
  need(declaredSha256 === computed, 'envelope digest mismatch: the declared digest was not computed from this raw response');
  let records = null;
  try { records = JSON.parse(rawResponse); } catch { records = null; }
  need(Array.isArray(records) && records.length > 0, 'raw response must be a JSON array carrying at least one record');
  for (const record of records) need(record && typeof record === 'object' && !Array.isArray(record), 'covered records must be objects');
  if (fullRowCount !== null) {
    need(records.length <= fullRowCount, 'envelope cannot carry more records than the dataset full row count');
    if (records.length < fullRowCount) {
      need(typeof sampleQuery === 'string' && sampleQuery.length > 0, 'sampled envelope must declare its sampleQuery; a sample count is not the dataset row count');
    }
  }
  const envelope = deepFreeze({ contract: EXTERNAL_EVIDENCE_CONTRACT, kind: 'retrieved_envelope', dataset, sha256: computed, recordCount: records.length, sampleQuery, coveredRecords: clone(records) });
  issuedEnvelopes.add(envelope);
  return envelope;
}
// Verification proves the presenter holds the exact bytes the digest covers.
// The digest is recomputed here, from the presented bytes — never trusted
// from a caller-held field.
export function verifyRetrievedEnvelope(envelope, rawResponse) {
  need(envelope && envelope.contract === EXTERNAL_EVIDENCE_CONTRACT && envelope.kind === 'retrieved_envelope', 'not a validated retrieval envelope');
  need(issuedEnvelopes.has(envelope), 'not a validated retrieval envelope: envelopes cannot be constructed by hand');
  need(typeof rawResponse === 'string' && rawResponse.length > 0, 'verification must present the raw response bytes');
  need(sha256Hex(rawResponse) === envelope.sha256, 'envelope hash mismatch: presented bytes do not match the verified digest');
  verifiedEnvelopes.add(envelope);
  return envelope;
}
const requireVerifiedEnvelope = (envelope) => {
  need(envelope && envelope.kind === 'retrieved_envelope', 'classification needs a validated retrieval envelope');
  need(verifiedEnvelopes.has(envelope), 'unverified envelope: verify the exact covered bytes before classifying records');
  return pinDataset(clone(envelope.dataset || {}));
};
// Membership proof: the record being classified must be one of the records
// parsed from the verified bytes. Anything else is substitution.
const requireCoveredRecord = (envelope, record, what) => {
  need(record && typeof record === 'object', what + ' needs a record');
  const seeking = canonicalize(record);
  const covered = (envelope.coveredRecords || []).some((candidate) => canonicalize(candidate) === seeking);
  need(covered, what + ' is absent from the verified envelope records: only records covered by verification can be classified');
};
export function validatePublishedSchedule({ envelope, record, geographicKey }) {
  const dataset = requireVerifiedEnvelope(envelope);
  need(dataset.datasetId === DSNY_FREQUENCY_DATASET, 'published DSNY schedules must pin rv63-53db');
  requireCoveredRecord(envelope, record, 'published schedule');
  const { district, section, frequency, schedulecode, freq_refuse } = record;
  need(MANHATTAN_DISTRICT.test(district || ''), 'schedule district must be a Manhattan DSNY district, e.g. MN05');
  need(MANHATTAN_SECTION.test(section || ''), 'schedule section must be a Manhattan DSNY section, e.g. MN052');
  need(SCHEDULE_CODE.test(schedulecode || ''), 'schedulecode is required, e.g. 1052A');
  need(MANHATTAN_FREQUENCIES.includes(frequency), 'Manhattan DSNY frequency must be A or B as validated in S03a');
  need(frequency === schedulecode.slice(-1), 'frequency letter must match schedulecode suffix');
  need(section.slice(0, 4) === district, 'section must belong to district, e.g. MN052 belongs to MN05');
  need(schedulecode === '1' + district.slice(2) + section.slice(-1) + frequency, 'schedulecode must be coherent: borough 1 + district digits + section suffix + frequency');
  const scheduleDays = parseRefuseDays(freq_refuse);
  const key = validateGeographicKey(geographicKey || {});
  need(key.polygonId === schedulecode, 'frequency polygon id must be the stable schedulecode, never a mutable object id');
  return deepFreeze({
    contract: EXTERNAL_EVIDENCE_CONTRACT,
    kind: 'published_schedule',
    envelope,
    dataset,
    recordKey: { district, section, scheduleCode: schedulecode },
    serviceRegime: 'dsny-collection',
    notApplicableTo: ['commercial-carting-pickup'],
    scheduleDays,
    freqRefuseVerbatim: freq_refuse,
    geographicKey: key,
    sourceRecord: clone(record),
    asserts: { occurrence: false, quantity: false },
    boundary: 'polygon-boundary-uncertainty-preserved',
    outsidePolygon: 'UNZONED',
  });
}
const validateSource = (source) => {
  need(source && typeof source.title === 'string' && source.title.trim().length > 0, 'source title required');
  need(HTTPS_URL.test(source.url || ''), 'source url must be https');
  return clone(source);
};
export function validateUncertainty(uncertainty) {
  need(uncertainty && typeof uncertainty === 'object', 'uncertainty model required');
  const { kind, bounds } = uncertainty;
  need(kind === 'range' || kind === 'distribution' || kind === 'order-of-magnitude', 'unknown uncertainty kind');
  need(bounds && typeof bounds === 'object', 'uncertainty bounds required');
  if (kind === 'range') {
    need(Number.isFinite(bounds.low) && Number.isFinite(bounds.high), 'range uncertainty needs finite low/high bounds');
    need(bounds.low <= bounds.high, 'range uncertainty low must not exceed high');
  }
  if (kind === 'distribution') {
    need(typeof bounds.description === 'string' && bounds.description.trim().length > 0, 'distribution uncertainty needs a description');
  }
  if (kind === 'order-of-magnitude') {
    need(Number.isFinite(bounds.factor) && bounds.factor > 0, 'order-of-magnitude uncertainty needs a positive factor');
  }
  return clone(uncertainty);
}
// Occurrences are the only evidence class that asserts reality, so the bar is
// highest: verified envelope, membership in its covered records, named
// observer, stated method, and an explicit synthetic flag so test fixtures can
// never render as verified real events.
export function validateVerifiedOccurrence({ envelope, record }) {
  const dataset = requireVerifiedEnvelope(envelope);
  requireCoveredRecord(envelope, record, 'verified occurrence');
  need(typeof record.eventId === 'string' && record.eventId.length > 0, 'occurrence eventId required');
  need(isISOTime(record.observedAt), 'occurrence observedAt required as UTC ISO-8601');
  need(typeof record.observer === 'string' && record.observer.length > 0, 'occurrence observer required: who independently established this event');
  need(typeof record.synthetic === 'boolean', 'occurrence must declare synthetic true/false; test fixtures must stay visibly synthetic');
  need(typeof record.measuredQuantity === 'number' && Number.isFinite(record.measuredQuantity) && record.measuredQuantity >= 0, 'occurrence measuredQuantity must be non-negative');
  need(typeof record.unit === 'string' && record.unit.length > 0, 'occurrence unit required');
  need(typeof record.methodOfObservation === 'string' && record.methodOfObservation.length > 0, 'occurrence methodOfObservation required');
  return deepFreeze({
    contract: EXTERNAL_EVIDENCE_CONTRACT,
    kind: 'verified_occurrence',
    envelope,
    dataset,
    eventId: record.eventId,
    observedAt: record.observedAt,
    observer: record.observer,
    synthetic: record.synthetic,
    geographicKey: validateGeographicKey(record.geographicKey || {}),
    measuredQuantity: record.measuredQuantity,
    unit: record.unit,
    source: validateSource(record.source || {}),
    methodOfObservation: record.methodOfObservation,
    uncertainty: validateUncertainty(record.uncertainty),
    sourceRecord: clone(record),
    asserts: { occurrence: true, quantity: true, allScheduledEvents: false },
  });
}
export function validateEstimatedQuantity({ record }) {
  need(record && typeof record === 'object', 'estimate needs a record');
  need(typeof record.value === 'number' && Number.isFinite(record.value) && record.value >= 0, 'estimate value must be non-negative');
  need(typeof record.unit === 'string' && record.unit.length > 0, 'estimate unit required');
  need(record.method && typeof record.method.id === 'string' && record.method.id.length > 0, 'estimate method id required');
  need(typeof record.method.version === 'string' && record.method.version.length > 0, 'estimate method version required');
  need(Array.isArray(record.inputs) && record.inputs.length > 0, 'estimate inputs required');
  for (const input of record.inputs) {
    need(input && (input.kind === 'published_schedule' || input.kind === 'verified_occurrence' || input.kind === 'assumption'), 'estimate input kind invalid');
    need(typeof input.ref === 'string' && input.ref.length > 0, 'estimate input ref required');
    if (input.kind === 'assumption') need(input.statedAsAssumption === true, 'assumptions must be explicitly flagged');
  }
  need(record.validRange && typeof record.validRange.geography === 'string' && record.validRange.geography.length > 0, 'estimate geography required');
  need(typeof record.validRange.period === 'string' && record.validRange.period.length > 0, 'estimate period required');
  return deepFreeze({
    contract: EXTERNAL_EVIDENCE_CONTRACT,
    kind: 'estimated_quantity',
    value: record.value,
    unit: record.unit,
    method: clone(record.method),
    inputs: clone(record.inputs),
    uncertainty: validateUncertainty(record.uncertainty),
    validRange: clone(record.validRange),
    sourceRecord: clone(record),
    asserts: { occurrence: false, quantity: true, measured: false },
  });
}
export function classifyExternalRecord({ kind, envelope = null, record, geographicKey = null }) {
  need(kind === 'published_schedule' || kind === 'verified_occurrence' || kind === 'estimated_quantity', 'unknown external evidence kind: ' + kind);
  if (kind === 'published_schedule') return validatePublishedSchedule({ envelope, record, geographicKey });
  if (kind === 'verified_occurrence') return validateVerifiedOccurrence({ envelope, record });
  return validateEstimatedQuantity({ record });
}
// Display re-validates from the retained inputs, so a fabricated object with a
// copied contract marker renders nothing. Frozen outputs make post-validation
// mutation throw instead of silently changing the claim.
export function describeEvidenceForDisplay(evidence) {
  need(evidence && typeof evidence === 'object', 'display needs validated external evidence');
  if (evidence.kind === 'published_schedule') {
    const fresh = validatePublishedSchedule({ envelope: evidence.envelope, record: evidence.sourceRecord, geographicKey: evidence.geographicKey });
    return {
      kind: fresh.kind,
      headline: `Published DSNY collection timetable ${fresh.freqRefuseVerbatim} for ${fresh.recordKey.scheduleCode} (${fresh.recordKey.district}/${fresh.recordKey.section})`,
      caveats: [
        'Timetable only: no collection occurrence, quantity, or contents implied.',
        'DSNY-collection context only: not a commercial-carting pickup schedule.',
        'Polygon-boundary uncertainty preserved: points outside the polygon are UNZONED, not unscheduled.',
      ],
    };
  }
  if (evidence.kind === 'verified_occurrence') {
    const fresh = validateVerifiedOccurrence({ envelope: evidence.envelope, record: evidence.sourceRecord });
    if (fresh.synthetic === true) {
      return {
        kind: fresh.kind,
        headline: `SYNTHETIC TEST occurrence ${fresh.eventId} at ${fresh.observedAt}: ${fresh.measuredQuantity} ${fresh.unit}`,
        caveats: [
          'Test fixture only: not verified evidence of a real-world event.',
          'Must never be presented as an observed collection.',
        ],
      };
    }
    return {
      kind: fresh.kind,
      headline: `Verified occurrence ${fresh.eventId} at ${fresh.observedAt}: ${fresh.measuredQuantity} ${fresh.unit}`,
      caveats: [
        'One observed event: does not imply that all scheduled events occurred.',
        'Quantity is measured under the stated method and uncertainty.',
      ],
    };
  }
  need(evidence.kind === 'estimated_quantity', 'unknown external evidence kind for display');
  const fresh = validateEstimatedQuantity({ record: evidence.sourceRecord });
  return {
    kind: fresh.kind,
    headline: `Estimated ${fresh.value} ${fresh.unit} via ${fresh.method.id} ${fresh.method.version}`,
    caveats: [
      'Modeled quantity: method and uncertainty are required.',
      `Valid only for ${fresh.validRange.geography} during ${fresh.validRange.period}; do not widen.`,
    ],
  };
}
