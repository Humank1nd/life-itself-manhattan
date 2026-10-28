"""Ask the Island endpoint — pure logic (no network, no SDK imports).

The model's only job: translate a plain-words question about Manhattan
buildings into the structured query JSON defined in docs/ask-the-island.md.
The browser executes the query over the real records; every number in the
answer is computed there. This module builds the model's instructions and
validates/sanitizes whatever the model returns, so a malformed or
hallucinated reply can never reach the island — the endpoint answers 422
and the page falls back to its local interpreter.
"""

import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "neighborhoods.json"), encoding="utf-8") as f:
    NEIGHBORHOODS = json.load(f)

_SORTS = {"tallest", "shortest", "oldest", "newest"}
_KEYS = {"nb", "nbPrefix", "yrMin", "yrMax", "hMin", "hMax", "sort"}

INSTRUCTIONS = """You translate a visitor's question about Manhattan buildings into a structured JSON query. You return ONLY the JSON object — no prose, no code fences.

Schema (omit fields that do not apply):
{
  "nb": exact neighborhood name from the list below, or omit,
  "nbPrefix": a shared beginning of several neighborhood names (e.g. "Harlem", "Upper West Side", "Midtown"), or omit,
  "yrMin": earliest construction year (number), or omit,
  "yrMax": latest construction year (number), or omit,
  "hMin": minimum roof height in METERS (number), or omit,
  "hMax": maximum roof height in METERS (number), or omit,
  "sort": "tallest" | "shortest" | "oldest" | "newest", or omit
}

Rules:
- Heights in the question may be feet; convert feet to meters (1 ft = 0.3048 m).
- "Pre-war" means built by 1944 (yrMax 1944). "Post-war" means yrMin 1945.
- Neighborhoods are New York City's official 2020 NTA names. The full list:
""" + ", ".join(NEIGHBORHOODS) + """

Examples:
Q: "pre-war buildings under 50 feet in the East Village"
A: {"nb": "East Village", "yrMax": 1944, "hMax": 15.24}
Q: "tallest building in Manhattan"
A: {"sort": "tallest"}
Q: "oldest buildings in Harlem"
A: {"nbPrefix": "Harlem", "sort": "oldest"}
Q: "what went up after 2010 near Wall Street"
A: {"nb": "Financial District-Battery Park City", "yrMin": 2011}
"""


def _num(value, lo, hi):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(lo, min(hi, value))


def parse_and_validate(raw_text):
    """Turn the model's raw reply into a safe query dict, or raise ValueError."""
    if not isinstance(raw_text, str):
        raise ValueError("model reply was not text")
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"model reply was not JSON: {e}") from e
    if not isinstance(obj, dict):
        raise ValueError("model reply was not a JSON object")

    q = {}
    for key in obj:
        if key not in _KEYS:
            raise ValueError(f"unknown query field: {key}")

    nb = obj.get("nb")
    if isinstance(nb, str) and nb.strip():
        match = next((n for n in NEIGHBORHOODS if n.lower() == nb.strip().lower()), None)
        if match:
            q["nb"] = match
    prefix = obj.get("nbPrefix")
    if isinstance(prefix, str) and prefix.strip() and "nb" not in q:
        p = prefix.strip()
        if any(n.startswith(p) for n in NEIGHBORHOODS):
            q["nbPrefix"] = p

    yr_min = _num(obj.get("yrMin"), 1600, 2100)
    yr_max = _num(obj.get("yrMax"), 1600, 2100)
    if yr_min is not None:
        q["yrMin"] = int(yr_min)
    if yr_max is not None:
        q["yrMax"] = int(yr_max)
    h_min = _num(obj.get("hMin"), 0, 600)
    h_max = _num(obj.get("hMax"), 0, 600)
    if h_min is not None:
        q["hMin"] = float(h_min)
    if h_max is not None:
        q["hMax"] = float(h_max)

    sort = obj.get("sort")
    if isinstance(sort, str) and sort in _SORTS:
        q["sort"] = sort
    return q
