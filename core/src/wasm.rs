//! WebAssembly surface of the core — the page's doorway into Rust.
//! Everything crossing this boundary is plain data (numbers and JSON
//! strings), so the values the browser computes are the same values the
//! native parity tests proved: the journal's checksums do not change
//! because a different machine runs them.

use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::geo::{enu, Origin};
use crate::journal::{hash_world_state, StateJournal};

/// Project one WGS84 point into the frame of the given origin.
/// Returns [east, north, up] in meters.
#[wasm_bindgen]
pub fn core_enu(
    origin_lat: f64,
    origin_lon: f64,
    origin_elev: f64,
    lat: f64,
    lon: f64,
    elev: f64,
) -> Vec<f64> {
    let p = enu(
        &Origin { lat: origin_lat, lon: origin_lon, elev: origin_elev },
        lat,
        lon,
        elev,
    );
    vec![p.east, p.north, p.up]
}

/// hash_world_state over a JSON stats string.
#[wasm_bindgen]
pub fn core_hash_world_state(stats_json: &str) -> Result<String, JsError> {
    let stats: Value =
        serde_json::from_str(stats_json).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(hash_world_state(&stats))
}

/// The StateJournal, driven from the page. Payloads cross as JSON
/// strings; the canonical form and the chain are the Rust core's own.
#[wasm_bindgen]
pub struct CoreJournal {
    inner: StateJournal,
}

#[wasm_bindgen]
impl CoreJournal {
    #[wasm_bindgen(constructor)]
    pub fn new() -> CoreJournal {
        CoreJournal { inner: StateJournal::new() }
    }

    /// Append one entry; returns its checksum. Ticks cross the boundary
    /// as i32 on purpose: wasm-bindgen maps i64 to BigInt, and the
    /// island's ticks are small counters that should stay plain
    /// JavaScript numbers. The core's journal keeps i64 internally.
    pub fn append(&mut self, event_type: &str, tick: i32, payload_json: &str) -> Result<String, JsError> {
        let payload: Value = if payload_json.trim().is_empty() {
            Value::Object(Default::default())
        } else {
            serde_json::from_str(payload_json).map_err(|e| JsError::new(&e.to_string()))?
        };
        Ok(self.inner.append(event_type, tick as i64, payload).checksum)
    }

    #[wasm_bindgen(getter)]
    pub fn length(&self) -> usize {
        self.inner.entries().len()
    }

    #[wasm_bindgen(getter)]
    pub fn head(&self) -> String {
        self.inner.last_checksum().to_string()
    }

    pub fn verify(&self) -> bool {
        self.inner.verify_chain()
    }

    pub fn checksum_until_tick(&self, tick: i32) -> String {
        self.inner.checksum_until_tick(tick as i64)
    }
}
