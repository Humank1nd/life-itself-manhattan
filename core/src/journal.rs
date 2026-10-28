//! The StateJournal, ported from the quarry's genesis/state_journal.py
//! (Extraction 002). The contract is unchanged: each entry's checksum is
//! SHA-256 over the canonical JSON of {sequence, tick, event_type,
//! payload, previous_hash}; genesis previous_hash is ""; verify_chain
//! recomputes every link; checksum_until_tick hashes the concatenated
//! tick_end checksums. recorded_at rides along unhashed.
//!
//! Unlike the browser port, Rust hashes synchronously, so append is a
//! plain call — the async queue in src/journal.js was a SubtleCrypto
//! accommodation, not part of the design.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::canonical::canonical;

pub const TICK_BEGIN: &str = "tick_begin";
pub const TICK_END: &str = "tick_end";
pub const ACTION: &str = "action";
pub const SNAPSHOT: &str = "snapshot";

pub fn sha256_hex(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn hash_world_state(stats: &Value) -> String {
    sha256_hex(&canonical(stats))
}

fn event_hash(
    sequence: u64,
    tick: i64,
    event_type: &str,
    payload: &Value,
    previous_hash: &str,
) -> String {
    let blob = json!({
        "sequence": sequence,
        "tick": tick,
        "event_type": event_type,
        "payload": payload,
        "previous_hash": previous_hash,
    });
    sha256_hex(&canonical(&blob))
}

#[derive(Debug, Clone, PartialEq)]
pub struct JournalEntry {
    pub sequence: u64,
    pub tick: i64,
    pub event_type: String,
    pub payload: Value,
    pub previous_hash: String,
    pub checksum: String,
    pub recorded_at: f64,
}

#[derive(Debug, Default)]
pub struct StateJournal {
    entries: Vec<JournalEntry>,
}

impl StateJournal {
    pub fn new() -> Self {
        Self { entries: Vec::new() }
    }

    pub fn entries(&self) -> &[JournalEntry] {
        &self.entries
    }

    pub fn last_checksum(&self) -> &str {
        self.entries.last().map(|e| e.checksum.as_str()).unwrap_or("")
    }

    pub fn append(&mut self, event_type: &str, tick: i64, payload: Value) -> JournalEntry {
        let sequence = self.entries.len() as u64;
        let previous_hash = self.last_checksum().to_string();
        let checksum = event_hash(sequence, tick, event_type, &payload, &previous_hash);
        let entry = JournalEntry {
            sequence,
            tick,
            event_type: event_type.to_string(),
            payload,
            previous_hash,
            checksum,
            recorded_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0),
        };
        self.entries.push(entry.clone());
        entry
    }

    pub fn verify_chain(&self) -> bool {
        let mut previous_hash = String::new();
        for (expected, entry) in self.entries.iter().enumerate() {
            if entry.sequence != expected as u64 {
                return false;
            }
            if entry.previous_hash != previous_hash {
                return false;
            }
            let checksum = event_hash(
                entry.sequence,
                entry.tick,
                &entry.event_type,
                &entry.payload,
                &entry.previous_hash,
            );
            if checksum != entry.checksum {
                return false;
            }
            previous_hash = entry.checksum.clone();
        }
        true
    }

    pub fn checksum_until_tick(&self, tick: i64) -> String {
        let mut concat = String::new();
        for entry in &self.entries {
            if entry.event_type != TICK_END {
                continue;
            }
            if entry.tick > tick {
                break;
            }
            concat.push_str(&entry.checksum);
        }
        sha256_hex(&concat)
    }
}
