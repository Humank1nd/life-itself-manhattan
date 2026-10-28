# Extraction 006 — Living city preview

On feature branch feat/living-city-tick-20261028, a narrow deterministic
browser adapter implements selected God’s Eye View city behavior.

Source: the founder's local gods-eye-view working copy (at local commit
9264301 plus uncommitted changes). The original source files inspected:
src/life/tick.js, src/life/pedestrianCrowd.js, and
src/life/manhattanStreets.js. The source was NOT modified by this work.

Existing Manhattan street dataset: 11 corridors with 86 surveyed waypoint
positions in the verified Twin Earth ENU frame. The new adapter builds
22 offset sidewalk lanes and seeds 96 walkers at fixed seed 20261028.
Every 5 seconds their positions advance along the sidewalk polylines,
reversing at endpoints. Five zone records use city economic/happiness
transitions adapted from God’s Eye View's tickCity, retaining documented
source limitations.

The WebGL page shows lime points representing walkers, a status line and
a pause/resume button. Each city tick records a hash of the mutable city
snapshot in the existing Rust/JS fallback StateJournal. The original
NYC building dataset hash remains distinct from simulated state.

Validation includes 30-tick deterministic replay, seed variation,
position/bounds checks and short-lane endpoint reversal.

Not included: Unreal Mass AI, detailed pedestrians, exact sidewalk maps,
collision/evasion, full traffic, multiplayer, AI-generated people,
persistent backend simulation, or Quest/WebXR verification.
