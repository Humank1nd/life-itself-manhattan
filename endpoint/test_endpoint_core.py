"""Local checks for endpoint_core. Run: python3 endpoint/test_endpoint_core.py
No network, no SDKs — this tests the validation gate only."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from endpoint_core import NEIGHBORHOODS, parse_and_validate  # noqa: E402

passed = 0


def ok(raw, expect):
    global passed
    got = parse_and_validate(raw)
    assert got == expect, f"{raw!r} -> {got!r}, expected {expect!r}"
    passed += 1


def bad(raw):
    global passed
    try:
        parse_and_validate(raw)
    except ValueError:
        passed += 1
        return
    raise AssertionError(f"{raw!r} should have been rejected")


assert len(NEIGHBORHOODS) == 38, NEIGHBORHOODS

ok('{"nb": "East Village", "yrMax": 1944, "hMax": 15.24}',
   {"nb": "East Village", "yrMax": 1944, "hMax": 15.24})
ok('```json\n{"sort": "tallest"}\n```', {"sort": "tallest"})
ok('{"nb": "east village"}', {"nb": "East Village"})            # case canonicalized
ok('{"nbPrefix": "Harlem", "sort": "oldest"}', {"nbPrefix": "Harlem", "sort": "oldest"})
ok('{"nb": "Atlantis", "yrMin": 2000}', {"yrMin": 2000})        # unknown place dropped, rest kept
ok('{"yrMin": 1200, "hMax": 99999}', {"yrMin": 1600, "hMax": 600.0})  # clamped
ok('{}', {})                                                    # whole island is a legal query
ok('{"sort": "loudest", "yrMax": 1900}', {"yrMax": 1900})       # bad sort dropped
bad('the answer is 589 buildings')                              # prose is not a query
bad('{"nb": "East Village", "dropTable": true}')                # unknown field rejected
bad('[1, 2, 3]')                                                # not an object
bad('')

print(f"endpoint_core: {passed} checks passed")
