"""Parity oracle for Extraction 002.

Builds a journal with the QUARRY'S OWN state_journal.py (passed as argv[1],
a verbatim copy of Humank1nd/life-itself genesis/state_journal.py) and the
fixed inputs shared with scripts/test-journal.mjs, then writes the expected
checksums to scripts/parity-expected.json. The JS port must reproduce every
value exactly — checksum-for-checksum, not approximately.

Usage: python3 scripts/parity-journal.py /path/to/state_journal.py
"""

import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("quarry_state_journal", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
sys.modules["quarry_state_journal"] = mod  # @dataclass looks its module up here
spec.loader.exec_module(mod)

STATS = {
    "buildings": 45172,
    "buildingsWithYear": 44345,
    "buildingsWithNeighborhood": 44929,
    "neighborhoods": 38,
    "origin": {"lat": 40.758, "lon": -73.9855, "name": "Times Square"},
}

world_hash = mod.hash_world_state(STATS)
j = mod.StateJournal()
entries = [
    j.append(mod.JournalEventType.SNAPSHOT, 0, STATS),
    j.append(mod.JournalEventType.TICK_BEGIN, 1, {"action": "ask"}),
    j.append(mod.JournalEventType.ACTION, 1, {
        "kind": "ask",
        "via": "model",
        "question": "pre-war buildings under 50 feet in the East Village",
        "query": {"nb": "East Village", "yrMax": 1944, "hMax": 15.24},
        "matches": 589,
        "sampleBins": [1004983],
    }),
    j.append(mod.JournalEventType.TICK_END, 1, {"world_hash": world_hash}),
]

expected = {
    "source": "Humank1nd/life-itself genesis/state_journal.py, run verbatim 2026-10-28",
    "worldHash": world_hash,
    "checksums": [e.checksum for e in entries],
    "verifyChain": j.verify_chain(),
    "checksumUntilTick1": j.checksum_until_tick(1),
}
out = Path(__file__).with_name("parity-expected.json")
out.write_text(json.dumps(expected, indent=1) + "\n", encoding="utf-8")
print(json.dumps(expected, indent=1))
print("wrote", out)
