// Validator for data/photo-alignment-v1.json (method
// geometry-and-time-v1). Enforces the layer's honesty contract:
// every alignment proposed and visually unverified, every candidate a
// real island building, and no building proposed for a photograph
// taken before the building existed.
import assert from 'node:assert/strict';

export function validateAlignment(data, buildingYears) {
  assert.equal(data?.schemaVersion, 'life-itself-photo-alignment/1.0.0', 'alignment schema mismatch');
  assert.equal(data?.method?.name, 'geometry-and-time-v1', 'alignment method mismatch');
  assert.ok(/Candidates only/.test(data?.semantics ?? ''), 'alignment semantics must stay candidates-only');
  assert.ok(Array.isArray(data?.alignments), 'alignments must be listed');
  for (const a of data.alignments) {
    assert.equal(a.status, 'proposed', 'alignment must stay proposed: ' + a.photoId);
    assert.equal(a.validatedVisualOverlap, false, 'alignment must stay visually unverified: ' + a.photoId);
    assert.ok(Number.isFinite(a.point?.x) && Number.isFinite(a.point?.z), 'alignment point invalid: ' + a.photoId);
    const photoYear = Number(String(a.capturedAt).slice(0, 4));
    assert.ok(Number.isInteger(photoYear), 'alignment photo year invalid: ' + a.photoId);
    assert.ok(a.candidates.length >= 1 && a.candidates.length <= 5, 'candidate count out of range: ' + a.photoId);
    for (const c of a.candidates) {
      assert.ok(buildingYears.has(c.bin), 'candidate BIN not in the island records: ' + c.bin);
      const yr = buildingYears.get(c.bin);
      assert.ok(yr == null || yr <= photoYear, `building from the future proposed: BIN ${c.bin} built ${yr}, photo ${photoYear}`);
      assert.ok(c.score > 0 && c.score <= 1, 'candidate score out of range: ' + c.bin);
    }
  }
  return true;
}
