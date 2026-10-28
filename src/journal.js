// Extraction 002 — the StateJournal, ported from the quarry.
// Source: Humank1nd/life-itself, genesis/state_journal.py (read firsthand
// 2026-10-28; the runtime's own usage in genesis/runtime.py wraps every
// tick in tick_begin / tick_end, with tick_end carrying the world hash).
//
// The port keeps the source's contract exactly:
//   entry hash = SHA-256 of the canonical JSON of
//     {sequence, tick, event_type, payload, previous_hash}
//   canonical JSON = keys sorted at every depth, separators "," and ":",
//     strings escaped the way Python's json.dumps escapes them
//     (ensure_ascii), numbers in shortest round-trip form.
//   genesis previous_hash = "" ; verify = recompute every link;
//   checksum_until_tick = SHA-256 of the concatenated tick_end checksums.
// recorded_at rides along unhashed, exactly as in the source.
//
// Two runtime mappings, both forced by the platform and recorded in
// docs/extraction-002-state-journal.md: SubtleCrypto is asynchronous, so
// appends are queued promises instead of sync calls; and the island's
// tick is one completed visitor interaction, wrapped tick_begin/tick_end
// the way the runtime wraps a simulation step.
//
// Cross-checked checksum-for-checksum against the Python source itself:
// scripts/test-journal.mjs + scripts/parity-journal.py.

export const JournalEventType = {
  TICK_BEGIN: 'tick_begin',
  TICK_END: 'tick_end',
  ACTION: 'action',
  SNAPSHOT: 'snapshot',
};

function escapeString(s) {
  // Python json.dumps(string) with ensure_ascii=True.
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (cp < 0x20 || cp > 0x7e) {
      if (cp > 0xffff) {
        const v = cp - 0x10000;
        out += '\\u' + (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
        out += '\\u' + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
      } else {
        out += '\\u' + cp.toString(16).padStart(4, '0');
      }
    } else out += ch;
  }
  return out + '"';
}

export function canonical(value) {
  // Canonical JSON, byte-identical to Python json.dumps(value,
  // sort_keys=True, separators=(",", ":")) for the payload domain the
  // island uses (null, booleans, numbers, strings, arrays, objects).
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number in journal payload');
    return String(value);
  }
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => escapeString(k) + ':' + canonical(value[k])).join(',') + '}';
}

const encoder = new TextEncoder();

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashWorldState(stats) {
  // The source's hash_world_state: SHA-256 of the canonical stats.
  return sha256Hex(canonical(stats));
}

async function eventHash(sequence, tick, eventType, payload, previousHash) {
  const blob = {
    sequence,
    tick,
    event_type: eventType,
    payload,
    previous_hash: previousHash,
  };
  return sha256Hex(canonical(blob));
}

export class StateJournal {
  constructor() {
    this._entries = [];
    this._tail = Promise.resolve();
    this.onAppend = null; // optional callback(entry), fired as entries land
  }

  get entries() {
    return [...this._entries];
  }

  get lastChecksum() {
    return this._entries.length ? this._entries[this._entries.length - 1].checksum : '';
  }

  append(eventType, tick, payload = {}) {
    const run = this._tail.then(async () => {
      const sequence = this._entries.length;
      const previousHash = this.lastChecksum;
      const checksum = await eventHash(sequence, tick, eventType, payload, previousHash);
      const entry = {
        sequence,
        tick,
        event_type: eventType,
        payload,
        previous_hash: previousHash,
        checksum,
        recorded_at: Date.now() / 1000,
      };
      this._entries.push(entry);
      if (this.onAppend) this.onAppend(entry);
      return entry;
    });
    this._tail = run.catch(() => {});
    return run;
  }

  async verifyChain() {
    let previousHash = '';
    for (let expected = 0; expected < this._entries.length; expected++) {
      const entry = this._entries[expected];
      if (entry.sequence !== expected) return false;
      if (entry.previous_hash !== previousHash) return false;
      const checksum = await eventHash(
        entry.sequence, entry.tick, entry.event_type, entry.payload, entry.previous_hash,
      );
      if (checksum !== entry.checksum) return false;
      previousHash = entry.checksum;
    }
    return true;
  }

  async checksumUntilTick(tick) {
    // SHA-256 over the concatenated checksums of tick_end entries, in
    // order, through the target tick — the source's checksum_until_tick.
    let concat = '';
    for (const entry of this._entries) {
      if (entry.event_type !== JournalEventType.TICK_END) continue;
      if (entry.tick > tick) break;
      concat += entry.checksum;
    }
    return sha256Hex(concat);
  }

  toJSONL() {
    return this._entries.map((e) => JSON.stringify(e)).join('\n') + (this._entries.length ? '\n' : '');
  }

  static fromJSONL(text) {
    const journal = new StateJournal();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      journal._entries.push(JSON.parse(line));
    }
    return journal;
  }
}
