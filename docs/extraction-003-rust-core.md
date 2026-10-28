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

## Docking addendum (2026-10-28)

The 25 geo anchors now also stand on the live island: `data/anchors-enu.json` carries the registry records joined with their projected positions; the page renders them as red points at Times Square, and clicking one reads its canonical record (id, name, type, surveyed tolerance) and journals the reading as a selection tick. The 10 scale anchors have no position and remain registry-only.

## Addendum (2026-10-28): the core drives the page

The WASM binding is built and committed at `pkg/` (wasm-bindgen
0.2.129; recipe: `cargo build --target wasm32-unknown-unknown
--release`, then `wasm-bindgen --target web --out-dir ../pkg` on the
release artifact). The page reaches the core through
`src/core-journal.js`:

- The island's journal now runs in Rust. Its checksums are the same
  values the Python source produces — the machine changed, the chain
  did not. `src/journal.js` remains as the fallback if the WASM ever
  fails to load, and the journal line in the HUD says which engine is
  driving.
- At load, the core re-projects all 25 anchors in the visitor's own
  browser and measures itself against the stored positions; the check
  is written into the journal as its own tick.

Two platform lessons, both caught by testing the compiled artifact:
ticks cross the boundary as i32 because wasm-bindgen maps i64 to
BigInt and the island's ticks are plain counters; and `SystemTime`
panics on wasm32, so browser entries carry recorded_at 0.0 — the field
is unhashed by the source's design, so determinism is untouched.

Proof: `scripts/test-wasm.mjs` runs the compiled core (nodejs-target
build of the same crate) against the parity fixtures — 5 checks
passed, entry checksums identical to the Python fixture, anchor
reproduction max delta 1.4e-9 m.
