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

## Explicitly out of Phase A

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
