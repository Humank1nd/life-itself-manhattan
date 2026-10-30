// Life Itself Manhattan — deterministic grounded-data producer.
// A stack component that emits typed report payloads from explicit
// inputs: no sampling, no network, no clock reads. The caller hashes
// and attests at the boundary; this module only constructs valid
// payloads. Restaurant pulses and the sanitation clock are the two
// implemented producers; anything else is out of scope.
const assert = (ok, why) => { if (!ok) throw new Error('producer: ' + why); };
export function restaurantPulse({ patchId, wasteKg, day, seq }) {
  assert(typeof patchId === 'string' && patchId.length > 0, 'patchId required');
  assert(typeof wasteKg === 'number' && wasteKg >= 0 && Number.isFinite(wasteKg), 'wasteKg must be non-negative');
  assert(Number.isInteger(day) && day >= 0, 'day must be a non-negative integer');
  assert(Number.isInteger(seq) && seq >= 0, 'seq must be a non-negative integer');
  return { patchId, wasteKg, day, seq };
}
export function sanitationDue(day, periodDays = 7) {
  assert(Number.isInteger(day) && day >= 0, 'day must be a non-negative integer');
  assert(Number.isInteger(periodDays) && periodDays > 0, 'period must be positive');
  return day > 0 && day % periodDays === 0;
}
export function reportIdFor(source, day, seq) {
  return `${source}-d${day}-${seq}`;
}
// Deterministic simulated collection report for one patch on one
// ecological day. Simulation-labeled (provenance 'simulated'):
// self-consistent and hashable, but never a claim about any real-world
// truck. `seq` is the patch's roster-order index, keeping report
// construction deterministic.
export function sanitationPulse({ patchId, day, seq, periodDays }) {
  assert(typeof patchId === 'string' && patchId.length > 0, 'patchId required');
  assert(Number.isInteger(day) && day > 0, 'day must be a positive integer (no day-0 collections)');
  assert(Number.isInteger(seq) && seq >= 0, 'seq must be a non-negative integer');
  // A custom period is preserved verbatim so the contract can reject it:
  // the simulated cadence is pinned to 7 days and overrides need an
  // explicitly authorized configuration, not silent acceptance.
  if (periodDays !== undefined) assert(Number.isInteger(periodDays) && periodDays > 0, 'periodDays must be a positive integer');
  return { patchId, day, seq, ...(periodDays === undefined ? {} : { periodDays }), provenance: 'simulated' };
}
// Canonical report identity, derived from day + patch: any alias ID for
// the same collection is rejected by the contract, so one patch-day can
// never be collected twice under two names.
export function sanitationReportId(day, patchId) {
  assert(Number.isInteger(day) && day > 0, 'day must be a positive integer');
  assert(typeof patchId === 'string' && patchId.length > 0, 'patchId required');
  return `sanitation-schedule-d${day}-${patchId}`;
}
