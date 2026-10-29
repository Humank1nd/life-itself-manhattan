// Life Itself Manhattan — 365-day world clock (Phase B, B01).
// The calendar all seasonal systems share: named seasons, deterministic
// day ticks, compressed skips that equal continuous stepping (same code
// path, fewer decision points — not approximate fast-forward), and
// seasonal checkpoint restore. Pure: no I/O, no model, no clock.
export const DAYS_IN_YEAR = 365;
// Meteorological-ish bounds, Northern Hemisphere; game-feel, documented.
const SEASONS = [
  { name: 'winter', from: 335, to: 365 }, { name: 'winter', from: 0, to: 60 },
  { name: 'spring', from: 60, to: 152 },
  { name: 'summer', from: 152, to: 244 },
  { name: 'autumn', from: 244, to: 335 },
];
export function seasonOfDay(day) {
  if (!Number.isInteger(day) || day < 0) throw new Error('clock: day must be a non-negative integer');
  const d = day % DAYS_IN_YEAR;
  for (const s of SEASONS) if (d >= s.from && d < s.to) return s.name;
  return 'winter';
}
export function yearOfDay(day) {
  if (!Number.isInteger(day) || day < 0) throw new Error('clock: day must be a non-negative integer');
  return Math.floor(day / DAYS_IN_YEAR);
}
// One ecological day for every patch. Identical function for stepping
// and skipping: a skip IS n consecutive steps, so replay is trivially
// identical and the only compression is fewer interaction points.
export function tickDay(patches, tickPatch, day) {
  if (!Array.isArray(patches)) throw new Error('clock: patches must be an array');
  for (const p of patches) tickPatch(p, { day });
  return patches;
}
export function skipDays(patches, tickPatch, fromDay, n) {
  if (!Number.isInteger(n) || n < 0) throw new Error('clock: skip count must be non-negative');
  for (let i = 0; i < n; i++) tickDay(patches, tickPatch, fromDay + i);
  return patches;
}
