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

## Freeze build (2026-10-28, founder chose "Model endpoint (the freeze)")

The endpoint is built and committed under `endpoint/`: a Modal web app
(`modal_app.py`) whose transport reuses the DreamSuite cloud provider's
proven invariants (official host `https://api.meta.ai/v1`, Responses API,
`store: false`, zero retries, bounded output, server-side credential in a
Modal secret the founder creates from his own terminal). The model's
instructions and the reply-validation gate live in `endpoint_core.py`
(12 local checks pass: unknown neighborhoods dropped, unknown fields
rejected, prose rejected, bounds clamped). `index.html` carries the
`window.ASK_ENDPOINT` switch, empty until deploy. Remaining, in order:
founder confirms the $150 credit on the billing page, creates the secret,
deploys, and the URL is set. Steps: `endpoint/README.md`.

**ACTIVATED (2026-10-28, verified end to end).** Credits confirmed on the
billing page ($149.31 remaining, card on file). Secret created by the
founder; endpoint deployed at
`https://humank1nd--ask-the-island-ask-api.us-east.modal.run`; the page's
`ASK_ENDPOINT` points at its `/ask`. Live proof, from outside, against the
public URL: "pre-war buildings under 50 feet in the East Village" →
`{"nb": "East Village", "yrMax": 1944, "hMax": 15.24}` (the exact query
whose execution over the records yields 589 buildings), and "oldest
buildings in Harlem" → `{"nbPrefix": "Harlem", "sort": "oldest"}`. The
road here is recorded honestly: a first secret stored the literal word
KEY (401s), a second stored an empty value (the SDK raised at client
construction and crash-looped the container, silencing even /health), and
a 300-token output budget starved a reasoning model that spends ~640
tokens thinking before it answers. Fixes: credential built per request
and never at app start, output budget 2048, page-side 25 s cap with local
fallback.

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
The East Village answer was also confirmed on the live page the same day.

## Adopted ideas (2026-10-28, founder's ruling)

A parallel implementation was built in a local clone on the founder's
laptop by another agent and never pushed. The founder reviewed the
comparison and ruled: keep this build; adopt two presentation ideas from
it — preset question chips and the camera flying to frame an answer's
buildings. Both were implemented fresh in this repo (`src/wireframe.js`,
`index.html`); none of its code, era labels, bounding-box regions, live-by-
default model wiring, or in-browser key storage came over.
