// The island's doorway into the Rust core (core/, crate twin-core,
// built to pkg/ by wasm-bindgen). When the WASM core loads, the journal
// and the geodesy run in Rust — the same code, and the same checksums,
// as the native parity tests prove. When it cannot load, the page falls
// back to the JavaScript journal (src/journal.js) so the island never
// goes mute; journal.engine says which one is driving.

import init, { CoreJournal, core_enu, core_hash_world_state } from '../pkg/twin_core.js';
import { StateJournal, hashWorldState as jsHashWorldState } from './journal.js';

export const JournalEventType = {
  TICK_BEGIN: 'tick_begin',
  TICK_END: 'tick_end',
  ACTION: 'action',
  SNAPSHOT: 'snapshot',
};

let wasm = null;
try {
  await init();
  wasm = { CoreJournal, core_enu, core_hash_world_state };
} catch {
  wasm = null;
}

export async function hashWorldState(stats) {
  if (wasm) return wasm.core_hash_world_state(JSON.stringify(stats));
  return jsHashWorldState(stats);
}

/// Project one WGS84 point through the core. Returns [east, north, up]
/// in meters, or null when the core is not driving.
export function projectEnu(origin, lat, lon, elev) {
  if (!wasm) return null;
  const r = wasm.core_enu(origin.lat, origin.lon, origin.elev, lat, lon, elev);
  return [r[0], r[1], r[2]];
}

export async function createJournal() {
  if (wasm) {
    const core = new wasm.CoreJournal();
    const shadow = [];
    const j = {
      engine: 'rust',
      onAppend: null,
      get entries() { return shadow; },
      get lastChecksum() { return core.head; },
      async append(type, tick, payload = {}) {
        const checksum = core.append(type, tick, JSON.stringify(payload));
        const entry = {
          sequence: shadow.length,
          tick,
          event_type: type,
          payload,
          previous_hash: shadow.length ? shadow[shadow.length - 1].checksum : '',
          checksum,
        };
        shadow.push(entry);
        if (j.onAppend) j.onAppend(entry);
        return entry;
      },
      async verifyChain() { return core.verify(); },
      async checksumUntilTick(tick) { return core.checksum_until_tick(tick); },
    };
    return j;
  }
  const js = new StateJournal();
  js.engine = 'js';
  return js;
}
