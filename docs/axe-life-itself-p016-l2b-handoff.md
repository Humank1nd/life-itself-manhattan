# AXE × Life Itself — Engineering Direction and P016-L2b Assignment

**Founder direction (2026-10-29):** Reorient Life Itself around AXE (Autonomous eXecution Engine) as its **dedicated execution/intelligence layer**, rather than a universal operating system for all projects. This decision does not integrate DreamSuite into AXE or require Unreal Engine in production.

## What the team must know

**Architectural boundaries**
- **Life Itself world core** owns authoritative geography, source/evidence provenance, building BIN/version identity, temporal history, simulated citizen identity, deterministic mechanics, event ledger, relationships, and world state.
- **AXE** performs bounded cognition, agent memory retrieval, deliberation, orchestration, event dispatch, authorization checks and controlled action requests. Agents propose decisions; the world validates and commits events. No model output rewrites historical fact.
- **Renderers** (current Three.js/WebXR, optional Unreal client, optional licensed neural view model) are replaceable. No citizen's identity or memory is tied to a live GPU or inference process. Unreal is optional, not the simulation's source of truth.
- **DreamSuite** is a separate product and possible client/integration, not the new home of AXE. Its Dream Team nomenclature and role separation are distinct from AXE's historic Norse agents.
- Meta Model API / Muse Spark may be an on-demand cognition provider, not physics, storage, or continuous citizen identity. Treat cookbook demonstrations as reference designs: audit logs, crash-resume, approval boundaries, deterministic replay, tool verification, perception and multimodal I/O require independently verified API/library compatibility and rights review before adoption.

**Recovery evidence / legacy donor map**
- `Humank1nd/sacred-timeline/canon/AXE_PROJECT_KNOWLEDGE.md` (dated 2026-02-04) describes the former `D:\AXE` monorepo, Yggdrasil-OS, Norse agents: Styrimadr (orchestrator), Huginn (reasoning), Muninn (memory), Mimir (RAG), Vordr (security), Fylgja (user alignment), Ratatoskr (event bus), Heimdallr (zero-trust), Valkyrie (feedback/training curation), plus CRONUS isolated virtual-desktop worker and LifeItself UE5.
- `Humank1nd/twin-earth-nyc/proof-pack/STATUS_PROOF_PACK.md` records source inspections of `AXESubsystem.cpp`, `LifeItselfGameMode.cpp`, `LifeEntityReplicator.cpp`, FastAPI endpoints `/ping`, `/althing/convene`, `/havamal/state`, as well as Unreal city/time/needs/traffic/navigation code. These are **historical audit claims**, not fresh runtime validation.
- `Humank1nd/dream-caesar/docs/GITHUB_PROJECT_SOURCE_MAP.md` reports no direct Humank1nd/AXE GitHub repo; AXE original Windows-root completeness is **unverified**. Recover from documented source and archived artifacts, never assume missing work or copy an entire donor without auditing interfaces/licensing.
- First investigate, recover, understand, reconcile, engineer, verify. Inventory reusable algorithms and contracts separately from UE dependencies.

**What already landed**
- Phase 015 source-backed current-geometry RGB/depth/BIN captures; historical 2005 fidelity is **not** proven.
- Phase 016 provider-neutral capture envelope and Matrix-Game adapter preparation. LingBot is reference-only under the project decision; Matrix-Game is a research candidate, not the world authority or a deployed Manhattan model.
- PR #21 lifecycle L1 merged; PR #22 review fixes merged: explicit unverified approval flag, valid hashed receipts, exactly one `release-gpu` per actual allocation and audited zero-allocation recovery.
- PR #23 P016-L2a checkpoint contract merged after latest HEAD CI verified. Checkpoint stores hashes, timeline year, simulation snapshot; renderer stays `none`, source history stays authoritative. **This is in-memory validation, not durable persistence/replay.**

## Immediate mission — P016-L2b (no model, no spend)

Build a **source-grounded deterministic live-city shutdown/restart round-trip** using the actual `src/living-city.js` functions `createLivingCity`, `tickLivingCity`, `citySnapshot`. Do not substitute a fabricated simulation-only fixture for the principal test.

1. Recover and inspect creation/ticking, lane geometry, zone and pedestrian state, trait/motive rates, PR #23 checkpoint schema, and existing journal/parity tests. Determine precisely which snapshot fields are needed to resume bit-identically. `citySnapshot` currently contains seed/tick/zones/pedestrians, but omits immutable lanes and some executable state (zone static fields, pedestrian motive rates, world configuration). Do **not** assume direct schema compatibility proves exact deterministic continuation.
2. Design an explicit versioned resumption contract: pinned corridor geometry hash, world configuration, seeded initialization, authoritative source refs, city clock, identities and live mutable state; validate expected source hashes. Either reconstruct immutable state from pinned source data and verify entities against it, or encode audited resumption metadata. Reject incompatible versions and tampered snapshots.
3. Run N deterministic five-second ticks uninterrupted; separately tick to checkpoint K, serialize using JSON, simulate a fresh-process/recreated-city restoration (or equivalent isolated runtime), then continue N−K ticks. Assert identical `citySnapshot`, world summary, trajectories/identity ordering, motives, and event/journal sequence at *each* remaining tick. Compare canonical SHA-256 chain externally to the pure reducer.
4. Negative tests: wrong geometry/version/source hash, dropped/duplicated citizen, altered lane assignment, corrupted personality/motives, replay gap/reordering/duplicate event, stale world snapshot, camera/year historical overclaim, model provider unexpectedly on, and process interruption during write. Require atomic commit semantics in any **future** durable storage implementation.
5. Preserve separate provider-off invariant: no model load, no GPU allocation, no paid APIs or Houston builds. Cloud GitHub Actions ephemeral runner handles tests. Tests must fail on deliberately corrupted fixtures.
6. Artifact policy: small metadata only in git, no massive JSON/checkpoint binaries; cloud artifacts TTL short and auditable. No private credentials or unlicensed generated frames.

**Approval / governance:** Nonempty `providerApprovalId` is NOT authorization. A future external trusted registry must validate an exact approved action/model/cost/destination before real provider allocation. No automatic approval or production activation.

**Evidence/acceptance:** PR with actual source code, reproducible hosted tests, mutated-case failures, exact commit head + workflow run, and independent review. Passing schema tests alone is **not L2 completion**. Avoid merging to main without review. Separate longer-term AXE porting into subsequent slices: agent event/command interface, memory adapters, security receipts, and bounded model calls.

**Mission-control handoff:** AXE should power actions within Life Itself, not *be* Life Itself. The world survives every agent and renderer going offline.
