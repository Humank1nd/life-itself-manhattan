# Rat POV Manhattan — simulation architecture (proposal, no code)

A layered-metabolism city under the human city: waste becomes food,
food becomes motion, one species' leftovers become another's
opportunity. Narrow vertical slice first (one block, one colony);
full food web explicitly later. Deterministic by default; cognition
only where it pays.

## Non-negotiables (inherited)

- Deterministic tick, seeded agents, gated modules, no pixels or model
  weights in the repo, cloud CI on every touching PR.
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
- The GitHub CI workflow exercises this gate for pull requests and pushes; a push is already public when push-triggered CI starts. Local pre-push checks are advisable, and repository permissions/protection may be needed for enforceable publication control.
- Release/deployment pipelines must also inspect their own produced artifacts. Passing a source-tree scan cannot prove that some unrelated build or upload is clean.
- The entire published work must remain original in expression, not merely have familiar names removed.

## Optional local overlay (not published)

The optional loader uses the versioned `life-itself-licensed-overlay/1.0.0` manifest schema. It returns disabled unless explicitly enabled and supplied a valid manifest. Fixtures use invented placeholder text only. Private experimentation does not imply authorization to publish third-party material. The public product must work identically without the overlay.

## Temporal setting: an original ecological shock (founder decision)

The simulation opens with a sudden 50% population cull across all
modeled species — rats, roaches, and the human systems that produce
waste and sanitation — followed by species-dependent recovery. No
licensed setting, no third-party characters, locations, or events are
referenced anywhere in the scenario; the mechanics (abrupt halving,
disrupted sanitation schedules, vacant-shelter expansion, phased
recovery) are identical with or without any borrowed fiction, so the
commercial path stays open under the repo's licensing posture.

Three simulated phases: immediate collapse (familiar scent trails and
food sources violently disrupted), colony adaptation over subsequent
years (expansion into abandoned areas against declining human food
supply), and a changed urban ecosystem at the far horizon. The rat
knows nothing of causes — only disappearance, disruption, and
transformation of habitat. That constraint is load-bearing: all
knowledge in the sim is local and sensory, never expositional.

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
