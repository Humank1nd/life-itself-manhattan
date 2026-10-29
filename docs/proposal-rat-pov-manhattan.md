# Rat POV Manhattan — simulation architecture (proposal, no code)

A layered-metabolism city under the human city: waste becomes food,
food becomes motion, one species' leftovers become another's
opportunity. Narrow vertical slice first (one block, one colony);
full food web explicitly later. Deterministic by default; cognition
only where it pays.

## Non-negotiables (inherited)

- Deterministic tick, seeded agents, gated modules, no pixels or model
  weights in the repo, local zero-infrastructure tests on every touching change; Firebase preview channels for visual review. GitHub Actions and Pages are not deployment gates.
- The existing P016/P017 stack is the foundation, not a reference:
  traits, motives, action contract, citizen agency, resumption,
  checkpoints, journal. Rat POV reuses all of it.
- AXE does not micromanage roaches. Cheap deterministic behavior for
  the many; richer cognition only for focal individuals.

## Layer map — what exists vs what is new

| Layer | Status | Home |
| --- | --- | --- |
| Waste / nutrient lifecycle (fresh → rotting → bloom → residue → cleared) | NEW, deterministic | `src/patch-metabolism.js` (proposed) |
| Roach population math (logistic, capacity from waste+moisture+warmth) | NEW, deterministic | same module, population nodes not individuals |
| Roach-as-indicator (density ⇒ hidden-resource proxy) | NEW, derived read | same module |
| Rat motives | EXTEND `src/motives.js` | add `thirst`, `safety`; keep the 8 human keys byte-identical |
| Rat traits | REUSE `src/traits.js` as-is | 16 traits already cover boldness/curiosity/sociality axes |
| Rat perception (scent, memory-trace, warmth, vibration) | EXTEND `action-contract.js` observation kinds | new `kind` strings, same schema/versioning |
| Colony territories | REUSE zone pattern | nest-siteisch `ZONE_DEFINITIONS`-style registry, `radiusKm` small |
| Focal rat decisions | EXTEND `src/citizen-agency.js` policy | new `proposeRat` branch; same commit/apply machinery |
| Focal rat memory | NEW (needs P017.4) | observation log + patch memory, checkpoint-persisted |
| AXE override point | STUB | `propose` accepts an approved-cognition hook; default null, fails closed without it |

## New modules (Phase A scope only)

- `src/patch-metabolism.js` — waste-node state machine + roach
  logistic growth + capacity from patch conditions + sanitation events
  as world-config resets. Pure, seeded, gated like everything else.
- `src/rat-colony.js` — colony registry: nest site, territory radius,
  member roster, patch memory (per-colony learned values with decay).
- Phase A world: one downtown block inside SUMO coverage (pilot
  candidate: Wall St & Broadway — surveyed, on-lane, verifiable),
  3–5 waste sources, 1 restaurant pulse, 1 alley, 1 sewer entrance,
  1 subway vent, 1 sanitation cycle; 10–20 rats as seeded walkers
  with rat motive profiles; roaches as population nodes.

## Public-world and variant-boundary doctrine

The public codebase represents an original, source-grounded Manhattan world. Its story, ecological disruption, characters, scenes, and words must be independently expressive and usable without third-party entertainment properties. Do not commit character names, franchise-specific terms, logos, assets, or story text drawn from protected fictional settings. The project's internal branch metaphor calls public integration a *timeline collapse*: only independently shippable material may land.

Any private, separately held interpretation or experimental overlay is **not source for this repository**. Keep it outside Git and deployment inputs, and obtain rights review before any external use. `.gitignore` reduces accidental staging but does NOT forbid `git add -f`, prevent a push, protect other directories, or grant distribution rights.

## Public content safeguards

- `licensed/` is ignored by Git as a convenience, but must never be tracked or included in a release. Local-only optional inputs are disabled by default; valid input plus an explicit flag is required to activate the experimental loader.
- `npm run test:public-tree` checks the **current checkout's tracked files** for restricted paths and a narrow set of explicitly prohibited franchise-specific identifiers. It rejects force-added and renamed files with those signatures, including non-`licensed/` paths. This is a tripwire, not a comprehensive copyright clearance or an all-ref guarantee.
- GitHub Actions are disabled. Run `npm run test:public-tree` locally before every push and review its results; this gate checks the local tracked tree but cannot prevent publication if bypassed. Firebase preview and production artifacts require separate inspection before deployment.
- Release/deployment pipelines must also inspect their own produced artifacts. Passing a source-tree scan cannot prove that some unrelated build or upload is clean.
- The entire published work must remain original in expression, not merely have familiar names removed.

## Optional local overlay (not published)

