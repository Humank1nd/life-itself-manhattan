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

## Hidden-setting structure (founder direction)

The shipped game never names, quotes, depicts, or alludes to any
licensed setting, character, dialogue, music, likeness, or plot event.
All knowledge in the sim is local and sensory; all text is original
expression. The true-timeline interpretation — a Manhattan five years
after half of all life vanished, 2018–2023 — is NEVER stated in the
product. It is player-inferred: the dates plus a combination-gated
epilogue written entirely in original words (a van, a storage-unit
console, ordinary crumbs and warmth, one footstep that is no longer
ordinary). Ideas (a disappearance, a span of years) are not any
party's expression; the product contains only its own.

Concretely: no Marvel proper nouns in code, docs, assets, strings, or
comments — including Snap, Blip, Thanos, Avengers, Endgame, Quantum
Tunnel, or any character name. The combination-gated epilogue is
reviewed under the same rule before it ships: if a line needs a
licensed reference to land, the line is cut, not the rule. The twist
must work as pure dramatic irony for players who never make the
connection, and as recognition for players who do.

## Timelines as branches, grounded in Earth-1218 (founder direction)

In Marvel's own map, Earth-1218 is our world: the universe where
superheroes do not exist and Marvel is fiction. We ground the repo
there. `main` is Earth-1218 — no capes, no Stones, no licensed proper
nouns in any committed file, on any pushed ref, on any branch. The
shipped game and every public branch stay inside that universe, where
the twist reads as dramatic irony rather than franchise content.

Variant timelines — branches that explore licensed-adjacent readings,
the combination-gated epilogue drafts, anything that names names —
exist **local-only and are never pushed**. The `licensed/` overlay
rule already enforces the mechanism (git-ignored means unpushable);
this states the doctrine: a pushed ref containing Marvel IP is a
policy violation no matter which branch it sits on, and the CI gate's
public-tree-clean assertion is its tripwire. Merges into `main` are
timeline collapses: only Earth-1218-compatible content survives them.

## Licensed-references toggle (private testing only)

Licensed text, if it is ever written, lives ONLY in a git-ignored
local `licensed/` directory with a `manifest.json` envelope
(`life-itself-licensed-overlay/1.0.0`). It is never committed, never
deployed — GitHub Pages artifacts cannot contain it, because git
cannot see it. `src/licensed-content.js` resolves to disabled unless
the caller explicitly opts in AND a valid manifest exists; malformed
anything stays off. The gate (`npm run test:licensed-content`) uses
SAMPLE placeholder text in `/tmp` and asserts the public tree has no
`licensed/` directory. Clearance checklist before any toggle-on
outside private testing: exact licensed material identified, rights
holder terms reviewed, written clearance filed, distribution scope
bounded. Until then the toggle has nothing to turn on.

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
