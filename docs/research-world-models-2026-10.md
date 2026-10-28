# Research note — World models, October 2026

Compiled by the ChatGPT lane from a September 28 – October 28, 2026
research window; relayed by the founder and filed here on
2026-10-28 so future passes do not have to re-derive it.

**Verification status (Muse, 2026-10-28):** the three headline
papers marked VERIFIED were read firsthand at their arXiv abstracts —
titles, dates, and headline claims confirmed against the abstracts
themselves. Everything else is lane-reported and has NOT been
independently verified. Availability notes come from project pages
and repositories the lane inspected; nothing here has been installed
or run on our hardware, and nothing has been demonstrated in WebXR.
Matrix-Game's own abstract bottoms out at a desktop RTX 5070 Ti
(58 FPS); treat all performance figures as the papers' claims under
the papers' conditions.

## The five most relevant

1. **Matrix-Game 4.0** — arXiv:2610.27999, Oct 20, Skywork AI and
   collaborators. VERIFIED. A lightweight engine maintains world
   state and executes rules; an autoregressive video renderer turns
   engine-rendered low-poly proxies into detailed visuals, guided by
   dynamic captions and memory references. 480p at 60 FPS on a single
   RTX 5090, 112 ms key-press-to-display latency; code, model
   weights, and low-poly assets released.
   *Manhattan reading:* render the verified city geometry plainly,
   then let a neural renderer enhance appearance — the engine stays
   the authority.
2. **AEON: Unifying Video and 3D World Models** — arXiv:2610.28631,
   Oct 20, Weiqi Zhang and collaborators. VERIFIED. Bridges video
   generation and 3D world models by producing renderable 4D
   Gaussian Splatting as the explicit world representation, with
   camera poses and dynamics.
   *Manhattan reading:* a research architecture for joining
   photographic evidence, reconstructed geometry, and change over
   time. To evaluate, not an integrated component.
3. **PPMem: Persistent Planar Memory for Video World Models** —
   arXiv:2610.23795, Oct 16, Yuze He and collaborators. VERIFIED.
   Persistent scene memory as oriented plane primitives — the
   abstract names walls, floors, and façades — roughly 100K
   primitives in about 5 MB for a full scene, three orders of
   magnitude more compact than per-pixel point clouds.
   *Manhattan reading:* the strongest research match for the
   glass-plate direction: façades as spatially oriented planes
   associated with dated photographs. Lane reports code and weights
   released, ~19 GiB VRAM typical, 24 GB GPU recommended.
4. **Velox: Spatial Memory Makes World Models Efficient** —
   arXiv:2610.22311, Oct 15, Qiuhong Shen and collaborators.
   Lane-reported. Routes attention to spatially relevant past
   observations using camera frustums and depth; reports 4.36×
   faster attention and 2.43× faster denoising at the evaluated
   48th chunk against its dense baseline. Code pending per lane.
   *Manhattan reading:* retrieve visual memory near the current
   view instead of reprocessing the whole city's history.
5. **Orbia: Do Generated Videos Form a Consistent 3D World?** —
   arXiv:2610.20693, Oct 14, Dongyue Lu and collaborators.
   Lane-reported. A consistency evaluation across 720 instances:
   do places stay geometrically and visually stable after the
   camera leaves and returns?
   *Manhattan reading:* a benchmark frame for asking whether a
   generated building is recognizably the same building across
   angles and repeat visits.

## Also directly relevant

- **LoGo: Local-Global Rewards for Consistent Long-Horizon Video
  Generation** — arXiv:2610.03636, Oct 2, World Labs / Caltech.
  Lane-reported. Scores localized 3D errors instead of one global
  quality number, so a single building's drift can be targeted.
  Ships the TrajectoryBench benchmark. *Manhattan reading:*
  per-building consistency checks across views and time slices —
  the same granularity our per-BIN evidence records already use.
- **CtrlCache** — arXiv:2610.08777, Oct 6, Shangye Song and
  collaborators. Lane-reported. Control-aware caching evaluated
  directly on LingBot-World v1 and v2; DiT speedups of 1.21×–1.41×
  without retraining. *Worth studying alongside the LingBot
  installation on Houston; says nothing about WebXR frame rates.*

## Library shelf (lane-reported, one line each)

| Paper | Date | Why it matters here |
| --- | --- | --- |
| GEAR: Geometry as Address | Sep 28 | Geometry retrieves the right historical visual evidence for a façade — the same move Extraction 011 makes with records |
| LOCI: Spatial Linear Memory | Sep 30 | Compact recurrent memory plus accessible past observations |
| 4Director | Oct 1 | Explicit 3D geometry and camera trajectories control generation |
| WorldCast | Oct 8 | Distributed clients share player and scene state |
| WorldMemBench | Oct 13 | Tests whether static geometry and changing events stay consistent |
| Video World Models Need Predictable Latents | Oct 26 | Up to 5× cheaper inference from more predictable latents |

Survey: **Reading, Writing, Sharing, and Interacting with the World
through Video** — arXiv:2610.31668, Oct 22; 102 pages across world
representations, generation, interaction, persistence, benchmarks.

## The lane's proposed synthesis (PROPOSED, not built)

Evidence (building IDs, geometry, dated photographs, façade masks)
→ spatial memory on PPMem + GEAR principles → persistent simulation
(building history, agents, world state) → neural visual renderer
(LingBot experiments, Matrix-Game principles, AEON research) →
WebXR experience. Study order proposed by the lane: PPMem and GEAR
first; Matrix-Game as architectural reference; LoGo and Orbia for
consistency measurement.

## The conclusion both lanes share

The world model is not the authoritative database of Manhattan.
The geographic and historical database remains the authority; the
model learns to produce consistent, navigable observations of it.
That is already this repository's architecture (the Rust core and
the records own the truth; rendering and models work from them),
and it is the founder's long-standing Life Itself position: the
world model is the imagination layer, not the source of truth.
