# Extraction 003 — The Rust core, and the anchors come home

Two rulings frame this extraction (founder, 2026-10-28): the system
adapts to **Rust + three.js + Node 24** — Rust owns the truth, three.js
renders it, Node 24 runs the tools — and the Rust twin core lives **in
this repo**.

## What landed: `core/` (crate `twin-core`)

- **`geo`** — the WGS84 → ECEF → ENU transform. Constants identical to
  the quarry's `cesium_bridge.py` (Extraction 001); the frame is the
  Twin Earth Geospatial Transform Contract's, with the engine mapping
  [East, Up, −North].
- **`journal`** — the StateJournal (Extraction 002's contract) in Rust.
  Synchronous, as the Python is; the browser port's async queue was a
  SubtleCrypto accommodation and does not appear here.
- **`canonical`** — the Python-compatible canonical JSON both the
  journal and future schema work hash and sign against.

## The anchors are the conformance suite

`core/tests/fixtures/anchors.json` is a **verbatim copy of Twin Earth
NYC's canonical anchor registry** (`Humank1nd/twin-earth-nyc`,
`data/anchors.json`: 25 geo anchors + 10 scale anchors, Times Square,
with tolerance budgets). `scripts/project-anchors.mjs` projects the
registry through the verified JS transform into golden ENU vectors, and
the Rust test must reproduce **all 25 anchors to under a micrometer**.
The registry's own invariant validators remain its home repo's suite;
here the anchors serve as ground truth for the transform.

## Proofs (cargo test, 2026-10-28: 3 passed)

- `journal_matches_the_quarrys_python_checksums` — the Rust journal
  reproduces the Python source's world hash, all four entry checksums,
  and the through-tick checksum **exactly**. The chain now exists in
  three implementations (Python, JS, Rust) with one set of values.
- `journal_replay_is_deterministic` — same inputs, same head.
- `geodesy_reproduces_the_anchor_registry` — 25/25 anchors within
  1e-6 m on every axis.

## Provenance

Pre-existing: the transform math and journal design (the quarry), the
transform contract and anchor registry (Twin Earth NYC). Built this
week: the Rust crate, the fixture generator, the parity tests, this
record.

## The adaptation sequence from here (not yet done)

1. WASM binding for the core, so the page's three.js layer draws state
   the core owns instead of computing its own.
2. Twin Earth NYC's twelve JSON schemas become the core's type layer.
3. The Unreal/Cesium lane consumes the same core when it resumes; the
   Python quarry remains the parity oracle.
