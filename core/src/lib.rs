//! twin-core — the deterministic heart of the island, in Rust.
//!
//! Two ports live here, both extracted from the founder's existing work
//! and both held to parity proofs rather than trust:
//! - `geo`: the WGS84 -> ECEF -> ENU transform (quarry: life-itself
//!   `multiverse/vision/cesium_bridge.py`; contract: twin-earth-nyc
//!   `docs/part-04-earth-reality/geospatial-transform-contract.md`).
//!   Proven against Twin Earth NYC's canonical anchor registry.
//! - `journal`: the hash-chained StateJournal (quarry: life-itself
//!   `genesis/state_journal.py`). Proven checksum-for-checksum against
//!   the Python source's own output.
//!
//! The stack rule (founder's system, 2026-10-28): Rust owns the truth,
//! three.js renders it, Node 24 runs the tools.

pub mod canonical;
pub mod geo;
pub mod journal;

#[cfg(target_arch = "wasm32")]
pub mod wasm;
