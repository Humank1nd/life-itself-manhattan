# Ask the Island — design and model contract

**Founder's ruling (2026-10-28): the Meta model's job in this experience is
"Ask the Island."** A visitor asks the island a question in plain words; the
island answers from its own real records and lights the answer up on itself.

**Founder's ruling (2026-10-28): the $150 Meta Model API credits are saved
for later.** Development runs on the local interpreter. Credits get checked
and spent only when the build approaches its demo freeze, on the founder's
word. Nothing in development calls the live API.

## The honesty rule

The island only ever says what the data proves. Every number in every answer
is computed locally from the NYC Open Data records (45,172 buildings: BIN,
roof height, construction year, NTA neighborhood). The model interprets and
phrases; it never supplies facts. If the record does not contain something,
the island says so.

## The contract

A question becomes a **structured query** — the only thing an interpreter
may return:

```json
{ "nb": "East Village", "nbPrefix": null,
  "yrMin": null, "yrMax": 1944,
  "hMin": null, "hMax": 15.24,
  "sort": null }
```

- `nb` / `nbPrefix`: a 2020 NTA neighborhood name, exact or by prefix.
- `yrMin` / `yrMax`: construction-year bounds from the city record.
- `hMin` / `hMax`: roof-height bounds in meters.
- `sort`: `tallest` | `shortest` | `oldest` | `newest` | null.

`src/ask.js` executes the query client-side over the loaded records and
computes the answer's statistics. Matches render as gold wireframes on the
island (top 200 for superlative questions, up to 4,000 for filters).

## The two interpreters

1. **The Meta model** (the submission configuration). The page POSTs
   `{ question }` to `window.ASK_ENDPOINT`; the endpoint calls the Meta
   Model API with the query schema above and returns the model's JSON.
   The API credential lives server-side at the endpoint, never in this
   repo or in the page. Activation happens at the demo freeze, together
   with the credits check.
2. **The local grammar** (`interpretLocal` in `src/ask.js`). A small,
   deterministic reader: neighborhood names and aliases, pre-war/post-war,
   before/after/in a year, decades, height bounds in feet or meters,
   superlatives. It carries development and is the permanent fallback if
   the endpoint is unreachable — the island never goes mute.

Verified locally against the real records (2026-10-28): "pre-war buildings
under 50 feet in the East Village" → 589 buildings, oldest built 1795;
"tallest building in Manhattan" → BIN 1090180, 1,550 ft, built 2020.