The optional loader uses the versioned `life-itself-licensed-overlay/1.0.0` manifest schema. It returns disabled unless explicitly enabled and supplied a valid manifest. Fixtures use invented placeholder text only. Private experimentation does not imply authorization to publish third-party material. The public product must work identically without the overlay.

## Temporal setting: fourth-year survival (founder revision)

**This supersedes the former five-year playable timeline.** The unexplained ecological catastrophe occurred roughly three years before the playable year starts. The player controls one surviving rat through the **fourth year** of the changed city: **365 in-world days**, leading toward a hidden, ordinary-looking final environmental interaction. Earlier years exist as authoritative background world history, not playable day-by-day time. No third-party fictional universe, named character, or protected story beat belongs in a pushed file or deployed artifact.

The focal rat has a **one-year expected-life design premise**, not a scientifically fixed lifespan or guaranteed end date. Hunger, dehydration, injury, exposure, and predators are meaningful mortal risks; biological age and prior conditions may affect resilience. The player never receives an exposition dump about the catastrophe or its global implications.

### Player pacing and time compression

- **Main path target:** 30–60 real hours to traverse the in-world year and reach the original ending.
- **Completionist target:** 90–120+ real hours for exploration, scent mapping, colony relationships, nest preservation, and ecological observations in that *same* year.
- **Active day:** approximately 12–20 real minutes at baseline, adjustable after playtesting. A continuous 365-day playthrough at that rate would require roughly 73–122 hours, so the shorter main path **requires explicit rest, nesting, and safe time-skip compression**. A flat constant-speed clock cannot meet both time targets.
- **Two clocks:** stable 5-second authoritative simulation ticks for active areas; deterministic coarse daily/weekly advancement for unattended patches. A time skip must apply resource depletion, nutrient conversion, roach population changes, colony movements, hazards, aging, and journal receipts in a reproducible order, with no free survival.
- **Seasonal arcs:** spring establishes shelter and scent-memory; summer accelerates spoilage and exposure; autumn tightens resources and territorial pressure; winter intensifies shelter and energy demands. Region-specific conditions remain source-grounded or labeled simulation assumptions.
- **Ending:** an otherwise mundane small-creature interaction can become consequential; keep it fully original, sensory, and independently meaningful, without named external lore or a particular protected sequence.
- **Mortality:** death ends the focal rat's life. Whether the player restarts or continues as a new rat must preserve world causality and be a separate explicit design choice; do not silently resurrect the same identity.

### Verification gates for the year clock

1. Exactly 365 in-world days progress monotonically without tick/revision rollback, with deterministic leap/calendar semantics declared.
2. Active stepping, rest, and batched advancement produce equivalent canonical outcomes for the same modeled inputs and RNG stream, or differences are explicitly versioned as approximations—not falsely asserted bit-identical.
3. A full-year accelerated pure-CPU reference test completes with finite, nonnegative nutrients and valid citizens, rat age, colony data, and event order.
4. Post-commit checkpoint+restore across seasonal boundaries reproduces the same world and deduplication state; no event effect executes twice.
5. Main-path and completionist hours are **targets to measure in playtests**, not guarantees from the day-length formula.

### Renderer and world-model boundary

A renderer/game-engine donor may inspire separation of update loops from visual presentation, but does not replace the existing Life Itself authoritative ENU geography, motives, action contracts, journal, or checkpoints. Scents and resource fields are simulation state. Three.js, WebGPU, or future neural imagery consume snapshots; none author the canonical world. Do not import external engine code without an independent source/license and compatibility review.

## Explicitly out of Phase A (including any licensed framing)

Pigeons, cats, raccoons, insects-as-individuals, disease pressure,
seasonal variation, human indirect effects, any neural model, any
GPU, any live data feed. The 8-bit human HUD stays; rats get no HUD
until an observational interface is separately approved.

## Acceptance gates (each a Node gate like the rest)

1. Nutrient books balance: waste in == converted + residual + removed,
   per patch per tick, within float tolerance.
2. Roach capacity tracks conditions: zero waste ⇒ decay to zero;
   restored waste ⇒ logistic regrowth, never negative, never NaN.
3. Roach density reads as resource proxy: high-density patches rank
   above low-density ones for a fixed rat query.
4. Rat decisions stay lawful: same commit/apply machinery, same
   teleport and stranger rejections, lane-bounded movement.
5. Determinism: identical seed ⇒ identical colony history; shutdown
   → restore ⇒ identical continuation (L2b pattern).

## Open founder decisions

- New motive keys (`thirst`, `safety`) vs reusing the 8 human keys.
- Pilot block selection (recommendation: Wall/Broadway, surveyed).
- Whether focal-rat memory ships inside P017.4 or as its own slice.
