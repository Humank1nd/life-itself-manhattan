# Extraction 026 — World-model grounding contract

One complete loop, proven: a real stack component emits typed,
hash-attributed data; Life Itself verifies and reconciles it; the
reconciled world changes the next rat decision. Tampered, unknown,
duplicate, and unimplemented reports fail closed with the world
untouched. No model, no provider.

## What landed

- **`src/grounding-contract.js`** — `attestReport` (known source,
  report id, 64-hex hash, tick; deep-copied payload),
  `verifyReportHash` (hash equality at the boundary — hashing itself
  stays in Node crypto, never in the pure module),
  `reconcileReport` (idempotent via seen-set; only `restaurant-pulse`
  implemented; sanitation/weather recognized but explicitly
  unimplemented).
- **`scripts/test-grounding-contract.mjs`** — baseline abstention on
  an empty patch; full loop (report → verify → reconcile → decide
  toward the patched patch); tamper/unknown/duplicate/unimplemented/
  unknown-patch/negative-waste rejections with the world proven
  unchanged.

## What this establishes (and the boundary)

The neural renderer may imagine what the world looks like; the stack
establishes what it contains. Matrix-Game stays an optional,
experimentally validated presentation capability: this contract is
what it would eventually consume — hashed, attributed, reconciled
state — never raw numbers. No low-poly exporter yet; no training.

Run `npm run test:grounding-contract`.
