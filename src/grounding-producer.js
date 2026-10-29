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
