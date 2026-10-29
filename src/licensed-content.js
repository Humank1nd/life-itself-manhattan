// Licensed-content overlay loader (Rat POV hidden-setting support).
// Third-party references live ONLY in a git-ignored local `licensed/`
// directory that is never committed and never deployed. This loader
// resolves to DISABLED unless ALL of the following hold:
//   1. the caller explicitly opts in (flag true),
//   2. licensed/manifest.json exists and validates,
//   3. every entry carries a non-empty id and text.
// Default state — and every public build, including GitHub Pages — is
// { enabled: false, entries: [] }. No imports; runs in Node unchanged.
export const LICENSED_SCHEMA = 'life-itself-licensed-overlay/1.0.0';
export function resolveLicensed({ manifest = null, enabled = false } = {}) {
  const off = { enabled: false, entries: [] };
  if (enabled !== true) return off;
  if (!manifest || manifest.schemaVersion !== LICENSED_SCHEMA) return off;
  if (!Array.isArray(manifest.entries)) return off;
  for (const e of manifest.entries) {
    if (!e || typeof e.id !== 'string' || e.id.length === 0) return off;
    if (typeof e.text !== 'string' || e.text.length === 0) return off;
  }
  return { enabled: true, entries: manifest.entries.map((e) => ({ id: e.id, kind: e.kind || 'reference', text: e.text })) };
}
