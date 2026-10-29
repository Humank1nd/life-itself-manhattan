// Gate for the licensed-content overlay toggle.
// Default and every public build: DISABLED. Private testing only with an
// explicit flag AND a valid local manifest (fixture lives in /tmp, never
// committed). No real third-party text appears anywhere in this repo.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { resolveLicensed, LICENSED_SCHEMA } from '../src/licensed-content.js';
// 1. Defaults: everything off.
assert.deepEqual(resolveLicensed(), { enabled: false, entries: [] });
assert.deepEqual(resolveLicensed({ enabled: false }), { enabled: false, entries: [] });
assert.deepEqual(resolveLicensed({ enabled: true }), { enabled: false, entries: [] });
assert.deepEqual(resolveLicensed({ enabled: true, manifest: null }), { enabled: false, entries: [] });
// 2. Malformed manifests stay off.
for (const bad of [{}, { schemaVersion: 'x' }, { schemaVersion: LICENSED_SCHEMA },
    { schemaVersion: LICENSED_SCHEMA, entries: 'nope' },
    { schemaVersion: LICENSED_SCHEMA, entries: [{ id: '', text: 't' }] },
    { schemaVersion: LICENSED_SCHEMA, entries: [{ id: 'a' }] }]) {
  assert.deepEqual(resolveLicensed({ enabled: true, manifest: bad }), { enabled: false, entries: [] }, JSON.stringify(bad).slice(0, 40));
}
// 3. Private-testing path: explicit flag + valid local manifest (SAMPLE text only).
{
  const dir = mkdtempSync(join(tmpdir(), 'licensed-overlay-'));
  const manifest = { schemaVersion: LICENSED_SCHEMA,
    entries: [{ id: 'epilogue-beat-1', kind: 'epilogue-text', text: 'SAMPLE — not licensed material' }] };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const loaded = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const on = resolveLicensed({ enabled: true, manifest: loaded });
  assert.equal(on.enabled, true);
  assert.equal(on.entries.length, 1);
  assert.equal(on.entries[0].text, 'SAMPLE — not licensed material');
  assert.deepEqual(resolveLicensed({ enabled: false, manifest: loaded }), { enabled: false, entries: [] });
}
// 4. The public tree contains no licensed overlay and no real third-party text.
{
  const { existsSync } = await import('node:fs');
  assert(!existsSync(new URL('../licensed', import.meta.url)), 'licensed/ must never be committed');
}
console.log('PASS licensed overlay — off by default, explicit flag + valid local manifest required, malformed stays off, public tree clean');
